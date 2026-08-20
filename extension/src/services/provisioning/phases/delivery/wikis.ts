import { applyTemplateValues } from '../../templateValues'
import type { ProvisioningPhase } from '../../types'
import {
  assertNoUnresolvedPlaceholders,
  directChildFiles,
  substituteExtendedTokens,
} from './shared'

const codeWikiDirectory = 'Wiki'
const projectWikiDirectory = 'Wiki/ProjectWiki'

interface WikiReference {
  id: string
  name: string
}

/** A code wiki (repository-backed) creation request, e.g. `{ type: "codeWiki", name, projectId, repositoryId, mappedPath, version }`. */
type WikiRequestBody = Record<string, unknown>

function referencedRepositoryToken(value: unknown, repositoryName: string): boolean {
  const needle = `$${repositoryName}$`
  if (typeof value === 'string') {
    return value.includes(needle)
  }
  if (Array.isArray(value)) {
    return value.some((item) => referencedRepositoryToken(item, repositoryName))
  }
  if (value && typeof value === 'object') {
    return Object.values(value).some((item) => referencedRepositoryToken(item, repositoryName))
  }
  return false
}

/**
 * Creates a code (repository-backed) wiki for each file directly under the
 * template's `Wiki` folder, matching the legacy tool's `CreateCodeWiki`.
 * Each file is matched to the repository it documents by finding which
 * imported repository's `$<RepositoryName>$` placeholder it contains (the
 * same technique the legacy tool uses via a raw string `Contains` check),
 * then that token, `$Name$` (the file's own name), and `$ProjectID$` are
 * substituted before the request is sent.
 *
 * No template in the current catalog ships a `Wiki` folder, so this phase
 * is inert today; it activates the moment one is added.
 */
export const codeWikisPhase: ProvisioningPhase = {
  id: 'code-wikis',
  label: 'Create code wikis',
  isApplicable: (context) => directChildFiles(context.loader, codeWikiDirectory).length > 0,
  run: async (context) => {
    const { client, loader, state, signal } = context
    state.values.set('ProjectID', state.projectId)

    for (const file of directChildFiles(loader, codeWikiDirectory)) {
      const segments = file.split('/')
      const fileName = segments[segments.length - 1] ?? file
      const name = fileName.replace(/\.[^.]+$/u, '')

      const raw = await loader.json<WikiRequestBody>(file)
      const resolved = applyTemplateValues(raw, state)

      let matchedRepositoryName: string | undefined
      let matchedRepositoryId: string | undefined
      for (const [repositoryName, repositoryId] of state.repositoryIds) {
        if (referencedRepositoryToken(resolved, repositoryName)) {
          matchedRepositoryName = repositoryName
          matchedRepositoryId = String(repositoryId)
          break
        }
      }

      if (!matchedRepositoryName || !matchedRepositoryId) {
        throw new Error(
          `Code wiki template "${file}" does not reference any repository imported by this project. ` +
            'Add a "$<RepositoryName>$" placeholder that matches an imported repository.',
        )
      }

      const tokens = new Map<string, string>([
        [matchedRepositoryName, matchedRepositoryId],
        [matchedRepositoryName.toLowerCase(), matchedRepositoryId],
        ['Name', name],
      ])
      const finalBody = substituteExtendedTokens<WikiRequestBody>(resolved, (token) => tokens.get(token))
      assertNoUnresolvedPlaceholders(finalBody, `Code wiki "${name}"`)

      await client.request<WikiReference>(
        `/${encodeURIComponent(state.projectId)}/_apis/wiki/wikis?api-version=7.1`,
        { method: 'POST', body: JSON.stringify(finalBody) },
        signal,
      )
    }
  },
}

/**
 * Creates the project wiki declared by a `Wiki/ProjectWiki` folder and
 * seeds its pages, matching the legacy tool's `CreateProjetWiki`.
 *
 * The legacy tool sources the wiki-creation body, sample-page content, and
 * page-move body from three files at the *global* templates root
 * (`CreateWiki.json`, `SampleContent.json`, `MovePages.json`), which are
 * fixed, never-templated request shapes (only `$ProjectID$`/`$Name$`,
 * `$Content$`, and `$ParentFile$`/`$ChildFile$` respectively vary). Those
 * root-level files sit outside every per-template asset folder the
 * generated manifest exposes, so `TemplateAssetLoader` cannot fetch them;
 * their fixed shapes are reproduced verbatim below instead of being
 * loaded.
 *
 * No template in the current catalog ships a `Wiki/ProjectWiki` folder, so
 * this phase is inert today; it activates the moment one is added.
 */
export const projectWikiPhase: ProvisioningPhase = {
  id: 'project-wiki',
  label: 'Create the project wiki',
  isApplicable: (context) => context.loader.filesUnder(projectWikiDirectory).length > 0,
  run: async (context) => {
    const { client, loader, state, signal } = context

    const sectionFiles = loader.filesUnder(projectWikiDirectory)
    const prefix = `${projectWikiDirectory}/`
    const sections = new Set<string>()
    for (const file of sectionFiles) {
      const remainder = file.slice(prefix.length)
      const sectionName = remainder.split('/')[0]
      if (sectionName) {
        sections.add(sectionName)
      }
    }

    const createWikiBody: WikiRequestBody = {
      type: 'projectWiki',
      name: `${state.projectName}_wiki`,
      projectId: state.projectId,
    }
    const wiki = await client.request<WikiReference>(
      `/${encodeURIComponent(state.projectId)}/_apis/wiki/wikis?api-version=7.1`,
      { method: 'POST', body: JSON.stringify(createWikiBody) },
      signal,
    )

    for (const sectionName of sections) {
      await client.request<unknown>(
        `/${encodeURIComponent(state.projectName)}/_apis/wiki/wikis/${encodeURIComponent(
          wiki.id,
        )}/pages?path=${encodeURIComponent(sectionName)}&api-version=7.1`,
        { method: 'PUT', body: JSON.stringify({ content: 'Sample wiki content' }) },
        signal,
      )

      const childFiles = directChildFiles(loader, `${projectWikiDirectory}/${sectionName}`)
      const createdChildNames: string[] = []

      for (const childFile of childFiles) {
        const childSegments = childFile.split('/')
        const childFileName = childSegments[childSegments.length - 1] ?? childFile
        const childName = childFileName.replace(/\.[^.]+$/u, '')

        const pageContent = await loader.json<unknown>(childFile)
        const contentText = typeof pageContent === 'string' ? pageContent : JSON.stringify(pageContent)

        if (childName === sectionName) {
          await client.request<unknown>(
            `/${encodeURIComponent(state.projectName)}/_apis/wiki/wikis/${encodeURIComponent(
              wiki.id,
            )}/pages?path=${encodeURIComponent(childName)}&api-version=7.1`,
            { method: 'DELETE' },
            signal,
          )
        }

        await client.request<unknown>(
          `/${encodeURIComponent(state.projectName)}/_apis/wiki/wikis/${encodeURIComponent(
            wiki.id,
          )}/pages?path=${encodeURIComponent(childName)}&api-version=7.1`,
          { method: 'PUT', body: JSON.stringify({ content: contentText }) },
          signal,
        )
        createdChildNames.push(childName)
      }

      for (const childName of createdChildNames) {
        if (childName === sectionName) {
          continue
        }
        const movePagesBody: WikiRequestBody = {
          path: childName,
          newPath: `${sectionName}/${childName}`,
          newOrder: 0,
        }
        await client.request<unknown>(
          `/${encodeURIComponent(state.projectId)}/_apis/wiki/wikis/${encodeURIComponent(
            wiki.id,
          )}/pagemoves?api-version=7.1`,
          { method: 'POST', body: JSON.stringify(movePagesBody) },
          signal,
        )
      }
    }
  },
}
