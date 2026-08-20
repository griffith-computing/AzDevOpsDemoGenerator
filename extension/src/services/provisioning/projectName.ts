const invalidProjectName = /[/\\:*?"<>|#$&%+]/u

export function validateProjectName(name: string): void {
  if (!name.trim()) {
    throw new Error('Enter a project name.')
  }
  if (name !== name.trim()) {
    throw new Error('Project names cannot start or end with whitespace.')
  }
  if (name.length > 64) {
    throw new Error('Project names cannot exceed 64 characters.')
  }
  const hasControlCharacter = [...name].some(
    (character) => character.codePointAt(0)! < 32,
  )
  if (hasControlCharacter || invalidProjectName.test(name) || name.endsWith('.')) {
    throw new Error('The project name contains characters Azure DevOps does not allow.')
  }
}
