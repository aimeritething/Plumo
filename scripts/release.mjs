// Cutting a version of Plumo (docs/releasing.md).
//
//   pnpm release <version>            write the version, commit it and tag it `v<version>`
//   pnpm release notes <version>      print that version's section of CHANGELOG.md
//   pnpm release verify <tag>         check a tag against the version in the files (CI)
//   pnpm release manifest <version> <signature-file>
//                                     print the updater's `latest.json` (CI)
//
// The version lives in `package.json` and `src-tauri/Cargo.toml` (and the
// lock file beside it); `tauri.conf.json` carries none and takes Cargo's.
// Nothing here pushes: `git push --follow-tags` is the step that starts the
// release workflow, and it stays a person's.
import { execFileSync } from 'node:child_process'
import console from 'node:console'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const repoRoot = path.resolve(import.meta.dirname, '..')
const REPOSITORY = 'aimeritething/Plumo'
const RELEASE_BRANCH = 'main'
/** The one platform Plumo ships for, as the updater names it. */
const UPDATER_PLATFORM = 'darwin-aarch64'

const VERSION_PATTERN = /^\d+\.\d+\.\d+(-[0-9A-Za-z]+(\.[0-9A-Za-z]+)*)?$/

class ReleaseError extends Error {}

function fail(message) {
  throw new ReleaseError(message)
}

function read(file) {
  return readFileSync(path.join(repoRoot, file), 'utf8')
}

function write(file, content) {
  writeFileSync(path.join(repoRoot, file), content)
}

function git(...args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim()
}

export function assertVersion(version) {
  if (!VERSION_PATTERN.test(version ?? '')) fail(`Not a version: ${version ?? '(none)'}. Expected e.g. 0.1.0 or 0.1.0-beta.1.`)
  return version
}

/** The file name of a release asset: `Plumo_0.1.0_aarch64.dmg`. */
export function assetName(version, extension) {
  return `Plumo_${version}_aarch64.${extension}`
}

/**
 * A version's section of the changelog: the lines under its `## <version>`
 * heading up to the next `## ` heading, trimmed. Null when there is no such
 * heading or nothing under it.
 */
export function changelogSection(changelog, version) {
  const lines = changelog.split('\n')
  const start = lines.findIndex((line) => line.trim() === `## ${version}`)
  if (start === -1) return null
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => line.startsWith('## '))
  const section = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim()
  return section === '' ? null : section
}

/** `Cargo.toml` with the `[package]` table's version replaced. */
export function withCargoVersion(cargoToml, version) {
  const pattern = /(\[package\][^[]*?\nversion = ")[^"]*(")/
  if (!pattern.test(cargoToml)) fail('No version in the [package] table of src-tauri/Cargo.toml')
  return cargoToml.replace(pattern, `$1${version}$2`)
}

/** `Cargo.lock` with the `plumo` package's version replaced. */
export function withCargoLockVersion(cargoLock, version) {
  const pattern = /(\[\[package\]\]\nname = "plumo"\nversion = ")[^"]*(")/
  if (!pattern.test(cargoLock)) fail('No plumo package in src-tauri/Cargo.lock')
  return cargoLock.replace(pattern, `$1${version}$2`)
}

/** `package.json` with its version replaced, the rest of the file byte for byte. */
export function withPackageVersion(packageJson, version) {
  const pattern = /("version":\s*")[^"]*(")/
  if (!pattern.test(packageJson)) fail('No version in package.json')
  return packageJson.replace(pattern, `$1${version}$2`)
}

function currentVersions() {
  const cargo = /\[package\][^[]*?\nversion = "([^"]*)"/.exec(read('src-tauri/Cargo.toml'))?.[1]
  return { packageJson: JSON.parse(read('package.json')).version, cargo }
}

function notes(version) {
  const section = changelogSection(read('CHANGELOG.md'), version)
  if (section === null) fail(`CHANGELOG.md has no section "## ${version}", or it is empty. Write it first.`)
  return section
}

/** The updater's manifest: the one file an installed Plumo reads to learn of an Update. */
export function updaterManifest({ version, notes: body, signature, pubDate }) {
  return {
    version,
    notes: body,
    pub_date: pubDate,
    platforms: {
      [UPDATER_PLATFORM]: {
        signature,
        url: `https://github.com/${REPOSITORY}/releases/download/v${version}/${assetName(version, 'app.tar.gz')}`,
      },
    },
  }
}

function cut(version) {
  assertVersion(version)
  const tag = `v${version}`
  if (git('status', '--porcelain') !== '') fail('The working tree has changes. Commit or stash them first.')
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD')
  if (branch !== RELEASE_BRANCH) fail(`Releases are cut from ${RELEASE_BRANCH}; this is ${branch}.`)
  if (git('tag', '--list', tag) !== '') fail(`The tag ${tag} already exists.`)
  notes(version)

  write('package.json', withPackageVersion(read('package.json'), version))
  write('src-tauri/Cargo.toml', withCargoVersion(read('src-tauri/Cargo.toml'), version))
  write('src-tauri/Cargo.lock', withCargoLockVersion(read('src-tauri/Cargo.lock'), version))

  git('add', 'package.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock')
  // A version already in the files (the first release) leaves nothing to commit; the tag still marks it.
  if (git('diff', '--cached', '--name-only') !== '') git('commit', '-m', `release: ${tag}`)
  git('tag', '-a', tag, '-m', `Plumo ${version}`)

  console.log(`Tagged ${tag}. Nothing is pushed yet. To start the release workflow:\n\n  git push --follow-tags\n`)
}

function verify(tag) {
  const version = assertVersion((tag ?? '').replace(/^v/, ''))
  const { packageJson, cargo } = currentVersions()
  if (packageJson !== version || cargo !== version) {
    fail(`The tag ${tag} does not match the files: package.json has ${packageJson}, src-tauri/Cargo.toml has ${cargo}.`)
  }
  notes(version)
  console.log(`${tag} matches package.json, src-tauri/Cargo.toml and CHANGELOG.md.`)
}

function manifest(version, signatureFile) {
  assertVersion(version)
  if (!signatureFile) fail('Usage: pnpm release manifest <version> <signature-file>')
  const signature = readFileSync(signatureFile, 'utf8').trim()
  if (signature === '') fail(`${signatureFile} is empty`)
  const body = updaterManifest({ version, notes: notes(version), signature, pubDate: new Date().toISOString() })
  console.log(JSON.stringify(body, null, 2))
}

export function run([command, ...rest]) {
  switch (command) {
    case 'notes':
      console.log(notes(assertVersion(rest[0])))
      return
    case 'verify':
      verify(rest[0])
      return
    case 'manifest':
      manifest(rest[0], rest[1])
      return
    default:
      cut(command)
  }
}

if (process.argv[1] === import.meta.filename) {
  try {
    run(process.argv.slice(2))
  } catch (error) {
    if (!(error instanceof ReleaseError)) throw error
    console.error(`release: ${error.message}`)
    process.exit(1)
  }
}
