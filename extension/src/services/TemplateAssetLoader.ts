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
  private bundlePromise?: Promise<Record<string, unknown>>

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

    const bundle = await this.loadBundle()
    if (!Object.hasOwn(bundle, normalizedPath)) {
      throw new Error(
        `Template bundle entry ${this.templateFolder}/${normalizedPath} is missing.`,
      )
    }

    return structuredClone(bundle[normalizedPath]) as T
  }

  private loadBundle(): Promise<Record<string, unknown>> {
    this.bundlePromise ??= this.fetchBundle()
    return this.bundlePromise
  }

  private async fetchBundle(): Promise<Record<string, unknown>> {
    if (!this.entry.bundle) {
      throw new Error(`Template bundle mapping ${this.templateFolder} is missing.`)
    }

    const response = await fetch(`./Templates/${this.entry.bundle}`)
    if (!response.ok) {
      throw new Error(
        `Template bundle ${this.templateFolder} could not be loaded.`,
      )
    }
    return (await response.json()) as Record<string, unknown>
  }
}

function normalize(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\/+/u, '')
}
