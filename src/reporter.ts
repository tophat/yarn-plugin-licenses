import { Writable } from 'stream'

import junitBuilder from 'junit-report-builder'

import { LICENSE_FAILURE_TYPE, LicenseResults } from './types'
import { printTable } from './utils'

const PRINTABLE_REASON: { [k in LICENSE_FAILURE_TYPE]: string } = {
    missing: 'License could not be found.',
    incompatible: 'License is incompatible.',
}

export async function buildJUnitReport({
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
        testCase.standardOutput(
            Object.entries(result)
                .map((p) => p.join(': '))
                .join('\n'),
        )
        if (results.ignored.has(name)) {
            testCase.skipped()
        } else if (result.reason) {
            testCase.failure(
                `License: ${result.license}. Reason: ${PRINTABLE_REASON[result.reason]}`,
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

export async function printSummary({
    results,
    stdout,
    configFilename,
}: {
    results: LicenseResults
    stdout: Writable
    configFilename?: string
}): Promise<void> {
    const isFailure = results.fail.size !== 0

    if (isFailure) {
        const table = [['Package', 'License', 'Reason', 'Repository']]
        const summaryResults = [...results.fail.entries()].map(([name, result]) => [
            name,
            String(result.license || '?'),
            String(result.reason || '?'),
            String(result.repository || '?'),
        ])
        table.push(...summaryResults)
        printTable(table, stdout)
        if (configFilename) {
            stdout.write(
                `\nNOTE: For false positives, exceptions may be added to: ${configFilename}\n\n`,
            )
        }
    } else {
        stdout.write('All packages have compatible licenses.\n')
    }
}
