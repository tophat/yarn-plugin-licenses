import { Manifest } from '@yarnpkg/core'
import { FakeFS, PortablePath, npath, ppath } from '@yarnpkg/fslib'

import { LicenseCheckResult, LicensePredicate } from './types'

const LICENSE_FILES = ['./LICENSE', './LICENCE']
function coerceToString(field: unknown): string | null {
    const string = String(field)
    return typeof field === 'string' || field === string ? string : null
}

function parseLicenseManifestField(field: unknown): string | null {
    if (Array.isArray(field)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const licenses = field as Array<any>
        const licenseTypes = licenses.reduce((licenseTypes, license) => {
            const type = coerceToString(license.type)
            if (type) {
                licenseTypes.push(type)
            }
            return licenseTypes
        }, [])

        return licenseTypes.length > 1
            ? `(${licenseTypes.join(' OR ')})`
            : licenseTypes[0] ?? null
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (field as any)?.type ?? coerceToString(field)
}

export async function parseLicense({
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
        parseLicenseManifestField(
            manifest.license ?? manifest.raw.licenses ?? manifest.raw.license,
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

async function isMissing({ license }: { license: string }): Promise<boolean> {
    const pattern = new RegExp('\\b(unknown|see license)\\b', 'i')
    return pattern.test(license)
}

export async function isAllowableLicense({
    license,
    isFile,
    isValidLicensePredicate,
}: {
    license: string | null
    isFile: boolean
    isValidLicensePredicate: LicensePredicate
}): Promise<LicenseCheckResult> {
    if (license && !(await isMissing({ license }))) {
        if (isValidLicensePredicate(license, isFile)) {
            return { pass: true }
        }
        return { pass: false, reason: 'incompatible' }
    }
    return { reason: 'missing', pass: false }
}
