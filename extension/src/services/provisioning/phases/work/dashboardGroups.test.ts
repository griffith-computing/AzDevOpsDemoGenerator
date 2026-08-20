import { describe, expect, it } from 'vitest'
import type { TemplateAssetLoader } from '../../../TemplateAssetLoader'
import { discoverDashboardGroups } from './dashboardGroups'

describe('discoverDashboardGroups', () => {
  it('ignores unrelated legacy dashboard helper assets', () => {
    const loader = {
      filesUnder: () => [
        'Dashboard/Dashboard.json',
        'Dashboard/Queries/All Work Items.json',
        'Dashboard/WidgetQuery.json',
      ],
    } as unknown as TemplateAssetLoader

    expect(discoverDashboardGroups(loader)).toEqual([
      {
        teamName: null,
        dashboardAsset: 'Dashboard/Dashboard.json',
        queryAssets: ['Dashboard/Queries/All Work Items.json'],
      },
    ])
  })
})
