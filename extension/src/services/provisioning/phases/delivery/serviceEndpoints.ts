import { applyTemplateValues } from '../../templateValues'
import type { ProvisioningPhase } from '../../types'
import type { ProjectReference } from './shared'
import { assertNoUnresolvedPlaceholders, serviceEndpointFiles } from './shared'

interface ServiceEndpointAuthorization {
  scheme: string
  parameters?: Record<string, string>
}

interface ServiceEndpointTemplate {
  data?: Record<string, unknown>
  name: string
  type: string
  url?: string
  description?: string
  authorization?: ServiceEndpointAuthorization
  isReady?: boolean
  isShared?: boolean
}

interface ServiceEndpointProjectReference {
  projectReference: ProjectReference
  name: string
}

interface CreateServiceEndpointBody extends ServiceEndpointTemplate {
  serviceEndpointProjectReferences: ServiceEndpointProjectReference[]
}

interface ServiceEndpoint {
  id: string
  name: string
}

/**
 * Creates the service connections declared under the template's
 * `ServiceEndpoints`/`ServiceEndPoints` folder (both casings appear across
 * the catalog), populating `context.state.endpointIds` for later phases.
 *
 * Import-only endpoints for catalog sources known to be public are omitted;
 * those imports use anonymous access instead. Other templates encode
 * credentials as `$username$`/`$password$`/`$Apikey$`/
 * `$GitUserName$`/`$GitUserPassword$`/`$URL$`-style placeholders. This tool
 * never fabricates or persists secret values (unlike the legacy desktop
 * tool, which filled them from server-side configuration), so a template
 * that needs one fails actionably instead: populate
 * `ProvisioningState.values` with a matching key before provisioning to
 * supply it, or choose a template that does not require credentials.
 */
export const serviceEndpointsPhase: ProvisioningPhase = {
  id: 'service-endpoints',
  label: 'Create service endpoints',
  isApplicable: (context) => serviceEndpointFiles(context.loader).length > 0,
  run: async (context) => {
    const { client, loader, state, signal } = context
    const skippedEndpoints = new Set(loader.entry.importOnlyServiceEndpoints)

    for (const file of serviceEndpointFiles(loader)) {
      const raw = await loader.json<ServiceEndpointTemplate>(file)
      if (skippedEndpoints.has(raw.name)) {
        continue
      }
      const resolved = applyTemplateValues(raw, state)
      assertNoUnresolvedPlaceholders(resolved, `Service endpoint "${resolved.name}"`)

      const body: CreateServiceEndpointBody = {
        ...resolved,
        serviceEndpointProjectReferences: [
          {
            projectReference: { id: state.projectId, name: state.projectName },
            name: resolved.name,
          },
        ],
      }

      const endpoint = await client.request<ServiceEndpoint>(
        '/_apis/serviceendpoint/endpoints?api-version=7.1',
        { method: 'POST', body: JSON.stringify(body) },
        signal,
      )

      state.endpointIds.set(endpoint.name, endpoint.id)
      // Alongside endpointIds so downstream `$<endpointname>$` tokens that
      // happen to be alphanumeric resolve through the shared
      // applyTemplateValues pass too; endpointIds remains the source of
      // truth for names containing characters that regex cannot match.
      state.values.set(endpoint.name, endpoint.id)
    }
  },
}
