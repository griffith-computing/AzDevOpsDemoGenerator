import { createHash } from 'node:crypto'
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const templatesRoot = path.resolve(extensionRoot, '..', 'src', 'ADOGenerator', 'Templates')
const sourcePath = path.join(templatesRoot, 'TemplateSetting.json')
const outputPath = path.join(extensionRoot, 'src', 'generated', 'templateCatalog.json')
const manifestOutputPath = path.join(extensionRoot, 'src', 'generated', 'templateManifest.json')
const assetsOutputPath = path.join(extensionRoot, 'public', 'Templates')

const catalog = JSON.parse(await readFile(sourcePath, 'utf8').then((value) => value.replace(/^\uFEFF/u, '')))
const errors = []
const templateManifests = {}

function assetName(value, extension = '') {
  const hash = createHash('sha256').update(value).digest('hex')
  return `${hash}${extension.toLocaleLowerCase()}`
}

function inferCapabilities(files) {
  const capabilities = new Set(
    files
      .filter((file) => file.includes('/'))
      .map((file) => file.split('/')[0]),
  )
  const rootCapabilities = new Map([
    ['Extensions.json', 'Extensions'],
    ['Iterations.json', 'Iterations'],
    ['TeamArea.json', 'Areas'],
  ])
  for (const [file, capability] of rootCapabilities) {
    if (files.includes(file)) capabilities.add(capability)
  }
  return [...capabilities].sort()
}

async function discoverRequiredParameters(templateRoot, files) {
  const serviceEndpointFiles = files.filter((file) =>
    /^ServiceEnd[Pp]oints\/.+\.json$/u.test(file),
  )
  const names = new Set()
  for (const file of serviceEndpointFiles) {
    const text = await readFile(path.join(templateRoot, ...file.split('/')), 'utf8')
    for (const match of text.matchAll(/\$(Apikey|GitUserName|GitUserPassword|password|URL|username)\$/gu)) {
      names.add(match[1])
    }
  }
  return [...names].sort().map((name) => ({
    name,
    secret: /password|apikey/iu.test(name),
  }))
}

async function listFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true })
  const paths = []
  for (const entry of entries) {
    const fullPath = path.join(current, entry.name)
    if (entry.isDirectory()) {
      paths.push(...await listFiles(root, fullPath))
    } else if (entry.isFile()) {
      paths.push(path.relative(root, fullPath).replaceAll(path.sep, '/'))
    }
  }
  return paths.sort()
}

if (!Array.isArray(catalog.GroupwiseTemplates)) {
  errors.push('GroupwiseTemplates must be an array.')
} else {
  for (const group of catalog.GroupwiseTemplates) {
    if (!Array.isArray(group.Template)) {
      errors.push(`Group ${group.Groups ?? '<unnamed>'} has no Template array.`)
      continue
    }

    for (const template of group.Template) {
      if (!template.Key || !template.Name || !template.TemplateFolder || !template.Description) {
        errors.push(`Template ${template.Name ?? '<unnamed>'} is missing required catalog fields.`)
        continue
      }

      try {
        const templateRoot = path.join(templatesRoot, template.TemplateFolder)
        const projectTemplate = path.join(templateRoot, 'ProjectTemplate.json')
        if (!(await stat(projectTemplate)).isFile()) {
          errors.push(`${template.Name}: ProjectTemplate.json is not a file.`)
        } else {
          const files = await listFiles(templateRoot)
          const basePath = assetName(template.TemplateFolder)
          const assets = Object.fromEntries(
            files.map((file) => {
              const extension = path.extname(file)
              return [file, `${basePath}/${assetName(file, extension)}`]
            }),
          )
          templateManifests[template.TemplateFolder] = {
            files,
            assets,
            capabilities: inferCapabilities(files),
            requiredParameters: await discoverRequiredParameters(templateRoot, files),
          }
        }
      } catch {
        errors.push(`${template.Name}: ProjectTemplate.json is missing.`)
      }
    }
  }
}

if (errors.length > 0) {
  throw new Error(`Template catalog validation failed:\n${errors.join('\n')}`)
}

await mkdir(path.dirname(outputPath), { recursive: true })
await rm(assetsOutputPath, { recursive: true, force: true })
for (const [templateFolder, entry] of Object.entries(templateManifests)) {
  for (const [logicalPath, assetPath] of Object.entries(entry.assets)) {
    const destination = path.join(assetsOutputPath, ...assetPath.split('/'))
    await mkdir(path.dirname(destination), { recursive: true })
    await copyFile(path.join(templatesRoot, templateFolder, ...logicalPath.split('/')), destination)
  }
}
await writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`)
await writeFile(manifestOutputPath, `${JSON.stringify(templateManifests, null, 2)}\n`)
console.log(`Generated catalog with ${catalog.GroupwiseTemplates.flatMap((group) => group.Template).length} templates.`)
