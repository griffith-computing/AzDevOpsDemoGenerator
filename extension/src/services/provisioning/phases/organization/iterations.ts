import type { AzureDevOpsClient } from '../../../AzureDevOpsClient'
import type { ProvisioningPhase } from '../../types'
import { type ClassificationNode, encodePathSegments, iterationsManifestPath, projectPath } from './shared'

/** The shape of a node in the template's `Iterations.json` tree. */
interface IterationTemplateNode {
  name?: string | null
  structureType?: string | null
  hasChildren?: boolean
  children?: IterationTemplateNode[] | null
}

/**
 * Creates the project's iteration classification-node tree from `Iterations.json`.
 *
 * Azure DevOps REST 7.1 allows the classification node create endpoint to take an
 * optional parent `path` segment, so nested nodes can be created directly at their
 * intended position in a single call instead of creating at the root and moving them
 * afterwards. Existing nodes (for example the default sprints an Agile/Scrum process
 * template seeds automatically) are detected by name and reused rather than recreated.
 */
export const iterationsPhase: ProvisioningPhase = {
  id: 'organization-iterations',
  label: 'Create iteration paths',
  isApplicable: (context) => context.loader.has(iterationsManifestPath),
  async run(context) {
    const { client, loader, state, signal } = context

    const template = await loader.json<IterationTemplateNode>(iterationsManifestPath)
    const existingRoot = await client.request<ClassificationNode>(
      projectPath(state.projectId, '/_apis/wit/classificationnodes/iterations?$depth=5&api-version=7.1'),
      {},
      signal,
    )

    const templateChildren = template.children ?? []
    const existingChildren = existingRoot.children ?? []

    for (const child of templateChildren) {
      await ensureIterationNode(client, state.projectId, signal, child, existingChildren, [])
    }
  },
}

async function ensureIterationNode(
  client: AzureDevOpsClient,
  projectId: string,
  signal: AbortSignal,
  templateNode: IterationTemplateNode,
  existingSiblings: ClassificationNode[],
  parentSegments: string[],
): Promise<void> {
  const name = templateNode.name
  if (!name) {
    return
  }

  let node = existingSiblings.find((sibling) => sibling.name === name)
  if (!node) {
    const parentSuffix = parentSegments.length > 0 ? `/${encodePathSegments(parentSegments)}` : ''
    node = await client.request<ClassificationNode>(
      projectPath(projectId, `/_apis/wit/classificationnodes/iterations${parentSuffix}?api-version=7.1`),
      { method: 'POST', body: JSON.stringify({ name }) },
      signal,
    )
  }

  const templateChildren = templateNode.children ?? []
  if (templateChildren.length === 0) {
    return
  }

  const existingChildren = node.children ?? []
  for (const child of templateChildren) {
    await ensureIterationNode(client, projectId, signal, child, existingChildren, [...parentSegments, name])
  }
}
