import type { ProvisioningContext } from '../../types'

const queryMapStateKeyPrefix = 'work.sharedQueryIdMap:'

/** Root/default team uses the empty string suffix; named teams use their own name. */
function queryMapStateKey(teamName: string | null): string {
  return `${queryMapStateKeyPrefix}${teamName ?? ''}`
}

/** Reads the query-name-to-id map created by `sharedQueriesPhase` for one dashboard group. */
export function getSharedQueryIdMap(
  context: ProvisioningContext,
  teamName: string | null,
): Map<string, string> {
  const stored = context.state.values.get(queryMapStateKey(teamName))
  return stored instanceof Map ? (stored as Map<string, string>) : new Map()
}

/** Stores the query-name-to-id map created by `sharedQueriesPhase` for one dashboard group. */
export function setSharedQueryIdMap(
  context: ProvisioningContext,
  teamName: string | null,
  map: Map<string, string>,
): void {
  context.state.values.set(queryMapStateKey(teamName), map)
}
