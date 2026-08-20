import manifestData from '../generated/templateManifest.json'
import type { TemplateManifestEntry } from '../types'

const manifest = manifestData as Record<string, TemplateManifestEntry>

export function getTemplateManifest(
  templateFolder: string,
): TemplateManifestEntry {
  const entry = manifest[templateFolder]
  if (!entry) {
    throw new Error(`Template manifest is missing ${templateFolder}.`)
  }
  return entry
}

export class TemplateAssetLoader {
  private readonly templateFolder: string

  constructor(templateFolder: string) {
    this.templateFolder = templateFolder
  }

  get entry(): TemplateManifestEntry {
    return getTemplateManifest(this.templateFolder)
  }

  has(relativePath: string): boolean {
    return this.entry.files.includes(normalize(relativePath))
  }

  filesUnder(directory: string, extension = '.json'): string[] {
    const prefix = `${normalize(directory).replace(/\/$/u, '')}/`
    return this.entry.files.filter(
      (file) => file.startsWith(prefix) && file.endsWith(extension),
    )
  }

  async json<T>(relativePath: string): Promise<T> {
    const normalizedPath = normalize(relativePath)
    if (!this.has(normalizedPath)) {
      throw new Error(
        `Template asset ${this.templateFolder}/${normalizedPath} is missing.`,
      )
    }

    const assetPath = this.entry.assets[normalizedPath]
    if (!assetPath) {
      throw new Error(
        `Template asset mapping ${this.templateFolder}/${normalizedPath} is missing.`,
      )
    }

    const response = await fetch(`./Templates/${assetPath}`)
    if (!response.ok) {
      throw new Error(
        `Template asset ${this.templateFolder}/${normalizedPath} could not be loaded.`,
      )
    }
    return (await response.json()) as T
  }
}

function normalize(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\/+/u, '')
}
