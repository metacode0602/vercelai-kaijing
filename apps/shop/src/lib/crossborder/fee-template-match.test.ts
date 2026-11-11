import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  hsPatternMatch,
  phase1WouldMiss,
  scoreFeeTemplateRules,
  selectTemplatesByMatchRules,
} from './fee-template-match'

const parent = 'cat-electronics'
const child = 'cat-phones'
const ancestors = [child, parent, 'cat-root']

describe('fee template matching (phase 2)', () => {
  it('品类祖先回溯：子类目在第一期会错过，现在能命中父类规则', () => {
    const rule = {
      templateId: 'tpl-daraz',
      categoryId: parent,
      hsCodePattern: null,
      priority: 20,
    }
    assert.equal(
      phase1WouldMiss({ ruleCategoryId: parent, skuCategoryId: child, categoryAncestorIds: ancestors }),
      true,
    )
    const score = scoreFeeTemplateRules([rule], {
      platform: 'daraz',
      country: 'LK',
      categoryId: child,
      categoryAncestorIds: ancestors,
    })
    assert.equal(score.ok, true)
    assert.ok(score.specificity > 0)
    assert.match(score.reason, /祖先/)
  })

  it('HS 章节回退：模式 3900 在第一期 startsWith 会错过 392410，现在按章命中', () => {
    assert.equal(hsPatternMatch('3924.10', '3900').ok, true)
    assert.equal(hsPatternMatch('3924.10', '3900').depth, 2)
    assert.equal(
      phase1WouldMiss({ hsCode: '392410', hsCodePattern: '3900' }),
      true,
    )
    const score = scoreFeeTemplateRules(
      [{ templateId: 'tpl', categoryId: null, hsCodePattern: '3900', priority: 10 }],
      { platform: 'daraz', country: 'LK', hsCode: '3924.10' },
    )
    assert.equal(score.ok, true)
  })

  it('更长 HS 前缀优先于章回退，精确品类优先于祖先', () => {
    const scores = scoreFeeTemplateRules(
      [
        { templateId: 'tpl', categoryId: parent, hsCodePattern: '39', priority: 99 },
        { templateId: 'tpl', categoryId: child, hsCodePattern: '3924', priority: 1 },
      ],
      {
        platform: 'daraz',
        country: 'LK',
        categoryId: child,
        categoryAncestorIds: ancestors,
        hsCode: '39241000',
      },
    )
    assert.equal(scores.ok, true)
    // HS 4 位 * 10 + 精确品类 8 = 48，高于章 2 位 * 10 + 祖先
    assert.equal(scores.specificity, 48)
    assert.match(scores.reason, /HS 前缀/)
  })

  it('不会把 Daraz 规则或模板混用到 Lazada', () => {
    const templates = [
      { id: 'daraz-lk', platform: 'daraz', country: 'LK' },
      { id: 'lazada-my', platform: 'lazada', country: 'MY' },
    ]
    const rules = [
      { templateId: 'daraz-lk', categoryId: parent, hsCodePattern: '85', priority: 10 },
      { templateId: 'lazada-my', categoryId: parent, hsCodePattern: '85', priority: 99 },
    ]
    const picked = selectTemplatesByMatchRules(templates, rules, {
      platform: 'daraz',
      country: 'LK',
      categoryId: child,
      categoryAncestorIds: ancestors,
      hsCode: '85076090',
    })
    assert.equal(picked.length, 1)
    assert.equal(picked[0]?.template.id, 'daraz-lk')
    assert.equal(picked[0]?.template.platform, 'daraz')
  })

  it('无规则的模板仍可作为同平台站点兜底，但不会跨平台', () => {
    const picked = selectTemplatesByMatchRules(
      [
        { id: 'daraz-catch', platform: 'daraz', country: 'LK' },
        { id: 'lazada-catch', platform: 'lazada', country: 'LK' },
      ],
      [],
      { platform: 'daraz', country: 'LK', categoryId: child, categoryAncestorIds: ancestors },
    )
    assert.equal(picked.length, 1)
    assert.equal(picked[0]?.template.id, 'daraz-catch')
    assert.equal(picked[0]?.score.specificity, 0)
  })

  it('模板已有规则但未命中时排除，避免误用', () => {
    const picked = selectTemplatesByMatchRules(
      [{ id: 'tpl', platform: 'daraz', country: 'LK' }],
      [{ templateId: 'tpl', categoryId: 'other', hsCodePattern: null, priority: 10 }],
      { platform: 'daraz', country: 'LK', categoryId: child, categoryAncestorIds: ancestors },
    )
    assert.equal(picked.length, 0)
  })
})
