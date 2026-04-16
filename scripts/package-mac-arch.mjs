import { spawn } from 'node:child_process'
import { access, readFile, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const VALID_ARCHES = new Set(['arm64', 'x64'])
const args = process.argv.slice(2)
const arch = args[0]
const dryRun = args.includes('--dry-run')

if (!VALID_ARCHES.has(arch)) {
  console.error('Usage: node scripts/package-mac-arch.mjs <arm64|x64> [--dry-run]')
  process.exit(1)
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')

if (dryRun) {
  console.log(
    JSON.stringify(
      {
        arch,
        command: [
          process.execPath,
          'scripts/run-with-clean-electron-env.mjs',
          'electron-builder',
          '--mac',
          'dmg',
          `--${arch}`,
        ],
        metadataRename: `release/<version>/latest-mac.yml -> release/<version>/latest-mac-${arch}.yml`,
      },
      null,
      2,
    ),
  )
  process.exit(0)
}

await runElectronBuilder(repoRoot, arch)
await renameLatestMacMetadata(repoRoot, arch)

function runElectronBuilder(cwd, targetArch) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        'scripts/run-with-clean-electron-env.mjs',
        'electron-builder',
        '--mac',
        'dmg',
        `--${targetArch}`,
      ],
      {
        cwd,
        stdio: 'inherit',
        env: process.env,
      },
    )
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(
        new Error(
          signal
            ? `electron-builder terminated by signal: ${signal}`
            : `electron-builder exited with code ${code ?? 'unknown'}`,
        ),
      )
    })
    child.on('error', reject)
  })
}

async function renameLatestMacMetadata(cwd, targetArch) {
  const packageJson = JSON.parse(
    await readFile(path.join(cwd, 'package.json'), 'utf8'),
  )
  const releaseDir = path.join(cwd, 'release', packageJson.version)
  const source = path.join(releaseDir, 'latest-mac.yml')
  const destination = path.join(releaseDir, `latest-mac-${targetArch}.yml`)

  await access(source)
  await rm(destination, { force: true })
  await rename(source, destination)
  console.log(`Renamed latest-mac.yml -> latest-mac-${targetArch}.yml`)
}
