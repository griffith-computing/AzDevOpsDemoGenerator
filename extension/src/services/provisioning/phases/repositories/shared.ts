import type { TemplateAssetLoader } from '../../../TemplateAssetLoader'

export interface TeamProjectReference {
  id: string
  name: string
  url?: string
  state?: string
}

export interface GitRepository {
  id: string
  name: string
  url?: string
  project?: TeamProjectReference
  defaultBranch?: string
  remoteUrl?: string
  sshUrl?: string
  webUrl?: string
  size?: number
  isDisabled?: boolean
}

export interface GitRepositoryListResponse {
  count: number
  value: GitRepository[]
}

const gitHubForkTemplateFile = 'ImportSourceCode/GitRepository.json'

/**
 * Returns the template asset paths that are direct children of `directory`,
 * excluding files nested in subfolders (mirrors a non-recursive directory
 * listing rather than `filesUnder`'s recursive prefix match).
 */
export function directChildFiles(loader: TemplateAssetLoader, directory: string): string[] {
  const expectedSegmentCount = directory.split('/').length + 1
  return loader
    .filesUnder(directory)
    .filter((file) => file.split('/').length === expectedSegmentCount)
}

/**
 * Import source code definitions, one per repository to create/import.
 *
 * `ImportSourceCode/GitRepository.json` is intentionally excluded: it is a
 * request to fork a repository into the operator's personal GitHub account,
 * a feature this browser-based tool does not implement (GitHub credentials
 * are out of scope), so it is never treated as a per-repository template.
 */
export function importSourceCodeFiles(loader: TemplateAssetLoader): string[] {
  return directChildFiles(loader, 'ImportSourceCode').filter(
    (file) => file !== gitHubForkTemplateFile,
  )
}

/** Derives the repository name Azure DevOps should use from a template asset path. */
export function repositoryNameFromFile(file: string): string {
  const fileName = file.split('/').pop()
  if (!fileName) {
    throw new Error(`Could not determine a repository name from template asset "${file}".`)
  }
  return fileName.replace(/\.json$/iu, '')
}

/** Waits for `milliseconds`, rejecting early if `signal` is aborted. */
export async function waitUnlessAborted(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    throw new DOMException('Provisioning was cancelled.', 'AbortError')
  }

  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      window.clearTimeout(timer)
      reject(new DOMException('Provisioning was cancelled.', 'AbortError'))
    }
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, milliseconds)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}
