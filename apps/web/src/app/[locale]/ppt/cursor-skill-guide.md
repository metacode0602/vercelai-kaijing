# 用 Cursor 生成 Agent Skill 教程

> **目标受众**：需要用 AI 调用内部 API / 固化团队工作流的开发者  
> **演讲时长**：约 10–15 分钟  
> **案例参考**：`apps/docs/content/skills/`（共绩算力 `suanli-job`、`suanli-deployment`）  
> **页数**：5 页（含封面）

---

## 第 1 页｜封面：什么是 Skill？为什么要做？

- **标题**：用 Cursor 生成 Agent Skill —— 让 AI 记住你的 API 和工作流
- **副标题**：一次编写，反复自动调用
- **分享人 / 部门 / 日期**

**Skill 是什么？**

- 一个带 `SKILL.md` 的文件夹，教 Cursor Agent **何时启用、如何操作**
- 类似「给 AI 写的操作手册」，比每次粘贴 API 文档更稳定、更省 token

**我们做了什么（案例）**

| Skill | 用途 |
|-------|------|
| `suanli-job` | 共绩算力 Job 批处理：创建 / 查询 / 停止任务、计费 |
| `suanli-deployment` | 弹性部署全生命周期：创建 / 暂停 / 恢复 / 节点管理 |

**适合做成 Skill 的场景**：重复调用的 Open API、固定审批流程、团队统一输出格式

---

## 第 2 页｜准备材料：对话前先想清楚

**1. 明确 Skill 的边界**

- **做什么**：例如「通过 Open API 发 Job 任务、查状态、查账单」
- **何时触发**：在 `description` 里写清关键词（Job、批处理、suanli、发任务…）
- **放哪里**：项目级 `.cursor/skills/`（团队共享）或全局 `~/.cursor/skills/`（个人）

**2. 收集原始资料**

- 官方 API 文档（路径、请求体、响应字段、错误码）
- 鉴权方式（我们用的是**简易模式** `SUANLI_TOKEN`，无需 RSA 加签）
- 计费规则、业务术语（点 ↔ 元、出账周期等）

**3. 在 Cursor 里 @ 相关上下文**

```
@apps/docs/content/skills
请根据共绩算力 Job API 文档，帮我创建一个 Cursor Agent Skill
```

**提示**：资料越完整，生成结果越准；不确定的字段让 AI 列出待确认项，不要猜。

---

## 第 3 页｜与 Cursor 对话：四阶段生成

按 Cursor 内置 **create-skill** 流程，分四轮推进：

| 阶段 | 你要说什么 | AI 会产出什么 |
|------|-----------|--------------|
| **① 需求发现** | 用途、触发场景、存放路径 | 确认 skill 名称（如 `suanli-job`） |
| **② 设计** | 强调 description 要写「做什么 + 何时用」 | 目录结构草案 |
| **③ 实现** | 「请生成 SKILL.md 和 api 子文档」 | 完整文件树 |
| **④ 验证** | 「检查 description、术语是否一致」 | 修订与 checklist |

**推荐目录结构（我们的案例）**

```
suanli-job/
├── SKILL.md          # 入口：鉴权、计费、端点速查、工作流
├── README.md         # 安装、凭证、快速验证（给人看）
├── scripts/call.sh   # 通用 curl 脚本，避免每次重写请求代码
└── api/              # 各接口字段详情（渐进式披露，控制 SKILL.md 体积）
    ├── job-create.md
    ├── job-detail.md
    └── ...
```

**SKILL.md 必备 frontmatter 示例**

```yaml
---
name: suanli-job
description: >-
  通过共绩算力 Open API 创建/查询/停止 Job 批处理任务…
  在用户提到 Job、批处理、suanli、发任务、账单时启用。
---
```

---

## 第 4 页｜人工审校：生成后必查 5 项

AI 初稿需要人工把关，重点检查：

1. **description 是否够具体**  
   含触发词；第三人称；说明 WHAT + WHEN（Agent 靠它决定是否加载 Skill）

2. **SKILL.md 是否精简**  
   核心流程放主文件；详细字段拆到 `api/*.md`（建议主文件 < 500 行）

3. **脚本是否可复用**  
   如 `scripts/call.sh` 统一处理 token、timestamp、curl，减少重复生成请求代码

4. **术语与公式一致**  
   例：`1 元 = 1,000,000 点`、暂停 vs 删除（可恢复 vs 不可恢复）—— 全库统一措辞

5. **敏感信息不入库**  
   API 密钥放 skill 目录下 `.env`，加入 `.gitignore`，README 只写占位符

**迭代方式**：发现问题直接在对话里说——

> 「把暂停和删除的区别写进 SKILL.md，Agent 操作删除前要二次确认」

---

## 第 5 页｜安装验证 + 日常使用

**安装（复制整目录）**

```bash
# 项目级（推荐，团队共享）
cp -r apps/docs/content/skills/suanli-job/ .cursor/skills/suanli-job/

# 配置凭证（勿提交 git）
echo 'SUANLI_TOKEN="<你的密钥>"' > .cursor/skills/suanli-job/.env
set -a && source .cursor/skills/suanli-job/.env && set +a
```

**快速验证**

```bash
./.cursor/skills/suanli-job/scripts/call.sh GET /task/job/search "status=Running&page=1&page_size=10"
```

**日常对话示例**

- 「用 suanli-job 查一下当前 Running 的任务列表」
- 「创建一个 Spot Job，镜像 xxx，任务总数 100，并发 10」
- 「查这个 task_id 过去 7 天的计费」

**完成 checklist**

- [ ] `SKILL.md` frontmatter 完整，description 含触发词
- [ ] `api/` 与 `scripts/` 链接有效（仅一层引用）
- [ ] README 有安装路径与 `.env` 说明
- [ ] 本地 call.sh 验证通过
- [ ] 敏感凭证未进入版本库

**资源路径**：`apps/docs/content/skills/suanli-job/` · `apps/docs/content/skills/suanli-deployment/`

---

*文档版本：v1.0 — 共 5 页 — 确认后可生成交互式 PPT 页面*
