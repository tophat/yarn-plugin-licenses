declare module 'junit-report-builder' {
    interface TestCase {
        name(v: string): TestCase
        failure(a: string, b: string): void
        skipped(): void
        standardError(a: string): void
        standardOutput(a: string): void
    }

    interface TestSuite {
        name(v: string): TestSuite
        testCase(): TestCase
    }

    interface Builder {
        testSuite(): TestSuite
        build(): string
        writeTo(filename: string): void
    }

    const builder: Builder

    export default builder
}
