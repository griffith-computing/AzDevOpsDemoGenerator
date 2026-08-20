import type { TemplateAssetLoader } from '../../../TemplateAssetLoader'
import type { ProvisioningContext, ProvisioningState } from '../../types'

/** A shallow reference to an Azure DevOps project, as embedded in *ProjectReference fields. */
export interface ProjectReference {
  id: string
  name: string
}

export interface IdentityRef {
  id: string
  displayName?: string
  uniqueName?: string
}

export interface TeamMember {
  identity: IdentityRef
}

export interface TeamMembersResponse {
  count: number
  value: TeamMember[]
}

export interface TeamReference {
  id: string
  name: string
}

export interface TeamsListResponse {
  count: number
  value: TeamReference[]
}

export interface TaskAgentQueueReference {
  id: number
  name: string
}

export interface TaskAgentQueuesResponse {
  count: number
  value: TaskAgentQueueReference[]
}

/**
 * Returns the template asset paths that are direct children of `directory`,
 * excluding files nested in subfolders (mirrors a non-recursive directory
 * listing rather than `filesUnder`'s recursive prefix match). Mirrors the
 * legacy tool, which enumerates each capability folder with
 * `Directory.GetFiles` (top level only, no recursion).
 */
export function directChildFiles(loader: TemplateAssetLoader, directory: string): string[] {
  const expectedSegmentCount = directory.split('/').length + 1
  return loader
    .filesUnder(directory)
    .filter((file) => file.split('/').length === expectedSegmentCount)
}

/**
 * Real templates in the catalog spell this folder both `ServiceEndpoints`
 * and `ServiceEndPoints`. Returns the direct-child JSON files under
 * whichever casing (or both) is present.
 */
export function serviceEndpointFiles(loader: TemplateAssetLoader): string[] {
  const files = new Set<string>([
    ...directChildFiles(loader, 'ServiceEndpoints'),
    ...directChildFiles(loader, 'ServiceEndPoints'),
  ])
  return [...files]
}

const projectByIdCache = new WeakMap<ProvisioningContext, Promise<string>>()

interface ProjectDetails {
  url: string
}

/**
 * Resolves the Azure DevOps organization name for the current provisioning
 * context. `AzureDevOpsClient` does not expose the organization name it was
 * constructed with, so it is recovered from the `url` Azure DevOps returns
 * for the project itself (`https://dev.azure.com/{organization}/_apis/projects/{id}`).
 * The result is cached per context (a `WeakMap` keyed on the context object)
 * so repeated calls across delivery phases only issue one request.
 */
export function resolveOrganizationName(context: ProvisioningContext): Promise<string> {
  const cached = projectByIdCache.get(context)
  if (cached) {
    return cached
  }

  const promise = (async () => {
    const { client, state, signal } = context
    const project = await client.request<ProjectDetails>(
      `/_apis/projects/${encodeURIComponent(state.projectId)}?api-version=7.1`,
      {},
      signal,
    )
    const match = /^https:\/\/dev\.azure\.com\/([^/]+)\//u.exec(project.url)
    if (!match) {
      throw new Error(
        `Could not determine the Azure DevOps organization name from project URL "${project.url}".`,
      )
    }
    return match[1]
  })()

  projectByIdCache.set(context, promise)
  return promise
}

/**
 * Resolves the identity used as a release definition environment `owner`:
 * the first member of the project's default team, matching the legacy
 * tool's behaviour. Fails actionably rather than silently substituting an
 * empty identity when the default team unexpectedly has no members.
 */
export async function resolveDefaultTeamOwner(context: ProvisioningContext): Promise<IdentityRef> {
  const { client, state, signal } = context
  const response = await client.request<TeamMembersResponse>(
    `/_apis/projects/${encodeURIComponent(state.projectId)}/teams/${encodeURIComponent(
      state.defaultTeamName,
    )}/members?api-version=7.1`,
    {},
    signal,
  )

  const owner = response.value[0]?.identity
  if (!owner) {
    throw new Error(
      `Cannot resolve a release definition environment owner because the default team ` +
        `"${state.defaultTeamName}" has no members.`,
    )
  }
  return owner
}

/** Lists every team in the project, used to resolve delivery plan `$<TeamName>$` tokens. */
export async function listTeams(context: ProvisioningContext): Promise<TeamReference[]> {
  const { client, state, signal } = context
  const response = await client.request<TeamsListResponse>(
    `/_apis/projects/${encodeURIComponent(state.projectId)}/teams?api-version=7.1`,
    {},
    signal,
  )
  return response.value
}

/**
 * Resolves an agent queue's numeric id from its display name (e.g. `Azure
 * Pipelines`, `Hosted Ubuntu 1604`), as referenced by build and release
 * definition templates. Results are cached in `cache` so a template that
 * references the same queue from multiple definitions only issues one
 * request per queue name. Returns `undefined` (rather than throwing) when
 * no matching queue exists, since callers use this both where a queue name
 * is certain (and should fail loudly if missing) and speculatively against
 * arbitrary leftover placeholders (where a miss just means "not a queue
 * name" and should fall through to a more accurate error).
 */
export async function resolveAgentQueueId(
  context: ProvisioningContext,
  queueName: string,
  cache: Map<string, number>,
): Promise<number | undefined> {
  const cached = cache.get(queueName)
  if (cached !== undefined) {
    return cached
  }

  const { client, state, signal } = context
  const response = await client.request<TaskAgentQueuesResponse>(
    `/${encodeURIComponent(state.projectId)}/_apis/distributedtask/queues?queueName=${encodeURIComponent(
      queueName,
    )}&api-version=7.1`,
    {},
    signal,
  )

  const queue = response.value[0]
  if (!queue) {
    return undefined
  }

  cache.set(queueName, queue.id)
  return queue.id
}

/**
 * Matches `$<token>$` placeholders whose body is made of letters, digits,
 * spaces, underscores, hyphens, or periods. This is intentionally broader
 * than `applyTemplateValues`'s alphanumeric-only pattern so it also matches
 * tokens templates use for repository names, agent queue names, team
 * names, and build-definition-id references (e.g. `$Azure Pipelines$`,
 * `$toy-website-end-to-end$`, `$App Development Team$`,
 * `$SmartHotel-CouponManagement-CI-id$`). The character class deliberately
 * excludes `(` and `)` so it never matches release/build definition runtime
 * variable expressions such as `$(resourcegroup)`.
 */
const extendedTokenPattern = /\$([A-Za-z0-9 _.-]{1,80})\$/gu

/**
 * Recursively walks a parsed template value, replacing `$<token>$`
 * placeholders using `resolve`. Unresolved tokens are left untouched so a
 * later call to `assertNoUnresolvedPlaceholders` can report them.
 *
 * Complements `applyTemplateValues`: that function only substitutes
 * alphanumeric `$Token$` placeholders from `state.values`, which cannot
 * express the free-form tokens (spaces, hyphens) delivery templates use.
 */
export function substituteExtendedTokens<T>(
  value: T,
  resolve: (token: string) => string | undefined,
): T {
  return visit(value, resolve) as T
}

function visit(value: unknown, resolve: (token: string) => string | undefined): unknown {
  if (typeof value === 'string') {
    return value.replace(extendedTokenPattern, (original, token: string) => resolve(token) ?? original)
  }
  if (Array.isArray(value)) {
    return value.map((item) => visit(item, resolve))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, visit(item, resolve)]),
    )
  }
  return value
}

/** Recursively collects every distinct `$<token>$` placeholder left in a resolved template value. */
export function findUnresolvedTokens(value: unknown): string[] {
  const found = new Set<string>()
  collectTokens(value, found)
  return [...found]
}

function collectTokens(value: unknown, found: Set<string>): void {
  if (typeof value === 'string') {
    for (const match of value.matchAll(extendedTokenPattern)) {
      found.add(match[1])
    }
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectTokens(item, found))
    return
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectTokens(item, found))
  }
}

const credentialKeywords = ['password', 'secret', 'apikey', 'api-key', 'credential', 'username']

function isCredentialLikeToken(token: string): boolean {
  const lower = token.toLowerCase()
  return credentialKeywords.some((keyword) => lower.includes(keyword)) || lower === 'pat'
}

/**
 * Throws an actionable error if `value` still contains unresolved
 * `$<token>$` placeholders after every known substitution has run.
 *
 * Credential-shaped tokens (username, password, API key, ...) are called
 * out distinctly: this tool never fabricates or persists secret values, so
 * a template that requires one can only proceed once the caller supplies it
 * via `state.values` beforehand. Every other unresolved token is reported
 * as a generic, unmet template dependency.
 */
export function assertNoUnresolvedPlaceholders(value: unknown, describedAs: string): void {
  const unresolved = findUnresolvedTokens(value)
  if (unresolved.length === 0) {
    return
  }

  const credentialTokens = unresolved.filter(isCredentialLikeToken)
  const otherTokens = unresolved.filter((token) => !isCredentialLikeToken(token))

  const parts: string[] = []
  if (credentialTokens.length > 0) {
    parts.push(
      `requires credential(s) ${credentialTokens.map((token) => `"${token}"`).join(', ')} that this ` +
        'browser-based provisioning tool cannot supply safely (it never fabricates or persists secret ' +
        `values); populate ProvisioningState.values with matching keys before provisioning if you have one`,
    )
  }
  if (otherTokens.length > 0) {
    parts.push(
      `left unresolved placeholder(s) ${otherTokens.map((token) => `"${token}"`).join(', ')}`,
    )
  }

  throw new Error(`${describedAs} ${parts.join('; and ')}.`)
}

/** Generates a short, unique-enough suffix for `$UUID$`/`$RandomNumber$` tokens. */
export function generateShortId(): string {
  return crypto.randomUUID().replace(/-/gu, '').slice(0, 8)
}

/**
 * Merges a name→id map (e.g. `state.repositoryIds`, `state.endpointIds`,
 * `state.variableGroupIds`) into `target` as `$<token>$` substitution
 * values, keyed by both the identifier's exact case and its lower-cased
 * form. Delivery templates are not perfectly consistent about the casing
 * they use for a given repository/endpoint/group name, so matching
 * case-insensitively avoids spurious "unresolved placeholder" failures
 * without weakening the actionable-failure guarantee for placeholders that
 * genuinely have no matching identifier.
 */
export function mergeIdentifierTokens(
  target: Map<string, string>,
  source: Map<string, string | number>,
): void {
  for (const [name, value] of source) {
    const stringValue = String(value)
    target.set(name, stringValue)
    target.set(name.toLowerCase(), stringValue)
  }
}

/**
 * Extracts the token name from a string that is *entirely* a single
 * `$<token>$` placeholder (e.g. `"$Azure Pipelines$"` -> `"Azure
 * Pipelines"`), as used for whole-value fields like an agent queue's `id`.
 * Returns `undefined` for an already-resolved value or a string that mixes
 * a placeholder with other text.
 */
export function wholeValuePlaceholder(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const match = /^\$([A-Za-z0-9 _.-]{1,80})\$$/u.exec(value.trim())
  return match?.[1]
}

/**
 * Records a created build definition's id under the `$<name>-id$` key
 * release definition templates use to reference it (e.g.
 * `$SmartHotel-CouponManagement-CI-id$`), so `buildDefinitionIdTokens` can
 * resolve it later. Stored in `state.values` (rather than a new
 * `ProvisioningState` field, which cannot be added without editing the
 * shared `types.ts`) under a key namespaced with a literal `-id` suffix
 * that no other phase produces.
 */
export function rememberBuildDefinitionId(state: ProvisioningState, name: string, id: string): void {
  state.values.set(`${name}-id`, id)
}

/** Returns every `$<name>-id$` build-definition-id token recorded by `rememberBuildDefinitionId`. */
export function buildDefinitionIdTokens(state: ProvisioningState): Map<string, string> {
  const tokens = new Map<string, string>()
  for (const [key, value] of state.values) {
    if (key.endsWith('-id') && typeof value === 'string') {
      tokens.set(key, value)
    }
  }
  return tokens
}
