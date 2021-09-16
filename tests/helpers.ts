import fs from 'fs'
import os from 'os'
import path from 'path'

import { PortablePath, npath } from '@yarnpkg/fslib'

const trackedTmpDirs = new Set<string>()

afterEach(async () => {
    for (const tmpDir of trackedTmpDirs) {
        try {
            await fs.promises.rm(tmpDir, { recursive: true })
        } catch {
            /*ignore*/
        }
    }
    trackedTmpDirs.clear()
})

interface Project {
    cwd: PortablePath
    writeFile(
        filename: string,
        data: string | Record<string, unknown>,
    ): Promise<PortablePath>
}

export async function setupProject(): Promise<Project> {
    const tmpDir = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), 'licenses-'),
    )
    trackedTmpDirs.add(tmpDir)

    async function writeFile(filename, data) {
        const fullpath = path.resolve(tmpDir, filename)
        await fs.promises.writeFile(
            fullpath,
            typeof data === 'string' ? data : JSON.stringify(data, null, 4),
            'utf-8',
        )
        return npath.toPortablePath(fullpath)
    }
    return {
        cwd: npath.toPortablePath(tmpDir),
        writeFile,
    }
}
