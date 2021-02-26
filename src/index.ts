import { PassThrough } from 'stream'

import {
    Cache,
    CommandContext,
    Configuration,
    Ident,
    Manifest,
    Plugin,
    Project,
    StreamReport,
    miscUtils,
} from '@yarnpkg/core'
import { npath, ppath } from '@yarnpkg/fslib'
import { Command, Option, Usage } from 'clipanion'
import junitBuilder from 'junit-report-builder'

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
}

type LicensePredicate = (license: string) => boolean

class ResultMap<K, V> {
    private _map: Map<K, V>
    private _defaultValue: V

    constructor(defaultValue: V) {
        this._map = new Map<K, V>()
        this._defaultValue = defaultValue
    }

    get(key: K): V {
        if (!this._map.has(key)) {
            this._map.set(key, this._defaultValue)
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this._map.get(key)!
    }

    set(key: K, value: V): void {
        this._map.set(key, value)
    }

    has(key: K): boolean {
        return this._map.has(key)
    }

    merge(key: K, value: Partial<V>): void {
        const entry = this.get(key)
        this.set(key, { ...entry, ...value })
    }

    entries(): IterableIterator<[K, V]> {
        return this._map.entries()
    }
}

const identToFullName = (ident: Ident): string => {
    if (ident.scope) {
        return `@${ident.scope}/${ident.name}`
    }
    return ident.name
}

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
        const configuration = await Configuration.find(
            this.context.cwd,
            this.context.plugins,
        )
        const { project } = await Project.find(configuration, this.context.cwd)
        const cache = await Cache.find(configuration)

        await project.restoreInstallState()

        await this.parseConfigFile()

        const fetcher = await configuration.makeFetcher()
        const report = new StreamReport({
            stdout: new PassThrough(),
            configuration,
        })

        const results = {
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
            const result = { license: license || undefined, reason }

            const fullName = identToFullName(pkg)
            if (this.ignorePackages.has(fullName)) {
                results.ignored.merge(fullName, result)
            } else if (pass) {
                results.pass.merge(fullName, result)
            } else {
                results.fail.merge(fullName, result)
            }
        }

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

        if (this.outputFile) {
            if (this.outputFile === '-') {
                this.context.stdout.write(junitBuilder.build())
            } else {
                junitBuilder.writeTo(this.outputFile)
            }
        }

        if (this.summary) {
            this.context.stdout.write('Summary...')
        }

        return 0
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
