# G8 跨租户店铺绑定运营裁决（已确认）

> 日期：2026-11-11（Asia/Shanghai）  
> 状态：**已确认并实现**，不再是待评审建议。  
> 对应：`tenant-onboarding-and-store-binding.md` D9 / Q4 / G8，以及平台页 `/crossborder/shop-conflicts`。

## 已确认政策

1. 「同一家店」以「平台 + 平台店铺 ID（`external_shop_id` / `getShop()` 得到的 ID，Lazop 优先 `seller_id`）」为冲突键。不把站点/国家算进冲突键。Lazada 多国店不算多家，同一卖家账号全库同一时间只能绑给一个租户。
2. 后来者授权一律先拒绝，不自动换主人，不保存后来者 token。默认裁决是维持原绑定、关闭后来者失败草稿。转移是例外通道，须平台运营人工批准并必填原因。
3. 后来者能完成平台登录只是线索，不是过户充分条件。运营批准转移后先进入「待申诉」；窗口内原租户可申诉；申诉则暂停释放并交运营复审；窗口结束且无申诉则正式释放名额，后来者才可重新授权。申诉期限读环境变量 `SHOP_BINDING_TRANSFER_APPEAL_DAYS`，默认 3 天，`0` 表示无窗口、批准后立即生效。
4. 转移后历史订单、库存、结算等留在原租户，不迁移、不改写他们的 `organization_id`。新租户重新授权后从自己组织开始同步。
5. 暂不自动通知原租户。页面提示平台运营自行判断是否联系。
6. 普通停用（`status=disabled` 且未解绑）仍挡住后来者。只有「运营批准转移且申诉窗口结束/无申诉」或「原租户正式解绑」之后才释放名额。转移生效时：占用方正式店停止同步、保留历史，不加 `deleted_at`，不改 `organization_id`；占用方店铺置 `status=unbound`。
7. 谁可以批准：维持现状，即平台组织成员（`platformOnboarding` / `protectedProcedure`）。批准转移必须填写原因。不做双人审批。
8. 平台冲突队列以独立冲突单表 `shop_binding_conflicts` 为准，不再靠 `status=error` 且 `external_shop_id` 非空再反查另一家。

## 状态机

| 状态 | 含义 |
| --- | --- |
| `pending` | 待处理 |
| `upheld` | 已维持原绑定 |
| `transfer_approved_pending_appeal` | 已批准待申诉 |
| `appealed_pending_review` | 已申诉待复审 |
| `released_pending_reauth` | 已释放待重新授权 |
| `closed` | 已关闭（后来者重新授权成功） |

占用判定：`deleted_at` 为空且 `status != unbound` 的店铺占用名额。本轮不加 `(platform, external_shop_id)` 全库唯一索引。
