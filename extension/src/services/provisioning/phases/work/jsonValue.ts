/**
 * A structurally-typed JSON value, used where a template asset's fields are
 * forwarded to Azure DevOps largely unmodified (dashboard widgets, test
 * plans) and enumerating every possible property up front would be brittle -
 * exported template captures are known to carry extra, inconsistent
 * properties (see `DashboardWidgetTemplate` in `dashboardModels.ts`).
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }
