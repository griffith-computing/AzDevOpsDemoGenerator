import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(
  await readFile(path.join(extensionRoot, 'vss-extension.json'), 'utf8'),
)
const packagesRoot = path.join(extensionRoot, 'packages')
const expectedName =
  `${manifest.publisher}.${manifest.id}-${manifest.version}.vsix`.toLocaleLowerCase()
const packageNames = await readdir(packagesRoot)
const packageName = packageNames.find(
  (name) => name.toLocaleLowerCase() === expectedName,
)

if (!packageName) {
  throw new Error(`Expected package ${expectedName} was not generated.`)
}

const entries = readZipEntries(
  await readFile(path.join(packagesRoot, packageName)),
).filter((entry) => !entry.endsWith('/'))
const bundles = entries.filter((entry) =>
  /^dist\/Templates\/[a-f0-9]{64}\.json$/u.test(entry),
)
const templateAssets = entries.filter((entry) =>
  entry.startsWith('dist/Templates/'),
)

if (bundles.length !== 64 || templateAssets.length !== bundles.length) {
  throw new Error(
    `Expected exactly 64 bundled template assets, found ${bundles.length} bundles and ${templateAssets.length} total template assets.`,
  )
}

const safeFileLimit = 900
if (entries.length > safeFileLimit) {
  throw new Error(
    `VSIX contains ${entries.length} files, exceeding the safe limit of ${safeFileLimit}.`,
  )
}

console.log(
  `Verified VSIX asset count: ${entries.length} files, including ${bundles.length} template bundles.`,
)

function readZipEntries(buffer) {
  const endSignature = 0x06054b50
  const centralSignature = 0x02014b50
  const minimumEndOffset = Math.max(0, buffer.length - 65_557)
  let endOffset = buffer.length - 22

  while (
    endOffset >= minimumEndOffset
    && buffer.readUInt32LE(endOffset) !== endSignature
  ) {
    endOffset -= 1
  }
  if (endOffset < minimumEndOffset) {
    throw new Error('Generated VSIX does not contain a valid ZIP end record.')
  }

  const entryCount = buffer.readUInt16LE(endOffset + 10)
  let offset = buffer.readUInt32LE(endOffset + 16)
  const entries = []

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== centralSignature) {
      throw new Error(`Generated VSIX has an invalid central directory entry at ${offset}.`)
    }
    const fileNameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    entries.push(
      buffer
        .subarray(offset + 46, offset + 46 + fileNameLength)
        .toString('utf8')
        .replaceAll('\\', '/')
        .replace(/^\/+/u, ''),
    )
    offset += 46 + fileNameLength + extraLength + commentLength
  }

  return entries
}
