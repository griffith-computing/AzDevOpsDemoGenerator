import { applyTemplateValues } from '../../templateValues'
import type { ProvisioningPhase } from '../../types'
import { assertNoUnresolvedPlaceholders, directChildFiles, listTeams, substituteExtendedTokens } from './shared'

const deliveryPlansDirectory = 'DeliveryPlans'

/**
 * A delivery (work item) plan template. `teamBacklogMappings[].teamId`
 * fields (and potentially other places) carry `$<TeamName>$` tokens; the
 * remaining card/style settings vary per plan and are forwarded unchanged.
 */
type DeliveryPlanTemplate = Record<string, unknown> & { name: string; revision?: number }

interface CreatedDeliveryPlan {
  id: string
}

/**
 * Creates the delivery plans declared under the template's `DeliveryPlans`
 * folder, resolving `$<TeamName>$` tokens (e.g. `$App Development Team$`)
 * against every team in the project.
 *
 * After creation, the plan is immediately re-submitted with `revision`
 * forced to `1`, mirroring the legacy tool: the initial `POST` does not
 * reliably persist every card/style setting, so a follow-up `PUT` of the
 * same (resolved) body is required to make them stick.
 */
export const deliveryPlansPhase: ProvisioningPhase = {
  id: 'delivery-plans',
  label: 'Create delivery plans',
  dependsOn: ['organization-teams', 'work-items'],
  isApplicable: (context) => directChildFiles(context.loader, deliveryPlansDirectory).length > 0,
  run: async (context) => {
    const { client, loader, state, signal } = context
    const files = directChildFiles(loader, deliveryPlansDirectory)

    const teams = await listTeams(context)
    const teamTokens = new Map<string, string>()
    for (const team of teams) {
      teamTokens.set(team.name, team.id)
      teamTokens.set(team.name.toLowerCase(), team.id)
    }

    for (const file of files) {
      const raw = await loader.json<DeliveryPlanTemplate>(file)
      const resolved = applyTemplateValues(raw, state)
      const withTeamTokens = substituteExtendedTokens<DeliveryPlanTemplate>(
        resolved,
        (token) => teamTokens.get(token) ?? teamTokens.get(token.toLowerCase()),
      )
      assertNoUnresolvedPlaceholders(withTeamTokens, `Delivery plan "${withTeamTokens.name}"`)

      const created = await client.request<CreatedDeliveryPlan>(
        `/${encodeURIComponent(state.projectId)}/_apis/work/plans?api-version=7.1`,
        { method: 'POST', body: JSON.stringify(withTeamTokens) },
        signal,
      )

      const updateBody: DeliveryPlanTemplate = { ...withTeamTokens, revision: 1 }
      await client.request<void>(
        `/${encodeURIComponent(state.projectId)}/_apis/work/plans/${encodeURIComponent(
          created.id,
        )}?api-version=7.1`,
        { method: 'PUT', body: JSON.stringify(updateBody) },
        signal,
      )
    }
  },
}
