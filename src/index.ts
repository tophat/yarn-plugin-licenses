import { PassThrough } from 'stream'

import {
    Cache,
    CommandContext,
    Configuration,
    Manifest,
    Plugin,
    Project,
    StreamReport,
} from '@yarnpkg/core'
import { Command, Option, Usage } from 'clipanion'

class AuditLicensesCommand extends Command<CommandContext> {
    static paths = [['licenses', 'audit']]

    static usage: Usage = Command.Usage({
        description: '',
        details: '',
        examples: [],
    })

    outputFile?: string = Option.String('--output-file')
    configFile?: string = Option.String('--config')
    summary: boolean = Option.Boolean('--summary', false)
    includeTransitive: boolean = Option.Boolean('--include-transitive', false)

    async execute(): Promise<number> {
        // this.context.stdout.write('Running audit script...')

        const configuration = await Configuration.find(
            this.context.cwd,
            this.context.plugins,
        )
        const { project } = await Project.find(configuration, this.context.cwd)
        const cache = await Cache.find(configuration)

        await project.restoreInstallState()

        const fetcher = await configuration.makeFetcher()
        const report = new StreamReport({
            stdout: new PassThrough(),
            configuration,
        })

        for (const pkg of project.storedPackages.values()) {
            // TODO: if includeTransitive is false, check if in workspace manifest / use different store to reduce iterable

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
            console.log(pkg.name, license)
        }

        return 0
    }

    async parseLicense({
        manifest,
    }: {
        manifest: Manifest
    }): Promise<string | null> {
        return manifest.license
    }
}

const plugin: Plugin = {
    hooks: {},
    commands: [AuditLicensesCommand],
}

export default plugin
