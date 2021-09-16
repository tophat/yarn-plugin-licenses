import { ResultMap } from './utils'

export type LICENSE_FAILURE_TYPE = 'missing' | 'incompatible'

export type LicenseCheckResult = {
    reason?: LICENSE_FAILURE_TYPE
    pass: boolean
}

export type Result = {
    reason?: LICENSE_FAILURE_TYPE
    license?: string
    repository?: string
}

export type LicenseResults = {
    pass: ResultMap<string, Result>
    fail: ResultMap<string, Result>
    ignored: ResultMap<string, Result>
}

export type LicensePredicate = (license: string, isFile: boolean) => boolean

export type PackageNamePredicate = (packageName: string) => boolean
