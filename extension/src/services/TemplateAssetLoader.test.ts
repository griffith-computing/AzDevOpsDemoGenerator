import { afterEach, describe, expect, it, vi } from 'vitest'
import catalog from '../generated/templateCatalog.json'
import manifest from '../generated/templateManifest.json'
import type { CatalogGroup, TemplateManifestEntry } from '../types'
import { TemplateAssetLoader } from './TemplateAssetLoader'

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

  it('maps every template to one VSIX-safe JSON bundle', () => {
    const bundles = new Set<string>()
    for (const entry of Object.values(typedManifest)) {
      expect(entry.files.length).toBeGreaterThan(0)
      expect(entry.files.every((file) => file.endsWith('.json'))).toBe(true)
      expect(entry.bundle).toMatch(/^[a-f0-9]{64}\.json$/u)
      bundles.add(entry.bundle)
    }
    expect(bundles.size).toBe(64)
  })

  it('discovers service connection parameters without embedding their values', () => {
    const entry = typedManifest['Gen-eShopOnWeb']

    expect(entry.requiredParameters).toEqual([
      { name: 'password', secret: true },
      { name: 'username', secret: false },
    ])
  })
})

describe('TemplateAssetLoader', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches a template bundle once and returns independent values', async () => {
    const templateFolder = 'Gen-eShopOnWeb'
    const [firstFile, secondFile] = typedManifest[templateFolder].files
    const firstValue = { name: 'first' }
    const secondValue = { name: 'second' }
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        [firstFile]: firstValue,
        [secondFile]: secondValue,
      }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const loader = new TemplateAssetLoader(templateFolder)

    const first = await loader.json<typeof firstValue>(firstFile)
    const second = await loader.json<typeof secondValue>(secondFile)

    expect(first).toEqual(firstValue)
    expect(first).not.toBe(firstValue)
    expect(second).toEqual(secondValue)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith(
      `./Templates/${typedManifest[templateFolder].bundle}`,
    )
  })

  it('reports a bundle fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    const loader = new TemplateAssetLoader('Gen-eShopOnWeb')

    await expect(loader.json('ProjectTemplate.json')).rejects.toThrow(
      'Template bundle Gen-eShopOnWeb could not be loaded.',
    )
  })
})
