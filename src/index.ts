import { PassThrough } from 'stream'

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
import { npath, ppath } from '@yarnpkg/fslib'
import { Command, Option, Usage } from 'clipanion'

import { isAllowableLicense, parseLicense } from './parsers'
import { buildJUnitReport, printSummary } from './reporter'
import { LicensePredicate, LicenseResults, PackageNamePredicate, Result } from './types'
import { ResultMap, prettifyLocator } from './utils'

class AuditLicensesCommand extends Command<
    CommandContext & { env: Record<string, string | undefined> }
> {
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
            const configuration = await Configuration.find(this.context.cwd, this.context.plugins)
            const { project } = await Project.find(configuration, this.context.cwd)

            await project.restoreInstallState()

            await this.parseConfigFile()

            const results = await this.collectResults({
                configuration,
                project,
                looseMode: this.looseMode,
            })

            await buildJUnitReport({
                results,
                outputFile: this.outputFile,
                stdout: this.context.stdout,
            })

            if (this.summary) {
                await printSummary({
                    results,
                    stdout: this.context.stdout,
                    configFilename: this.configFile,
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

        const configPPath = ppath.resolve(ppath.cwd(), npath.toPortablePath(this.configFile))
        const config = miscUtils.dynamicRequire(configPPath)

        const ignorePackages = config?.ignorePackages
        if (ignorePackages) {
            if (typeof ignorePackages === 'function') {
                this.ignorePackagesPredicate = ignorePackages
            } else if (ignorePackages instanceof RegExp) {
                this.ignorePackagesPredicate = (license: string) => ignorePackages.test(license)
            } else if (ignorePackages instanceof Set || ignorePackages instanceof Array) {
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
                const { license, licenseFile } = await parseLicense({
                    manifest,
                    packageFs,
                    prefixPath,
                    looseMode,
                })
                const { reason, pass } = await isAllowableLicense({
                    license: license || licenseFile || null,
                    isFile: Boolean(licenseFile),
                    isValidLicensePredicate: this.isValidLicensePredicate,
                })
                const result = {
                    homepage: manifest.raw?.homepage,
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
}

const plugin: Plugin = {
    hooks: {},
    commands: [AuditLicensesCommand],
}

export default plugin
