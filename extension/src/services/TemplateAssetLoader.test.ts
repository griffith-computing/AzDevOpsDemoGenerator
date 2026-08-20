import { describe, expect, it } from 'vitest'
import catalog from '../generated/templateCatalog.json'
import manifest from '../generated/templateManifest.json'
import type { CatalogGroup, TemplateManifestEntry } from '../types'

const typedCatalog = catalog as { GroupwiseTemplates: CatalogGroup[] }
const typedManifest = manifest as Record<string, TemplateManifestEntry>

describe('generated template assets', () => {
  it('contains one manifest entry for every catalog template', () => {
    const templates = typedCatalog.GroupwiseTemplates.flatMap(
      (group) => group.Template,
    )

    expect(templates).toHaveLength(64)
    expect(Object.keys(typedManifest)).toHaveLength(templates.length)
    for (const template of templates) {
      expect(typedManifest).toHaveProperty(template.TemplateFolder)
    }
  })

  it('maps every logical file to a VSIX-safe asset path', () => {
    for (const entry of Object.values(typedManifest)) {
      expect(entry.files.length).toBeGreaterThan(0)
      for (const file of entry.files) {
        const asset = entry.assets[file]
        expect(asset).toBeDefined()
        expect(asset).toMatch(/^[a-f0-9]{64}\/[a-f0-9]{64}\.[a-z0-9]+$/u)
      }
    }
  })

  it('discovers service connection parameters without embedding their values', () => {
    const entry = typedManifest['Gen-eShopOnWeb']

    expect(entry.requiredParameters).toEqual([
      { name: 'password', secret: true },
      { name: 'username', secret: false },
    ])
  })
})
