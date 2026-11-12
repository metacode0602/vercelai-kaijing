import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getOfficialFeeCapability } from '@workspace/marketplace'
import {
  feeVersionSourceLabel,
  officialTemplateCode,
  planOfficialFeeSync,
  type ExistingFeeTemplateSnapshot,
  type OfficialFeeComponent,
  type OfficialFeeScheduleItem,
} from './official-fee-sync'

const components = (commission: number): OfficialFeeComponent[] => [
  { code: 'commission', labelZh: '佣金', rate: commission, unit: 'pct' },
  { code: 'payout', labelZh: '回款', rate: 2, unit: 'pct' },
]

const schedule = (rate = 8): OfficialFeeScheduleItem => ({
  platform: 'lazada',
  site: 'MY',
  categoryId: 'cat-3c',
  categoryName: '3C',
  components: components(rate),
  raw: { official: true, commission: rate },
})

describe('official fee sync planner', () => {
  it('is honest when the platform has no official fee API', () => {
    const plan = planOfficialFeeSync({
      platform: 'lazada',
      schedules: [schedule()],
    })
    assert.equal(plan.status, 'unsupported')
    assert.equal(plan.reasonZh, '该平台暂无官方费率接口，仍使用本组织费用模板')
    assert.equal(plan.actions.length, 0)
    assert.equal(getOfficialFeeCapability('daraz').supported, false)
  })

  it('maps an official payload to a draft template version that is not published', () => {
    const capability = { ...getOfficialFeeCapability('lazada'), supported: true, status: 'ready' as const }
    const plan = planOfficialFeeSync({
      platform: 'lazada',
      capability,
      schedules: [schedule(8)],
    })
    assert.equal(plan.status, 'success')
    assert.equal(plan.actions.length, 1)
    const action = plan.actions[0]
    assert.equal(action?.type, 'create_template_with_draft')
    if (action?.type !== 'create_template_with_draft') throw new Error('expected create')
    assert.equal(action.templateCode, officialTemplateCode({ platform: 'lazada', site: 'MY', categoryId: 'cat-3c' }))
    assert.equal(action.components[0]?.rate, 8)
    assert.ok(!('published' in action) || (action as { published?: boolean }).published !== true)
  })

  it('does not overwrite a published ops-edited version; opens a new draft instead', () => {
    const capability = { ...getOfficialFeeCapability('lazada'), supported: true, status: 'ready' as const }
    const existing: ExistingFeeTemplateSnapshot[] = [
      {
        id: 'tpl-1',
        code: officialTemplateCode({ platform: 'lazada', site: 'MY', categoryId: 'cat-3c' }),
        name: '运营已改过的模板',
        platform: 'lazada',
        country: 'MY',
        type: 'platform_fee',
        versions: [
          {
            id: 'ver-pub',
            status: 'published',
            published: true,
            source: 'manual',
            components: components(6),
            note: 'ops edited',
          },
        ],
        matchRules: [{ categoryId: 'cat-3c' }],
      },
    ]
    const plan = planOfficialFeeSync({
      platform: 'lazada',
      capability,
      schedules: [schedule(8)],
      existing,
    })
    assert.equal(plan.status, 'success')
    const action = plan.actions[0]
    assert.equal(action?.type, 'create_draft_version')
    if (action?.type !== 'create_draft_version') throw new Error('expected draft')
    assert.equal(action.templateId, 'tpl-1')
    assert.equal(action.preservePublished, true)
    assert.match(action.note, /不覆盖运营已发布的版本/)
    assert.equal(feeVersionSourceLabel({ source: 'official_sync', status: 'draft' }), '来自官方费率同步草稿（待审核）')
    assert.equal(feeVersionSourceLabel({ source: 'official_sync', published: true }), '来自本组织费用模板')
    assert.equal(feeVersionSourceLabel({ source: 'manual', published: true }), '来自本组织费用模板')
    assert.equal(feeVersionSourceLabel({ source: 'platform_catalog', status: 'draft' }), '来自平台默认费用模板（待复核发布）')
    assert.equal(feeVersionSourceLabel({ source: 'platform_catalog', published: true }), '来自平台默认费用模板（本组织已发布）')
  })

  it('updates an existing official draft instead of touching the published version', () => {
    const capability = { ...getOfficialFeeCapability('lazada'), supported: true, status: 'ready' as const }
    const existing: ExistingFeeTemplateSnapshot[] = [
      {
        id: 'tpl-1',
        code: officialTemplateCode({ platform: 'lazada', site: 'MY', categoryId: 'cat-3c' }),
        name: '模板',
        platform: 'lazada',
        country: 'MY',
        type: 'platform_fee',
        versions: [
          { id: 'ver-pub', status: 'published', published: true, source: 'manual', components: components(6) },
          { id: 'ver-draft', status: 'draft', published: false, source: 'official_sync', components: components(7) },
        ],
      },
    ]
    const plan = planOfficialFeeSync({
      platform: 'lazada',
      capability,
      schedules: [schedule(8)],
      existing,
    })
    const action = plan.actions[0]
    assert.equal(action?.type, 'update_official_draft')
    if (action?.type !== 'update_official_draft') throw new Error('expected update')
    assert.equal(action.versionId, 'ver-draft')
    assert.equal(action.components[0]?.rate, 8)
  })

  it('records failed and partial pulls honestly', () => {
    const capability = { ...getOfficialFeeCapability('daraz'), supported: true, status: 'ready' as const }
    const failed = planOfficialFeeSync({
      platform: 'daraz',
      capability,
      pullError: '店铺尚未配置有效授权，无法调用官方接口。',
    })
    assert.equal(failed.status, 'failed')
    assert.match(failed.reasonZh, /尚未配置有效授权/)
    assert.equal(failed.actions.length, 0)

    const partial = planOfficialFeeSync({
      platform: 'daraz',
      capability,
      schedules: [schedule(8), { ...schedule(9), components: [] }],
    })
    assert.equal(partial.status, 'partial')
    assert.ok(partial.actions.some((a) => a.type === 'create_template_with_draft'))
    assert.ok(partial.actions.some((a) => a.type === 'skip'))
  })
})
