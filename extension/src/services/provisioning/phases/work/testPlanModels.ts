import type { JsonValue } from './jsonValue'

/**
 * The contents of a `TestPlans/&lt;name&gt;.json` template asset. Only `name` is
 * required by this phase; every other field (`iteration`, `areaPath`, ...) is
 * forwarded to the create-plan request untouched aside from token
 * substitution, matching `CreateTestPlan` in
 * `src/API/TestManagement/TestManagement.cs`, which posts the template JSON
 * as-is.
 */
export interface TestPlanTemplate {
  name: string
  [key: string]: JsonValue
}

/** Response returned by the create-test-plan endpoint. */
export interface TestPlanCreateResponse {
  id: number
  name: string
}

/** One entry of a `TestPlans/TestSuites/&lt;name&gt;.json` template asset's `value` array. */
export interface TestSuiteTemplateValue {
  name: string
  plan: { id: string; name: string }
  requirementIds: string[]
  revision: number
  suiteType: string
  inheritDefaultConfigurations: boolean
  /**
   * Old work item ids (Test Case type) to add to the suite once created.
   * Not an Azure DevOps test suite property - forwarded to the create-suite
   * request body verbatim for parity with `CreatTestSuite`, then read
   * locally by this phase to resolve and add the corresponding new ids.
   */
  TestCases: string[]
}

/** The contents of a `TestPlans/TestSuites/&lt;name&gt;.json` template asset. */
export interface TestSuiteTemplateFile {
  count: number
  value: TestSuiteTemplateValue[]
}

/** Response returned by the create-test-suite endpoint. */
export interface TestSuiteCreateResponse {
  count: number
  value: { id: number; name: string }[]
}
