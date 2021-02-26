import { Writable } from 'stream'

export class ResultMap<K, V> {
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

    get size(): number {
        return this._map.size
    }
}

export const printTable = (array: string[][], streamOut: Writable): void => {
    const headers = array.shift()
    if (!headers) return

    array = array.sort((a, b) => a[0].localeCompare(b[0]))
    array.unshift(headers)

    const gutterSize = 2
    const widths = headers.map(h => h.length + gutterSize)
    array.forEach(row =>
        row.forEach((datum, index) => {
            widths[index] = Math.max(widths[index], datum.length + gutterSize)
        }),
    )

    const padColumn = (datum: string, index: number) =>
        `${datum}${' '.repeat(Math.max(0, widths[index] - datum.length))}`

    array.forEach(row => streamOut.write(`${row.map(padColumn).join('  ')}\n`))
}
