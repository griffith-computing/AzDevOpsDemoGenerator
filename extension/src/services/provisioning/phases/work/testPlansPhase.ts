import type { ProvisioningPhase } from '../../types'
import { applyTemplateValues } from '../../templateValues'
import type { TemplateAssetLoader } from '../../../TemplateAssetLoader'
import { substituteTokens } from './tokens'
import { getWorkItemIdMap } from './workItemState'
import type {
  TestPlanCreateResponse,
  TestPlanTemplate,
  TestSuiteCreateResponse,
  TestSuiteTemplateFile,
} from './testPlanModels'

const testPlansDirectory = 'TestPlans'
const testSuitesDirectory = 'TestPlans/TestSuites'

interface TestPlanFilePair {
  planAsset: string
  suitesAsset?: string
}

/**
 * Pairs each root `TestPlans/&lt;name&gt;.json` file with its
 * `TestPlans/TestSuites/&lt;name&gt;.json` counterpart, matched by identical
 * file name - the convention used by `CreateTestManagement` in
 * `src/ADOGenerator/Services/ProjectService.cs` (`"\\TestPlans\\TestSuites\\" + fileName`).
 * Root-level enumeration is non-recursive (mirrors the legacy
 * `Directory.GetFiles(testPlansFolder)`, which never descends into the
 * `TestSuites` subfolder), so only direct children of `TestPlans/` are
 * treated as plans.
 */
function discoverTestPlanFilePairs(loader: TemplateAssetLoader): TestPlanFilePair[] {
  const planAssets = loader
    .filesUnder(testPlansDirectory)
    .filter((file) => !file.slice(testPlansDirectory.length + 1).includes('/'))

  return planAssets.map((planAsset) => {
    const fileName = planAsset.split('/').pop()
    if (!fileName) {
      throw new Error(`Could not determine a file name from template asset "${planAsset}".`)
    }
    const suitesAsset = `${testSuitesDirectory}/${fileName}`
    return { planAsset, suitesAsset: loader.has(suitesAsset) ? suitesAsset : undefined }
  })
}

/**
 * Creates the test plans declared under `TestPlans/&lt;name&gt;.json` and, where a
 * matching `TestPlans/TestSuites/&lt;name&gt;.json` exists, the requirement-based
 * suites underneath each plan's root suite, ported from `CreateTestManagement`
 * in `src/ADOGenerator/Services/ProjectService.cs` and
 * `CreateTestPlan`/`CreatTestSuite`/`AddTestCasesToSuite` in
 * `src/API/TestManagement/TestManagement.cs`.
 *
 * Depends on `work-items` because suite `requirementIds`/`name` placeholders
 * (old numeric work item ids, e.g. `$5312$`) and `TestCases` entries (raw old
 * ids) are resolved against the id map `workItemsPhase` stores via
 * `setWorkItemIdMap`.
 */
export const testPlansPhase: ProvisioningPhase = {
  id: 'work-test-plans',
  label: 'Create test plans and suites',
  dependsOn: ['work-items'],
  isApplicable: (context) => discoverTestPlanFilePairs(context.loader).length > 0,
  async run(context) {
    const { client, loader, state, signal } = context
    const workItemIdMap = getWorkItemIdMap(context)
    const testCaseIdMap = new Map(
      [...workItemIdMap.entries()].filter(([, entry]) => entry.type === 'Test Case'),
    )

    const pairs = [...discoverTestPlanFilePairs(loader)].sort((a, b) =>
      a.planAsset.localeCompare(b.planAsset),
    )

    for (const { planAsset, suitesAsset } of pairs) {
      const rawPlan = await loader.json<TestPlanTemplate>(planAsset)
      const plan = substituteTokens(
        applyTemplateValues(rawPlan, state),
        new Map([['project', state.projectName]]),
      )

      const planResponse = await client.request<TestPlanCreateResponse>(
        `/${encodeURIComponent(state.projectId)}/_apis/test/plans?api-version=7.1`,
        { method: 'POST', body: JSON.stringify(plan) },
        signal,
      )

      if (!suitesAsset) {
        continue
      }

      const rawSuites = await loader.json<TestSuiteTemplateFile>(suitesAsset)
      const suiteTokenValues = new Map<string, string>([
        ['planID', String(planResponse.id)],
        ['planName', planResponse.name],
      ])
      for (const [oldId, entry] of workItemIdMap) {
        suiteTokenValues.set(oldId, entry.newId)
      }

      const suitesFile = substituteTokens(
        applyTemplateValues(rawSuites, state),
        suiteTokenValues,
      )

      // Azure DevOps always assigns the plan's root suite the id
      // `planId + 1`; the create-suite endpoint requires it as the parent.
      const parentSuiteId = planResponse.id + 1

      for (const suite of suitesFile.value) {
        const suiteResponse = await client.request<TestSuiteCreateResponse>(
          `/${encodeURIComponent(
            state.projectId,
          )}/_apis/test/plans/${planResponse.id}/suites/${parentSuiteId}?api-version=7.1`,
          { method: 'POST', body: JSON.stringify(suite) },
          signal,
        )

        const createdSuite = suiteResponse.value[0]
        if (!createdSuite) {
          throw new Error(`Test suite "${suite.name}" creation did not return a suite id.`)
        }

        const newTestCaseIds = suite.TestCases.map((oldId) => {
          const entry = testCaseIdMap.get(oldId)
          if (!entry) {
            throw new Error(
              `Test case ${oldId} referenced by suite "${suite.name}" was not created.`,
            )
          }
          return entry.newId
        })

        if (newTestCaseIds.length === 0) {
          continue
        }

        await client.request<unknown>(
          `/${encodeURIComponent(
            state.projectId,
          )}/_apis/test/plans/${planResponse.id}/suites/${createdSuite.id}/testcases/${newTestCaseIds.join(
            ',',
          )}?api-version=7.1`,
          { method: 'POST', body: JSON.stringify({}) },
          signal,
        )
      }
    }
  },
}
