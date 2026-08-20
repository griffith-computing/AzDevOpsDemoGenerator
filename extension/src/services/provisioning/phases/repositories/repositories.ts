import type { ProvisioningContext, ProvisioningPhase } from '../../types'
import type { GitRepository, GitRepositoryListResponse } from './shared'
import { importSourceCodeFiles, repositoryNameFromFile } from './shared'

interface CreateGitRepositoryBody {
  name: string
  project: { id: string }
}

/**
 * Ensures every repository referenced by the template's ImportSourceCode
 * definitions exists, populating `context.state.repositoryIds` (keyed by
 * repository name) for later phases.
 *
 * Azure DevOps auto-creates a repository named after the project whenever a
 * project is created with Git version control. Templates whose repository
 * name matches the project name deliberately reuse that repository instead
 * of creating a duplicate; if no template targets it, it is removed so it
 * does not linger as unused scaffolding alongside the repositories the
 * template actually wants.
 */
export const repositoriesPhase: ProvisioningPhase = {
  id: 'repositories',
  label: 'Create repositories',
  isApplicable: (context) => importSourceCodeFiles(context.loader).length > 0,
  run: async (context) => {
    const { client, loader, state, signal } = context
    const repositoryNames = importSourceCodeFiles(loader).map(repositoryNameFromFile)

    const existingRepositories = await client.request<GitRepositoryListResponse>(
      `/${encodeURIComponent(state.projectId)}/_apis/git/repositories?api-version=7.1`,
      {},
      signal,
    )

    const repositoriesByLowerName = new Map(
      existingRepositories.value.map((repository) => [repository.name.toLocaleLowerCase(), repository]),
    )
    const defaultRepository = repositoriesByLowerName.get(state.projectName.toLocaleLowerCase())
    let defaultRepositoryIsInUse = false

    for (const repositoryName of repositoryNames) {
      if (state.repositoryIds.has(repositoryName)) {
        continue
      }

      const isDefaultRepositoryName =
        repositoryName.toLocaleLowerCase() === state.projectName.toLocaleLowerCase()

      const repository =
        isDefaultRepositoryName && defaultRepository
          ? defaultRepository
          : await createRepository(context, repositoryName)

      if (isDefaultRepositoryName) {
        defaultRepositoryIsInUse = true
      }

      state.repositoryIds.set(repositoryName, repository.id)
      // Lower-cased so BranchPolicy templates' `$<repositoryname>$` tokens
      // (always written in lower case) resolve through applyTemplateValues.
      state.values.set(repositoryName.toLocaleLowerCase(), repository.id)
    }

    if (defaultRepository && !defaultRepositoryIsInUse) {
      await client.request<void>(
        `/${encodeURIComponent(state.projectId)}/_apis/git/repositories/${encodeURIComponent(
          defaultRepository.id,
        )}?api-version=7.1`,
        { method: 'DELETE' },
        signal,
      )
    }
  },
}

async function createRepository(context: ProvisioningContext, name: string): Promise<GitRepository> {
  const { client, state, signal } = context
  const body: CreateGitRepositoryBody = { name, project: { id: state.projectId } }
  return client.request<GitRepository>(
    `/${encodeURIComponent(state.projectId)}/_apis/git/repositories?api-version=7.1`,
    { method: 'POST', body: JSON.stringify(body) },
    signal,
  )
}
