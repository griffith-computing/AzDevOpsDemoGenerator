/**
 * Generic `$token$` substitution used by the work-item, test-plan, query, and
 * dashboard phases for template placeholders that `applyTemplateValues` cannot
 * resolve: it only matches keys starting with a letter
 * (see `../../templateValues.ts`), whereas legacy demo templates also embed
 * numeric old-work-item-id tokens (e.g. `$5312$`) and space-containing names
 * (e.g. `$Active Stories$`). This mirrors `applyTemplateValues`'s recursive
 * string/array/object walk but accepts any token content and an explicit,
 * caller-supplied replacement map instead of `ProvisioningState`.
 */
const tokenPattern = /\$([^$]+)\$/gu

export function substituteTokens<T>(
  value: T,
  tokenValues: ReadonlyMap<string, string>,
): T {
  return visit(value, tokenValues) as T
}

function visit(value: unknown, tokenValues: ReadonlyMap<string, string>): unknown {
  if (typeof value === 'string') {
    return value.replace(tokenPattern, (original, key: string) =>
      tokenValues.get(key) ?? original,
    )
  }
  if (Array.isArray(value)) {
    return value.map((item) => visit(item, tokenValues))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, visit(item, tokenValues)]),
    )
  }
  return value
}

/** Joins path segments, percent-encoding each segment independently. */
export function encodePathSegments(...segments: string[]): string {
  return segments.map((segment) => encodeURIComponent(segment)).join('/')
}
