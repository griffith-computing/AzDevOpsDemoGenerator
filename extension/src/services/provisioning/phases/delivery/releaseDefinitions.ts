import { applyTemplateValues } from '../../templateValues'
import type { ProvisioningPhase } from '../../types'
import {
  assertNoUnresolvedPlaceholders,
  buildDefinitionIdTokens,
  directChildFiles,
  findUnresolvedTokens,
  generateShortId,
  mergeIdentifierTokens,
  resolveAgentQueueId,
  resolveDefaultTeamOwner,
  resolveOrganizationName,
  substituteExtendedTokens,
} from './shared'

const releaseDefinitionsDirectory = 'ReleaseDefinitions'

/**
 * A release definition template as authored in the catalog. Environments,
 * deploy phases, and task graphs vary arbitrarily per pipeline, so only
 * `name` (needed for error messages) is named; everything else is
 * preserved and forwarded unchanged via the `unknown`-valued index
 * signature.
 */
type ReleaseDefinitionTemplate = Record<string, unknown> & { name: string }

interface CreatedReleaseDefinition {
  id: number
  name: string
}

/**
 * Creates the release definitions declared under the template's
 * `ReleaseDefinitions` folder, using the **release** host
 * (`vsrm.dev.azure.com`) as current Azure DevOps REST API conventions
 * require.
 *
 * Beyond `$ProjectName$`/`$ProjectId$`/`$AccountName$`/`$UUID$`/
 * `$RandomNumber$`/`$OwnerId$`/`$OwnerDisplayName$`/`$OwnerUniqueName$`
 * (simple alphanumeric tokens `applyTemplateValues` substitutes once this
 * phase populates them in `state.values`, matching the legacy tool's
 * per-phase, not per-file, owner/account resolution), templates reference
 * service endpoints, variable groups, build definitions
 * (`$<BuildDefName>-id$`), and agent queues (`$Azure Pipelines$`) by name.
 * Those are resolved with the extended token substitution in `./shared`:
 * first against the identifiers this and prior delivery phases recorded,
 * then — for whatever is still unresolved — speculatively against agent
 * queue names, since a release definition's `queueId` can appear at an
 * arbitrary depth inside its environments/deploy phases rather than one
 * fixed field.
 */
export const releaseDefinitionsPhase: ProvisioningPhase = {
  id: 'release-definitions',
  label: 'Create release definitions',
  dependsOn: ['service-endpoints', 'variable-groups', 'build-definitions'],
  isApplicable: (context) => directChildFiles(context.loader, releaseDefinitionsDirectory).length > 0,
  run: async (context) => {
    const { client, loader, state, signal } = context
    const files = directChildFiles(loader, releaseDefinitionsDirectory)

    // Resolved once for the whole phase (not per file), matching the
    // legacy tool, which looks up the default team's first member and the
    // organization name before its release-definition loop.
    const organization = await resolveOrganizationName(context)
    const owner = await resolveDefaultTeamOwner(context)
    state.values.set('AccountName', organization)
    state.values.set('OwnerId', owner.id)
    state.values.set('OwnerDisplayName', owner.displayName ?? '')
    state.values.set('OwnerUniqueName', owner.uniqueName ?? '')

    const queueCache = new Map<string, number>()

    for (const file of files) {
      // One fresh UUID per file, reused for both tokens, matching the
      // legacy tool (`$UUID$` and `$RandomNumber$` are replaced with the
      // same generated value).
      const uuid = generateShortId()
      state.values.set('UUID', uuid)
      state.values.set('RandomNumber', uuid)

      const raw = await loader.json<ReleaseDefinitionTemplate>(file)
      const resolved = applyTemplateValues(raw, state)

      const identifierTokens = new Map<string, string>()
      mergeIdentifierTokens(identifierTokens, state.repositoryIds)
      mergeIdentifierTokens(identifierTokens, state.endpointIds)
      mergeIdentifierTokens(identifierTokens, state.variableGroupIds)
      for (const [token, id] of buildDefinitionIdTokens(state)) {
        identifierTokens.set(token, id)
      }

      const afterIdentifiers = substituteExtendedTokens<ReleaseDefinitionTemplate>(
        resolved,
        (token) => identifierTokens.get(token) ?? identifierTokens.get(token.toLowerCase()),
      )

      const queueTokens = new Map<string, string>()
      for (const token of findUnresolvedTokens(afterIdentifiers)) {
        const queueId = await resolveAgentQueueId(context, token, queueCache)
        if (queueId !== undefined) {
          queueTokens.set(token, String(queueId))
        }
      }

      const finalDefinition = substituteExtendedTokens<ReleaseDefinitionTemplate>(
        afterIdentifiers,
        (token) => queueTokens.get(token),
      )

      assertNoUnresolvedPlaceholders(finalDefinition, `Release definition "${finalDefinition.name}"`)

      const created = await client.request<CreatedReleaseDefinition>(
        `/${encodeURIComponent(state.projectId)}/_apis/release/definitions?api-version=7.1`,
        { method: 'POST', body: JSON.stringify(finalDefinition) },
        signal,
        'release',
      )
      state.values.set(`release:${created.name}`, String(created.id))
      state.values.set(`release:${created.name.toLowerCase()}`, String(created.id))
    }
  },
}
