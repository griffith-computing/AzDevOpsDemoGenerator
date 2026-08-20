import type { ProvisioningPhase } from '../../types'
import { firstBuildDefinitionIdKey } from './buildDefinitions'
import { assertNoUnresolvedPlaceholders, substituteExtendedTokens } from './shared'

const queueBuildManifestPath = 'QueueBuild.json'

/** `QueueBuild.json` is a free-form Build API "queue a build" request body; only its `$buildId$` token is templated. */
type QueueBuildTemplate = Record<string, unknown>

interface QueuedBuild {
  id: number
}

/**
 * Optionally queues an initial build immediately after `build-definitions`
 * runs, mirroring the legacy tool's `QueueABuild`. Only applicable when the
 * template ships a `QueueBuild.json` at its root — no template in the
 * current catalog does, so this phase is inert today but is provisioned
 * correctly the moment one is added.
 *
 * `$buildId$` is replaced with the id of the *first* build definition the
 * `build-definitions` phase created, matching the legacy behaviour of
 * queuing `model.BuildDefinitions.FirstOrDefault()`.
 */
export const buildQueuePhase: ProvisioningPhase = {
  id: 'build-queue',
  label: 'Queue an initial build',
  dependsOn: ['build-definitions'],
  isApplicable: (context) => context.loader.has(queueBuildManifestPath),
  run: async (context) => {
    const { client, loader, state, signal } = context

    const buildDefinitionId = state.values.get(firstBuildDefinitionIdKey)
    if (typeof buildDefinitionId !== 'string') {
      throw new Error(
        'Cannot queue a build because the "build-definitions" phase did not create any build definition.',
      )
    }

    const raw = await loader.json<QueueBuildTemplate>(queueBuildManifestPath)
    const resolved = substituteExtendedTokens(raw, (token) =>
      token === 'buildId' ? buildDefinitionId : undefined,
    )
    assertNoUnresolvedPlaceholders(resolved, 'Queue build request')

    await client.request<QueuedBuild>(
      `/${encodeURIComponent(state.projectId)}/_apis/build/builds?api-version=7.1`,
      { method: 'POST', body: JSON.stringify(resolved) },
      signal,
    )
  },
}
