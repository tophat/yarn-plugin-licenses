import { Manifest } from '@yarnpkg/core'
import { NodeFS } from '@yarnpkg/fslib'

import { parseLicense } from '../src/parsers'

import { setupProject } from './helpers'

describe('parseLicense', () => {
    it.each([
        // preferred styles
        [{ license: 'MIT' }, 'MIT'],
        [{ license: '(MIT OR Apache-2.0)' }, '(MIT OR Apache-2.0)'],

        // deprecated styles
        [
            { licenses: [{ type: 'MIT' }, { type: 'Apache-2.0' }] },
            '(MIT OR Apache-2.0)',
        ],
        [
            {
                license: {
                    type: 'ISC',
                    url: 'https://opensource.org/licenses/ISC',
                },
            },
            'ISC',
        ],
    ])('parses %s as %s', async (field, expected) => {
        const { cwd, writeFile } = await setupProject()
        const manifestName = await writeFile('package.json', { ...field })

        const nodeFs = new NodeFS()

        const manifest = await Manifest.fromFile(manifestName)
        const { license } = await parseLicense({
            manifest,
            packageFs: nodeFs,
            prefixPath: cwd,
            looseMode: false,
        })

        expect(license).toEqual(expected)
    })

    it.each(['LICENSE', 'LICENCE'])(
        'fallback to %s file in loose mode if no license in manifest',
        async name => {
            const { cwd, writeFile } = await setupProject()
            const manifestName = await writeFile('package.json', {})

            const nodeFs = new NodeFS()
            const manifest = await Manifest.fromFile(manifestName)
            const { license, licenseFile } = await parseLicense({
                manifest,
                packageFs: nodeFs,
                prefixPath: cwd,
                looseMode: false,
            })
            expect(license).toBeFalsy()
            expect(licenseFile).toBeFalsy()

            // write license file
            await writeFile(name, 'Apache License')

            // still false because loose mode is disabled
            const {
                license: license1,
                licenseFile: licenseFile1,
            } = await parseLicense({
                manifest,
                packageFs: nodeFs,
                prefixPath: cwd,
                looseMode: false,
            })
            expect(license1).toBeFalsy()
            expect(licenseFile1).toBeFalsy()

            // loose mode enabled
            const {
                license: license2,
                licenseFile: licenseFile2,
            } = await parseLicense({
                manifest,
                packageFs: nodeFs,
                prefixPath: cwd,
                looseMode: true,
            })
            expect(license2).toBeFalsy()
            expect(licenseFile2).toEqual('Apache License')
        },
    )
})
