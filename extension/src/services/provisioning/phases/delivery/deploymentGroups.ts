import { applyTemplateValues } from '../../templateValues'
import type { ProvisioningPhase } from '../../types'
import { assertNoUnresolvedPlaceholders } from './shared'

const deploymentGroupManifestPath = 'DeploymentGroups/CreateDeploymentGroup.json'

interface DeploymentGroupPoolReference {
  name?: string
}

interface DeploymentGroupTemplate {
  name: string
  description?: string
  pool?: DeploymentGroupPoolReference
}

interface DeploymentGroup {
  id: number
  name: string
}

/**
 * Creates the deployment group declared at
 * `DeploymentGroups/CreateDeploymentGroup.json`, matching the legacy
 * desktop tool's file convention. No template currently ships this file
 * (deployment groups never made it into the main provisioning flow in the
 * legacy tool either — this method existed but was never called), so this
 * phase is effectively inert against today's catalog; it is implemented to
 * spec so a future template that adds the file is provisioned correctly
 * rather than silently ignored.
 */
export const deploymentGroupsPhase: ProvisioningPhase = {
  id: 'deployment-groups',
  label: 'Create deployment groups',
  isApplicable: (context) => context.loader.has(deploymentGroupManifestPath),
  run: async (context) => {
    const { client, loader, state, signal } = context

    const raw = await loader.json<DeploymentGroupTemplate>(deploymentGroupManifestPath)
    const resolved = applyTemplateValues(raw, state)
    assertNoUnresolvedPlaceholders(resolved, `Deployment group "${resolved.name}"`)

    await client.request<DeploymentGroup>(
      `/${encodeURIComponent(state.projectId)}/_apis/distributedtask/deploymentgroups?api-version=7.1`,
      { method: 'POST', body: JSON.stringify(resolved) },
      signal,
    )
  },
}
