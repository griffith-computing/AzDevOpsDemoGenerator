import type { ProvisioningPhase } from '../../types'
import { areasPhase } from './areas'
import { boardColumnsPhase } from './boardColumns'
import { boardSwimlanesPhase } from './boardSwimlanes'
import { cardFieldsPhase } from './cardFields'
import { cardStylesPhase } from './cardStyles'
import { iterationsPhase } from './iterations'
import { teamSettingsPhase } from './teamSettings'
import { teamsPhase } from './teams'

/**
 * Organization-scope provisioning phases: iterations, teams, areas, team settings, and
 * board customization (columns, swimlanes, card fields, card styles). Order matters —
 * each phase declares `dependsOn` for the phases it relies on, and the array order below
 * keeps that dependency chain readable top-to-bottom.
 */
export const organizationPhases: ProvisioningPhase[] = [
  iterationsPhase,
  teamsPhase,
  areasPhase,
  teamSettingsPhase,
  boardColumnsPhase,
  boardSwimlanesPhase,
  cardFieldsPhase,
  cardStylesPhase,
]

export { areasPhase } from './areas'
export { boardColumnsPhase } from './boardColumns'
export { boardSwimlanesPhase } from './boardSwimlanes'
export { cardFieldsPhase } from './cardFields'
export { cardStylesPhase } from './cardStyles'
export { iterationsPhase } from './iterations'
export { teamSettingsPhase } from './teamSettings'
export { teamsPhase } from './teams'
