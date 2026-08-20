import { applyTemplateValues } from '../../templateValues'
import type { ProvisioningContext, ProvisioningPhase, ProvisioningState } from '../../types'
import { directChildFiles } from './shared'

interface IdentityRef {
  id: string
  displayName?: string
  uniqueName?: string
}

interface TeamMember {
  identity: IdentityRef
}

interface TeamMembersResponse {
  count: number
  value: TeamMember[]
}

interface PullRequestReviewerTemplate {
  id: string
}

interface PullRequestTemplate {
  title: string
  description?: string
  sourceRefName: string
  targetRefName: string
  reviewers?: PullRequestReviewerTemplate[]
}

interface PullRequestCreateBody {
  title: string
  description?: string
  sourceRefName: string
  targetRefName: string
  reviewers?: PullRequestReviewerTemplate[]
}

interface PullRequest {
  pullRequestId: number
  title: string
}

interface PullRequestCommentTemplate {
  parentCommentId: number
  content: string
  commentType?: number
}

interface PullRequestThreadTemplate {
  comments: PullRequestCommentTemplate[]
  properties?: Record<string, unknown>
  pullRequestThreadContext?: unknown
  threadContext?: unknown
  status?: number
  Replies?: PullRequestCommentTemplate[]
}

interface PullRequestThreadsTemplate {
  count: number
  value: PullRequestThreadTemplate[]
}

interface PullRequestThreadCreateBody {
  comments: PullRequestCommentTemplate[]
  properties?: Record<string, unknown>
  pullRequestThreadContext?: unknown
  threadContext?: unknown
  status?: number
}

interface PullRequestThread {
  id: number
}

interface PullRequestComment {
  id: number
}

function pullRequestFiles(context: ProvisioningContext): string[] {
  return directChildFiles(context.loader, 'PullRequests')
}

/**
 * Creates pull requests (and their comment threads) declared under the
 * template's `PullRequests` folder.
 *
 * Every template in the current catalog that ships pull requests only
 * imports a single repository, so the target repository is resolved
 * unambiguously from `context.state.repositoryIds`; a template that created
 * more than one repository fails with an actionable error instead of
 * guessing which one the pull requests belong to.
 */
export const pullRequestsPhase: ProvisioningPhase = {
  id: 'pull-requests',
  label: 'Create pull requests',
  dependsOn: ['source-imports'],
  isApplicable: (context) => pullRequestFiles(context).length > 0,
  run: async (context) => {
    const { client, loader, state, signal } = context
    const files = pullRequestFiles(context)
    const repositoryId = resolveSinglePullRequestRepositoryId(state, files)

    const reviewerId = await resolveDefaultTeamMemberId(context)
    if (reviewerId) {
      state.values.set('reviewer', reviewerId)
    }

    for (const file of files) {
      const raw = await loader.json<PullRequestTemplate>(file)
      const resolved = applyTemplateValues(raw, state)

      const body: PullRequestCreateBody = {
        title: resolved.title,
        description: resolved.description,
        sourceRefName: resolved.sourceRefName,
        targetRefName: resolved.targetRefName,
        reviewers: resolved.reviewers,
      }

      const pullRequest = await client.request<PullRequest>(
        `/${encodeURIComponent(state.projectId)}/_apis/git/repositories/${encodeURIComponent(
          repositoryId,
        )}/pullrequests?api-version=7.1`,
        { method: 'POST', body: JSON.stringify(body) },
        signal,
      )

      const commentsFile = commentsFileFor(file)
      if (loader.has(commentsFile)) {
        await createPullRequestComments(context, repositoryId, pullRequest.pullRequestId, commentsFile)
      }
    }
  },
}

function resolveSinglePullRequestRepositoryId(state: ProvisioningState, files: string[]): string {
  if (state.repositoryIds.size !== 1) {
    throw new Error(
      'Cannot determine which repository the pull requests target because the template created ' +
        `${state.repositoryIds.size} repositories (expected exactly one). Affected templates: ${files.join(', ')}.`,
    )
  }
  return [...state.repositoryIds.values()][0]
}

/**
 * Resolves the reviewer identity used to replace `$reviewer$` tokens: the
 * first member of the project's default team, which is always the project
 * creator immediately after project creation.
 */
async function resolveDefaultTeamMemberId(context: ProvisioningContext): Promise<string | undefined> {
  const { client, state, signal } = context
  const response = await client.request<TeamMembersResponse>(
    `/_apis/projects/${encodeURIComponent(state.projectId)}/teams/${encodeURIComponent(
      state.defaultTeamName,
    )}/members?api-version=7.1`,
    {},
    signal,
  )

  return response.value[0]?.identity.id
}

function commentsFileFor(pullRequestFile: string): string {
  const fileName = pullRequestFile.split('/').pop()
  if (!fileName) {
    throw new Error(`Could not determine a comments file for template asset "${pullRequestFile}".`)
  }
  return `PullRequests/Comments/${fileName}`
}

async function createPullRequestComments(
  context: ProvisioningContext,
  repositoryId: string,
  pullRequestId: number,
  commentsFile: string,
): Promise<void> {
  const { client, loader, state, signal } = context
  const raw = await loader.json<PullRequestThreadsTemplate>(commentsFile)
  const resolved = applyTemplateValues(raw, state)

  for (const thread of resolved.value) {
    const threadBody: PullRequestThreadCreateBody = {
      comments: thread.comments,
      properties: thread.properties,
      pullRequestThreadContext: thread.pullRequestThreadContext,
      threadContext: thread.threadContext,
      status: thread.status,
    }

    const createdThread = await client.request<PullRequestThread>(
      `/${encodeURIComponent(state.projectId)}/_apis/git/repositories/${encodeURIComponent(
        repositoryId,
      )}/pullRequests/${encodeURIComponent(String(pullRequestId))}/threads?api-version=7.1`,
      { method: 'POST', body: JSON.stringify(threadBody) },
      signal,
    )

    for (const reply of thread.Replies ?? []) {
      await client.request<PullRequestComment>(
        `/${encodeURIComponent(state.projectId)}/_apis/git/repositories/${encodeURIComponent(
          repositoryId,
        )}/pullRequests/${encodeURIComponent(String(pullRequestId))}/threads/${encodeURIComponent(
          String(createdThread.id),
        )}/comments?api-version=7.1`,
        { method: 'POST', body: JSON.stringify(reply) },
        signal,
      )
    }
  }
}
