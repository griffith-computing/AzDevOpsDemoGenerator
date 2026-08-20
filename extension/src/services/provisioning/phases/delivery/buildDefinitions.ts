import { applyTemplateValues } from '../../templateValues'
import type { ProvisioningPhase } from '../../types'
import {
  assertNoUnresolvedPlaceholders,
  directChildFiles,
  generateShortId,
  mergeIdentifierTokens,
  rememberBuildDefinitionId,
  resolveAgentQueueId,
  resolveOrganizationName,
  substituteExtendedTokens,
  wholeValuePlaceholder,
} from './shared'

const buildDefinitionsDirectory = 'BuildDefinitions'
/** `state.values` key that records the first build definition created, for `buildQueuePhase`. */
export const firstBuildDefinitionIdKey = 'FirstBuildDefinitionId'

interface BuildDefinitionQueueReference {
  id?: unknown
}

/**
 * A build definition template as authored in the catalog. The overall
 * shape (process steps, triggers, repository, queue, ...) is large and
 * varies per pipeline, so only the fields this phase reads directly are
 * named; everything else is preserved and forwarded unchanged via the
 * `unknown`-valued index signature.
 */
interface BuildDefinitionTemplate {
  name: string
  queue?: BuildDefinitionQueueReference
  [key: string]: unknown
}

interface CreatedBuildDefinition {
  id: number
  name: string
}

/**
 * Creates the build definitions declared under the template's
 * `BuildDefinitions` folder, recording each definition's id (via
 * `rememberBuildDefinitionId`) so the release-definitions phase can resolve
 * `$<BuildDefName>-id$` artifact tokens, and the first one created (via
 * `firstBuildDefinitionIdKey`) so `buildQueuePhase` can queue it.
 *
 * Beyond the simple alphanumeric `$ProjectName$`/`$ProjectId$`/
 * `$Organization$`/`$UUID$` tokens handled by `applyTemplateValues`,
 * templates reference repositories (`$<repo-name>$`, hyphenated), service
 * endpoints, and agent queues (`$Azure Pipelines$`, spaced) by name; those
 * are resolved with the extended token substitution in `./shared`.
 *
 * A template's own `$username$` token here (used historically to bake a
 * public GitHub username into a clone URL for a GitHub-import variant this
 * tool does not support, matching the `source-imports` phase's scope) is
 * intentionally left to fail via `assertNoUnresolvedPlaceholders`, which
 * reports it as an unmet credential-shaped requirement rather than
 * fabricating one.
 */
export const buildDefinitionsPhase: ProvisioningPhase = {
  id: 'build-definitions',
  label: 'Create build definitions',
  dependsOn: ['service-endpoints', 'variable-groups', 'source-imports'],
  isApplicable: (context) => directChildFiles(context.loader, buildDefinitionsDirectory).length > 0,
  run: async (context) => {
    const { client, loader, state, signal } = context
    const files = directChildFiles(loader, buildDefinitionsDirectory)
    const organization = await resolveOrganizationName(context)
    const queueCache = new Map<string, number>()

    for (const file of files) {
      // The legacy tool mints a fresh UUID per build definition file, not
      // once for the whole phase, so a template that creates several
      // definitions from one UUID-bearing source file does not collide.
      state.values.set('UUID', generateShortId())
      state.values.set('Organization', organization)

      const raw = await loader.json<BuildDefinitionTemplate>(file)
      const resolved = applyTemplateValues(raw, state)

      const tokens = new Map<string, string>()
      mergeIdentifierTokens(tokens, state.repositoryIds)
      mergeIdentifierTokens(tokens, state.endpointIds)

      const queueToken = wholeValuePlaceholder(resolved.queue?.id)
      if (queueToken) {
        const queueId = await resolveAgentQueueId(context, queueToken, queueCache)
        if (queueId === undefined) {
          throw new Error(
            `Build definition "${resolved.name}" requires an agent queue named "${queueToken}", but no ` +
              'matching queue (or agent pool) exists in this project. Create it before provisioning this template.',
          )
        }
        tokens.set(queueToken, String(queueId))
        tokens.set(queueToken.toLowerCase(), String(queueId))
      }

      const withExtendedTokens = substituteExtendedTokens<BuildDefinitionTemplate>(
        resolved,
        (token) => tokens.get(token) ?? tokens.get(token.toLowerCase()),
      )
      assertNoUnresolvedPlaceholders(withExtendedTokens, `Build definition "${withExtendedTokens.name}"`)

      const created = await client.request<CreatedBuildDefinition>(
        `/${encodeURIComponent(state.projectId)}/_apis/build/definitions?api-version=7.1`,
        { method: 'POST', body: JSON.stringify(withExtendedTokens) },
        signal,
      )

      rememberBuildDefinitionId(state, created.name, String(created.id))
      if (!state.values.has(firstBuildDefinitionIdKey)) {
        state.values.set(firstBuildDefinitionIdKey, String(created.id))
      }
    }
  },
}
