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
    structUtils,
} from '@yarnpkg/core'
import { FakeFS, PortablePath, npath, ppath } from '@yarnpkg/fslib'
import { Command, Option, Usage } from 'clipanion'
import junitBuilder from 'junit-report-builder'

import { ResultMap, prettifyLocator, printTable } from './utils'

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

type LicensePredicate = (license: string, isFile: boolean) => boolean

type PackageNamePredicate = (packageName: string) => boolean

const LICENSE_FILES = ['./LICENSE', './LICENCE']

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
    looseMode: boolean = Option.Boolean('--loose', false)

    ignorePackagesPredicate: PackageNamePredicate = () => false
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
                looseMode: this.looseMode,
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

        const ignorePackages = config?.ignorePackages
        if (ignorePackages) {
            if (typeof ignorePackages === 'function') {
                this.ignorePackagesPredicate = ignorePackages
            } else if (ignorePackages instanceof RegExp) {
                this.ignorePackagesPredicate = (license: string) =>
                    ignorePackages.test(license)
            } else if (
                ignorePackages instanceof Set ||
                ignorePackages instanceof Array
            ) {
                const ignorePackagesSet = new Set<string>(ignorePackages)
                this.ignorePackagesPredicate = (packageName: string) =>
                    ignorePackagesSet.has(packageName)
            }
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
        looseMode,
    }: {
        configuration: Configuration
        project: Project
        looseMode: boolean
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
            if (structUtils.isVirtualLocator(pkg)) continue
            if (pkg.reference.startsWith('workspace:')) continue

            const { packageFs, prefixPath } = await fetcher.fetch(pkg, {
                project,
                fetcher,
                cache,
                report,
                checksums: project.storedChecksums,
            })

            let manifest: Manifest | null = null

            try {
                manifest = await Manifest.find(prefixPath, {
                    baseFs: packageFs,
                })
            } catch {
                continue
            }

            try {
                const { license, licenseFile } = await this.parseLicense({
                    manifest,
                    packageFs,
                    prefixPath,
                    looseMode,
                })
                const { reason, pass } = await this.isAllowableLicense({
                    license: license || licenseFile || null,
                    isFile: Boolean(licenseFile),
                })
                const result = {
                    license: license || undefined,
                    reason,
                    repository: manifest.raw?.repository?.url || undefined,
                }

                const fullName = structUtils.stringifyIdent(pkg)
                const fullNameWithRef = prettifyLocator(pkg)

                // ignorePackages operates without reference
                if (this.ignorePackagesPredicate(fullName)) {
                    results.ignored.merge(fullNameWithRef, result)
                } else if (pass) {
                    results.pass.merge(fullNameWithRef, result)
                } else {
                    results.fail.merge(fullNameWithRef, result)
                }
            } catch {
                continue
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
            stdout.write(`${junitBuilder.build()}\n`)
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
                    `\nNOTE: For false positives, exceptions may be added to: ${this.configFile}\n\n`,
                )
            }
        } else {
            stdout.write('All packages have compatible licenses.\n')
        }
    }

    parseLicenseManifestField(field: unknown): string | null {
        if (Array.isArray(field)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const licenses = field as Array<any>
            return String(licenses[0]?.type ?? '')
        }
        if (typeof field === 'string' || field === String(field)) {
            return String(field)
        }
        return null
    }

    async parseLicense({
        manifest,
        packageFs,
        prefixPath,
        looseMode,
    }: {
        manifest: Manifest
        packageFs: FakeFS<PortablePath>
        prefixPath: PortablePath
        looseMode: boolean
    }): Promise<{ license?: string; licenseFile?: string }> {
        // "licenses" is not valid syntax, and the license metadata should be fixed upstream,
        // however it's still a valid license, so we'll try parse it
        const license =
            this.parseLicenseManifestField(
                manifest.license ?? manifest.raw.licenses,
            ) ?? ''
        if (
            (!license || new RegExp('see license', 'i').test(license)) &&
            looseMode
        ) {
            for (const filename of LICENSE_FILES) {
                try {
                    const licensePath = ppath.join(
                        prefixPath,
                        npath.toPortablePath(filename),
                    )
                    return {
                        licenseFile: await packageFs.readFilePromise(
                            licensePath,
                            'utf8',
                        ),
                    }
                } catch {}
            }
        }
        return { license }
    }

    async isMissing({ license }: { license: string }): Promise<boolean> {
        const pattern = new RegExp('\\b(unknown|see license)\\b', 'i')
        return pattern.test(license)
    }

    async isAllowableLicense({
        license,
        isFile,
    }: {
        license: string | null
        isFile: boolean
    }): Promise<LicenseCheckResult> {
        if (license && !(await this.isMissing({ license }))) {
            if (this.isValidLicensePredicate(license, isFile)) {
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
