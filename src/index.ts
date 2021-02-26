import { PassThrough, Writable } from 'stream'

import {
    Cache,
    CommandContext,
    Configuration,
    Manifest,
    Plugin,
    Project,
    StreamReport,
    miscUtils,
} from '@yarnpkg/core'
import { npath, ppath } from '@yarnpkg/fslib'
import { Command, Option, Usage } from 'clipanion'
import junitBuilder from 'junit-report-builder'

import { ResultMap, identToFullName, printTable } from './utils'

type LICENSE_FAILURE_TYPE = 'missing' | 'incompatible'

const PRINTABLE_REASON: { [k in LICENSE_FAILURE_TYPE]: string } = {
    missing: 'License could not be found.',
    incompatible: 'License is incompatible.',
}

type LicenseCheckResult = {
    reason?: LICENSE_FAILURE_TYPE
    pass: boolean
}

type Result = {
    reason?: LICENSE_FAILURE_TYPE
    license?: string
    repository?: string
}

type LicenseResults = {
    pass: ResultMap<string, Result>
    fail: ResultMap<string, Result>
    ignored: ResultMap<string, Result>
}

type LicensePredicate = (license: string) => boolean
class AuditLicensesCommand extends Command<CommandContext> {
    static paths = [['licenses', 'audit']]

    static usage: Usage = Command.Usage({
        description: '',
        details: '',
        examples: [],
    })

    outputFile?: string = Option.String('--output-file', { required: false })
    configFile?: string = Option.String('--config', { required: false })
    summary: boolean = Option.Boolean('--summary', false)

    ignorePackages = new Set<string>()
    isValidLicensePredicate: LicensePredicate = () => false

    async execute(): Promise<number> {
        try {
            const configuration = await Configuration.find(
                this.context.cwd,
                this.context.plugins,
            )
            const { project } = await Project.find(
                configuration,
                this.context.cwd,
            )

            await project.restoreInstallState()

            await this.parseConfigFile()

            const results = await this.collectResults({
                configuration,
                project,
            })

            await this.buildJUnitReport({
                results,
                outputFile: this.outputFile,
                stdout: this.context.stdout,
            })

            if (this.summary) {
                await this.printSummary({
                    results,
                    stdout: this.context.stdout,
                })
            }

            return results.fail.size === 0 ? 0 : 1
        } catch (err) {
            this.context.stderr.write(`${String(err)}\n`)
            return 1
        }
    }

    async parseConfigFile(): Promise<void> {
        if (!this.configFile) return

        const configPPath = ppath.resolve(
            ppath.cwd(),
            npath.toPortablePath(this.configFile),
        )
        const config = miscUtils.dynamicRequireNoCache(configPPath)
        const ignorePackages: string[] | undefined = config?.ignorePackages
        if (ignorePackages) {
            this.ignorePackages = new Set<string>(ignorePackages)
        }
        const isValidLicensePredicate = config?.isValidLicense
        if (isValidLicensePredicate) {
            if (typeof isValidLicensePredicate === 'function') {
                this.isValidLicensePredicate = isValidLicensePredicate
            } else if (isValidLicensePredicate instanceof RegExp) {
                this.isValidLicensePredicate = (license: string) =>
                    isValidLicensePredicate.test(license)
            } else {
                throw new Error('Invalid config option value: isValidLicense')
            }
        }
    }

    async collectResults({
        configuration,
        project,
    }: {
        configuration: Configuration
        project: Project
    }): Promise<LicenseResults> {
        const cache = await Cache.find(configuration)
        const fetcher = await configuration.makeFetcher()
        const report = new StreamReport({
            stdout: new PassThrough(),
            configuration,
        })

        const results: LicenseResults = {
            pass: new ResultMap<string, Result>({}),
            fail: new ResultMap<string, Result>({}),
            ignored: new ResultMap<string, Result>({}),
        }

        for (const pkg of project.storedPackages.values()) {
            const { packageFs, prefixPath } = await fetcher.fetch(pkg, {
                project,
                fetcher,
                cache,
                report,
                checksums: project.storedChecksums,
            })

            const manifest = await Manifest.find(prefixPath, {
                baseFs: packageFs,
            })

            const license = await this.parseLicense({
                manifest,
            })
            const { reason, pass } = await this.isAllowableLicense({
                license,
            })
            const result = {
                license: license || undefined,
                reason,
                repository: manifest.raw?.repository?.url || undefined,
            }

            const fullName = identToFullName(pkg)
            const fullNameWithRef = `${fullName}@${pkg.reference}`

            // ignorePackages operates without reference
            if (this.ignorePackages.has(fullName)) {
                results.ignored.merge(fullNameWithRef, result)
            } else if (pass) {
                results.pass.merge(fullNameWithRef, result)
            } else {
                results.fail.merge(fullNameWithRef, result)
            }
        }

        return results
    }

    async buildJUnitReport({
        results,
        outputFile,
        stdout,
    }: {
        results: LicenseResults
        outputFile?: string
        stdout: Writable
    }): Promise<void> {
        if (!outputFile) return

        const suite = junitBuilder.testSuite().name('Dependency Licenses Audit')
        for (const [name, result] of [
            ...results.pass.entries(),
            ...results.fail.entries(),
            ...results.ignored.entries(),
        ].sort()) {
            const testCase = suite.testCase().name(name)
            if (results.ignored.has(name)) {
                testCase.skipped()
            } else if (result.reason) {
                testCase.failure(
                    `License: ${result.license}. Reason: ${
                        PRINTABLE_REASON[result.reason]
                    }`,
                    result.reason,
                )
            }
        }

        if (outputFile === '-') {
            stdout.write(junitBuilder.build())
        } else {
            junitBuilder.writeTo(outputFile)
        }
    }

    async printSummary({
        results,
        stdout,
    }: {
        results: LicenseResults
        stdout: Writable
    }): Promise<void> {
        const isFailure = results.fail.size !== 0

        if (isFailure) {
            const table = [['Package', 'License', 'Reason', 'Repository']]
            const summaryResults = [
                ...results.fail.entries(),
            ].map(([name, result]) => [
                name,
                String(result.license || '?'),
                String(result.reason || '?'),
                String(result.repository || '?'),
            ])
            table.push(...summaryResults)
            printTable(table, stdout)
            if (this.configFile) {
                stdout.write(
                    `\nNOTE: For false positives, exceptions may be added to: ${this.configFile}\n`,
                )
            }
        } else {
            stdout.write('All packages have compatible licenses.\n')
        }
    }

    async parseLicense({
        manifest,
    }: {
        manifest: Manifest
    }): Promise<string | null> {
        return manifest.license
    }

    async isMissing({ license }: { license: string }): Promise<boolean> {
        const pattern = new RegExp('\\b(unknown|see license)\\b', 'i')
        return pattern.test(license)
    }

    async isAllowableLicense({
        license,
    }: {
        license: string | null
    }): Promise<LicenseCheckResult> {
        if (license && !(await this.isMissing({ license }))) {
            if (this.isValidLicensePredicate(license)) {
                return { pass: true }
            }
            return { pass: false, reason: 'incompatible' }
        }
        return { reason: 'missing', pass: false }
    }
}

const plugin: Plugin = {
    hooks: {},
    commands: [AuditLicensesCommand],
}

export default plugin
