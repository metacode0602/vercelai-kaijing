# Lazada 广告（Sponsored Solutions）API

> 核验日期：2026-11-05。来源：Lazada 官方 API Reference（Sponsored Solutions `cid=49`，38 个接口）。
> 官方入口：<https://open.lazada.com/doc/api.htm>
> 通用签名、host 见 `lazada-common-conventions.md`。
> Daraz 官方 Open API **没有** Advertising 分类；双平台广告方案见 `lazada-daraz-unified-design.md`。

## 1. 解决方案与层级

```text
Seller / Agency 签约
  └─ Solution（bizCode，如 sponsoredSearch / sponsoredDiscovery）
       └─ Campaign（预算、起止、竞价目标、版位）
            └─ Adgroup（一个推广商品 + 出价 + 定向 + 关键词）
                 ├─ Keyword（关键词 + 出价）
                 ├─ Audience（人群溢价）
                 └─ Creative（创意，通常自动）
```

SMAX（Smart Ads / AI 投放）是独立投放形态，层级与普通 Sponsored Solutions 不同：

```text
SMAX Campaign（biddingType: bcb / mcb / troi）
  └─ Adgroup + Creative（平台自动生成映射）
```

## 2. 接口清单（38 个）

### 2.1 账户与解决方案（4）

| 接口 | 方法 | 路径 | 用途 |
|---|---|---|---|
| sign | GET/POST | `/sponsor/solutions/account/sign` | 卖家/代运营签署 T&C |
| getAccountSignInfo | GET/POST | `/sponsor/solutions/account/getAccountSignInfo` | 查询签约信息 |
| getLatestSignInfo | GET/POST | `/sponsor/solutions/account/getLatestSignInfo` | 最新签约状态 |
| addSolution | POST | `/sponsor/solutions/addSolution` | 创建广告解决方案（含 campaign + adgroup） |

### 2.2 Campaign（5）

| 接口 | 方法 | 路径 | 用途 |
|---|---|---|---|
| searchCampaignList | GET/POST | `/sponsor/solutions/campaign/searchCampaignList` | 分页查 campaign |
| getCampaign | GET/POST | `/sponsor/solutions/campaign/getCampaign` | campaign 详情 |
| getCampaignCount | GET/POST | `/sponsor/solutions/campaign/getCampaignCount` | campaign 数量 |
| updateCampaign | GET/POST | `/sponsor/solutions/campaign/updateCampaign` | 更新/启停 campaign |
| deleteCampaign | GET/POST | `/sponsor/solutions/campaign/deleteCampaign` | 删除 campaign |

### 2.3 Adgroup（4）

| 接口 | 方法 | 路径 | 用途 |
|---|---|---|---|
| searchAdgroupList | GET/POST | `/sponsor/solutions/adgroup/searchAdgroupList` | 查 adgroup |
| addAdgroupBatch | GET/POST | `/sponsor/solutions/adgroup/addAdgroupBatch` | 批量新增 |
| updateAdgroupBatch | GET/POST | `/sponsor/solutions/adgroup/updateAdgroupBatch` | 批量更新 |
| deleteAdgroupBatch | GET/POST | `/sponsor/solutions/adgroup/deleteAdgroupBatch` | 批量删除 |

### 2.4 商品、类目、关键词（5）

| 接口 | 方法 | 路径 | 用途 |
|---|---|---|---|
| searchProductWithPage | GET/POST | `/sponsor/solutions/product/searchProductWithPage` | 搜索可推广商品 |
| listCategory | GET/POST | `/sponsor/solutions/category/listCategory` | 广告类目 |
| searchKeyword | GET/POST | `/sponsor/solutions/keyword/searchKeyword` | 关键词推荐/查价 |
| listKeywordByAdgroup | GET/POST | `/sponsor/solutions/keyword/listKeywordByAdgroup` | 按 adgroup 查关键词 |
| listKeywordByItem | GET/POST | `/sponsor/solutions/keyword/listKeywordByItem` | 按商品查关键词 |

### 2.5 报表（9）

| 接口 | 方法 | 路径 | 用途 |
|---|---|---|---|
| getReportOverview | GET/POST | `/sponsor/solutions/report/getReportOverview` | 总览（今日/昨日） |
| getReportOverviewMetric | GET/POST | `/sponsor/solutions/report/getReportOverviewMetric` | 单指标趋势 |
| getReportCampaignOnPrePlacement | GET/POST | `/sponsor/solutions/report/getReportCampaignOnPrePlacement` | 分版位 campaign 报表 |
| getDiscoveryReportCampaign | GET/POST | `/sponsor/solutions/report/getDiscoveryReportCampaign` | Discovery campaign |
| getDiscoveryReportAdgroup | GET/POST | `/sponsor/solutions/report/getDiscoveryReportAdgroup` | Discovery adgroup |
| getDiscoveryReportKeyword | GET/POST | `/sponsor/solutions/report/getDiscoveryReportKeyword` | Discovery keyword |
| getDiscoveryReportAudience | GET/POST | `/sponsor/solutions/report/getDiscoveryReportAudience` | Discovery audience |
| getReportOverviewMetric（SMAX） | GET/POST | `/sponsor/solution/smax/report/getReportOverviewMetric` | SMAX 指标趋势 |
| getReportOverview（SMAX） | GET/POST | `/sponsor/solution/smax/report/getReportOverview` | SMAX 总览 |

### 2.6 钱包（2）

| 接口 | 方法 | 路径 | 用途 |
|---|---|---|---|
| getAutoTopUpOptionOneConfig | GET/POST | `/sponsor/solutions/wallet/getAutoTopUpOptionOneConfig` | 查自动充值配置 |
| modifyAutoTopUpOptionOneConfig | GET/POST | `/sponsor/solutions/wallet/modifyAutoTopUpOptionOneConfig` | 改自动充值配置 |

### 2.7 SMAX（8）

| 接口 | 方法 | 路径 | 用途 |
|---|---|---|---|
| addSMaxAASolution | POST | `/sponsor/solution/smax/addSMaxAASolution` | 创建 SMAX AA |
| searchSmaxCampaign | GET/POST | `/sponsor/solution/smax/searchSmaxCampaign` | 查 SMAX campaign |
| updateSmaxCampaign | GET/POST | `/sponsor/solution/smax/updateSmaxCampaign` | 更新 SMAX campaign |
| updateSmaxStatusWithoutAd | GET/POST | `/sponsor/solution/smax/updateSmaxStatusWithoutAd` | 启停 |
| adAlgoSellerBaseInfo | GET/POST | `/sponsor/solution/smax/adAlgoSellerBaseInfo` | 卖家算法基础信息 |
| smaxAaGmvPrediction | GET/POST | `/sponsor/solution/smax/smaxAaGmvPrediction` | GMV 预测 |
| getBlackItemDetail | GET/POST | `/sponsor/solution/smax/getBlackItemDetail` | 黑名单商品详情 |
| updateItemBlackList | GET/POST | `/sponsor/solution/smax/updateItemBlackList` | 更新商品黑名单 |

### 2.8 其他（1）

| 接口 | 方法 | 路径 | 用途 |
|---|---|---|---|
| gproject aidc click | GET/POST | `/gproject/ads/aidc/click` | 广告点击归因/回传（官方示例） |

> 分类页共 38 个条目；SMAX 与普通 Sponsored Solutions 路径前缀不同（`/sponsor/solution/smax` vs `/sponsor/solutions`），不要拼错。

## 3. 创建解决方案 — `POST /sponsor/solutions/addSolution`

### 3.1 顶层字段

| 字段 | 类型 | 必填 | 含义 | 枚举/说明 |
|---|---|---:|---|---|
| bizCode | String | 是 | 解决方案 | 官方示例 `sponsoredSearch`；SD: sponsored search |
| campaignName | String | 是 | Campaign 名 | |
| startDate / endDate | String | 是 | 起止日期 | `yyyy-MM-dd` |
| dayBudget | String | 是 | 日预算 | |
| maxBid | String | 是 | 最高出价 | `-1` 表示不限 |
| campaignObjective | Number | 是 | 投放目标 | `1` Traffic；`2` Sales |
| campaignType | Number | 是 | Campaign 类型 | `1` Standard；`2` Smart |
| campaignModel | Number | 是 | 解决方案细分 | 官方示例 `99` |
| autoKeyword | Number | 否 | 自动关键词 | `1` 手动；`2` 自动 |
| autoItemSelect | Number | 是 | 自动选品 | `1` 手动；`2` 自动 |
| autoCreative | Number | 是 | 自动创意 | `1` ON；`0` OFF |
| platform | Number[] | 是 | 版位 | `3` Search Result；`4` Just For You |
| adgroupViewDTOlistWithFeed | Object[] | 是 | Adgroup 列表 | 至少 1 个 |

### 3.2 Adgroup 字段

| 字段 | 类型 | 必填 | 含义 | 说明 |
|---|---|---:|---|---|
| adgroupName | String | 是 | Adgroup 名 | 通常商品名 |
| itemId | Number | 是 | 推广商品 ID | |
| bidPrice | String | 条件 | 最高出价 | `campaignType=1` 必填 |
| autoKeyword | Number | 是 | 自动关键词 | 必须与 campaign 一致 |
| autoItemSelect | Number | 是 | 自动选品 | 必须与 campaign 一致 |
| autoCreative | Number | 是 | 自动创意 | 必须与 campaign 一致 |
| bidwordViewDTOList[].keyword | String | 否 | 关键词 | |
| ...bidPrice | String | 否 | 关键词出价 | |
| audienceViewDTOList[].adCrowdTag | Number | 否 | 人群 | `1` 15 天店铺访客；`2` 同类商品购买意向；`3` 店铺认知；`4` 店铺兴趣 |
| ...discount | Number | 否 | 溢价百分比 | `10` = 10% |

- `campaignType=1` 时 `bidPrice` 必填；`campaignType=2` 由平台优化。
- 自动选品/自动关键词/自动创意在 campaign 与 adgroup 必须一致，否则创建失败。
- 创建成功仅返回 `success`/`result`（boolean），需再查 `searchCampaignList` 拿 `campaignId`。

## 4. Campaign 更新 — `/sponsor/solutions/campaign/updateCampaign`

| 字段 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| campaignId | Number | 是 | Campaign ID |
| bizCode | String | 是 | 解决方案 |
| campaignName | String | 否 | 新名称 |
| startDate / endDate | String | 否 | 新起止 |
| dayBudget | String | 否 | 新日预算 |
| switchStatus | Number | 否 | `1` Online；`0` Offline |

- 启停用 `switchStatus`，不要删 campaign 来“暂停”。
- 修改预算/出价后回查 `getCampaign` 确认。
- `deleteCampaign` 不可逆；先 Offline 观察。

## 5. 关键词 — `/sponsor/solutions/keyword/searchKeyword`

请求：

| 字段 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| campaignObjective | Number | 是 | `1` Traffic；`2` Sales |
| campaignType | Number | 是 | `1` Standard；`2` Smart |
| bizCode | String | 是 | `sponsoredSearch` |
| itemId | Number | 是 | 商品 ID |
| searchWord | String | 是 | 搜索词 |
| itemQuery | String | 是 | 排除词（官方描述为“不想出现的词”） |

响应 `result[]`：

| 字段 | 类型 | 含义 |
|---|---|---|
| keyword | String | 关键词 |
| relevance | Number | 相关性 |
| historicalPV | Number | 过去 30 天平均搜索量 |
| suggestedPrice | String | 建议出价 |
| currency | String | 币种 |
| reservePrice | String | 最低保留价 |
| softLowerLimit / softUpperLimit | String | 软上下限 |
| softUpperLimitType | Number | `1` 出价远高于市场；`2` 账户余额导致过高 |

- 关键词必须实时查价；不能缓存太久。
- `relevance` 是平台预测，不等于质量分。

## 6. 报表

### 6.1 getReportOverview

请求：`startDate`、`endDate`、`lastStartDate`、`lastEndDate`、`useRtTable`、`bizCode`。

响应：

| 字段 | 类型 | 含义 |
|---|---|---|
| result.reportOverviewDetailDTO.spend | String | 花费 |
| ...impressions | Number | 曝光 |
| ...clicks | Number | 点击 |
| ...ctr | String | 点击率 |
| ...unitsSold | Number | 成交件数 |
| ...revenue | String | 成交金额（含折扣、运费、附加费） |
| ...cpc | String | 平均点击成本 |
| ...roi | String | 投产比 |
| result.lastReportOverviewDetailDTO | Object | 上一周期同结构 |

### 6.2 getReportOverviewMetric

请求：`metricType`、`startDate`、`endDate`、`useRtTable`、`bizCode`。

`metricType`：

| 值 | 指标 |
|---|---|
| 1 | spend |
| 2 | impressions |
| 3 | clicks |
| 4 | ctr |
| 5 | units sold |
| 6 | revenue |
| 7 | cpc |
| 8 | roi |
| 9 | store order |
| 10 | store a2c |
| 11 | product order |

响应：`dateList[]`（毫秒日界）、`hourList[]`（当天小时）、`metricList[]`（与时间轴等长）。

- `useRtTable=true` 才查当天实时数据；历史报表用 false。
- `dateList` 是毫秒时间戳，不是日期字符串。
- 不同报表接口的指标命名/粒度不同，统一表需保留 `report_type`。

## 7. SMAX

### 7.1 addSMaxAASolution

| 字段 | 类型 | 必填 | 含义 |
|---|---|---:|---|
| campaignViewDTO.campaignName | String | 是 | Campaign 名 |
| campaignViewDTO.biddingType | String | 是 | `bcb` 预算；`mcb` 最高 CPC；`troi` 目标 ROI |
| campaignViewDTO.budget | String | 条件 | 所有模式均需预算 |
| campaignViewDTO.maxBid | String | 条件 | `mcb` 必填且 >0；其他模式重置为不限 |
| campaignViewDTO.userProperties._iop_roas | String | 条件 | `troi` 必填，如 `"4"` 表示目标 ROI 4 |

响应：`result.campaignId`、`result.adgroupAndCreativeMap`（adgroup → creativeId 列表）。

- `biddingType` 决定必填字段；创建前本地校验。
- 返回的 `adgroupAndCreativeMap` 必须落库，用于后续状态/报表关联。

## 8. 限流与错误

- `sign` 官方说明：超时 10s，最大 QPS 300；超限可能被拉黑或临时限流。
- 其他广告接口也按 QPS 限流；批量操作要退避重试。
- `success=false` 时读 `errorMsg` + `analyseTraceId`；`analyseTraceId` 是排查凭证，必须记录。
- `result` 有时是 Boolean、有时是对象/数组；不要假设固定结构。

## 9. 落库建议

| 平台实体 | 建议表 | 键 |
|---|---|---|
| 账户签约 | `ad_accounts` | `shop_id + biz_code + signed_at` |
| Campaign | `ad_campaigns` | `shop_id + biz_code + campaign_id` |
| Adgroup | `ad_adgroups` | `campaign_id + adgroup_id` |
| Keyword | `ad_keywords` | `adgroup_id + keyword_id` |
| Audience | `ad_audiences` | `adgroup_id + ad_crowd_tag` |
| 日报 | `ad_daily_metrics` | `shop_id + campaign_id + adgroup_id + date + report_type` |
| 钱包充值 | `ad_wallet_transactions` | `shop_id + transaction_id` |
| SMAX 映射 | `ad_smax_mappings` | `shop_id + campaign_id + adgroup_id + creative_id` |

## 10. 官方来源

| 资源 | URL |
|---|---|
| Sponsored Solutions 分类 | <https://open.lazada.com/handler/share/apidoc/getApiCategory.json?cid=49&language=en> |
| addSolution | <https://open.lazada.com/handler/share/apidoc/getApi.json?path=%2Fsponsor%2Fsolutions%2FaddSolution&methodType=POST&categoryId=49> |
| updateCampaign | <https://open.lazada.com/handler/share/apidoc/getApi.json?path=%2Fsponsor%2Fsolutions%2Fcampaign%2FupdateCampaign&methodType=GET%2FPOST&categoryId=49> |
| searchKeyword | <https://open.lazada.com/handler/share/apidoc/getApi.json?path=%2Fsponsor%2Fsolutions%2Fkeyword%2FsearchKeyword&methodType=GET%2FPOST&categoryId=49> |
| getReportOverview | <https://open.lazada.com/handler/share/apidoc/getApi.json?path=%2Fsponsor%2Fsolutions%2Freport%2FgetReportOverview&methodType=GET%2FPOST&categoryId=49> |
| addSMaxAASolution | <https://open.lazada.com/handler/share/apidoc/getApi.json?path=%2Fsponsor%2Fsolution%2Fsmax%2FaddSMaxAASolution&methodType=POST&categoryId=49> |
