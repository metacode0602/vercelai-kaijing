# 其他平台（Temu / SHEIN）— 官方卖家 API 是否存在

> 检索日期：**2026-10-31**（Asia/Shanghai）  
> 任务要求：仅当存在**官方公开**卖家 API 文档时展开；否则 N/A + 证据。

## 结论摘要

| 平台 | 官方 Partner / Developer 门户 | 本轮是否展开全量能力矩阵 |
| --- | --- | --- |
| **Temu** | ✅ 存在：https://partner.temu.com/ （Partner Platform） | ❌ 未登录；匿名页多为应用壳 → **不编造 path**；记「有官方门户，细则需 Partner 账号」 |
| **SHEIN** | ✅ 存在：https://open.sheincorp.com/ （SHEIN Developer Platform） | ❌ 同上 |

因此：**不是「无官方 API」的 N/A**，而是 **「有官方入口，本轮无公开可读的完整 seller API 参考正文」**。

## Temu

| 项 | 说明 |
| --- | --- |
| 门户 | https://partner.temu.com/ |
| 文档 | Partner 登录后可见 API/对接说明；公开 WebFetch 无法替代登录文档 |
| Q38/Q43/Q44 | **官方未说明 / 未找到**（公开可引用级） |

## SHEIN

| 项 | 说明 |
| --- | --- |
| 门户 | https://open.sheincorp.com/ |
| 文档 | Developer Platform；需入驻/登录 |
| Q38/Q43/Q44 | **官方未说明 / 未找到**（公开可引用级） |

## Sources

| URL | Retrieved |
| --- | --- |
| https://partner.temu.com/ | 2026-10-31 |
| https://open.sheincorp.com/ | 2026-10-31 |

若业务后续要 Temu/SHEIN connector：先完成 Partner 入驻，再按官方 Reference 补同结构 md，禁止用非官方逆向当规范。
