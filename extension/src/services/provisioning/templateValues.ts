import type { ProvisioningState } from './types'

const tokenPattern = /\$([A-Za-z][A-Za-z0-9]*)\$/gu

export function applyTemplateValues<T>(
  value: T,
  state: ProvisioningState,
): T {
  const replacements = new Map<string, string>([
    ['projectName', state.projectName],
    ['projectId', state.projectId],
    ['ProjectName', state.projectName],
    ['ProjectId', state.projectId],
  ])

  for (const [key, storedValue] of state.values) {
    if (
      typeof storedValue === 'string' ||
      typeof storedValue === 'number' ||
      typeof storedValue === 'boolean'
    ) {
      replacements.set(key, String(storedValue))
    }
  }

  return visit(value, replacements) as T
}

function visit(value: unknown, replacements: Map<string, string>): unknown {
  if (typeof value === 'string') {
    return value.replace(tokenPattern, (original, key: string) =>
      replacements.get(key) ?? original,
    )
  }
  if (Array.isArray(value)) {
    return value.map((item) => visit(item, replacements))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        visit(item, replacements),
      ]),
    )
  }
  return value
}
