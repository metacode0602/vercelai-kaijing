export const landingNav = [
  { label: "产品能力", href: "#capabilities" },
  { label: "AI 工作台", href: "#workbench" },
  { label: "安全治理", href: "#security" },
  { label: "接入方式", href: "#deployment" },
] as const

export const heroContent = {
  eyebrow: "跨境电商 AI 运营中枢",
  title: "让 AI 在真实经营数据上干活，关键动作仍由你拍板",
  description:
    "Open Shop 把商品、订单、库存、成本、财务与审批沉淀为唯一事实源；OpenMCP Station 桌面工作台通过 MCP 读取数据、生成建议、驱动自动化。发现、解释、建议交给 AI，确认与写回留在 ERP。",
  primaryCta: { label: "免费开始", href: "/signup" },
  secondaryCta: { label: "看看 AI 工作台怎么用", href: "#workbench" },
  footnote: "Daraz 斯里兰卡 MVP · 一套数据 · 两个工作面 · 全程可审计",
} as const

export const platformContent = {
  title: "覆盖你正在经营的平台",
  items: ["Daraz", "Lazada", "TikTok Shop", "OpenMCP Station"],
  footnote:
    "Daraz / Lazada 支持店铺授权与同步；TikTok Shop 当前支持刊登写入；更多平台与官方能力持续接入。",
} as const

export const dualEntryContent = {
  label: "双入口，一套数据",
  title: "Web 做深，Desktop 做快",
  description:
    "不把 ERP 塞进聊天，也不让 AI 直接改业务。两个入口各司其职，共用同一套事实与审批。",
  cards: [
    {
      key: "web",
      eyebrow: "OPEN SHOP",
      title: "Open Shop 运营台",
      description: "密集表格、批量编辑、完整业务主路径都在这里。",
      features: [
        "商品 / SPU / 内部 SKU / 刊登与映射",
        "订单、履约、售后、物流",
        "库存、库位、采购与入库",
        "成本、费用模板、结算、利润",
        "待审队列、权限与审计",
      ],
      cta: { label: "了解控制台", href: "/console/dashboard" },
    },
    {
      key: "desktop",
      eyebrow: "OPENMCP STATION",
      title: "桌面 AI 工作台",
      description: "把发现、解释、建议和自动化放到桌面。",
      features: [
        "自然语言问经营数据",
        "Agent 自动巡检与归因",
        "候选、改价、补货、刊登建议",
        "Skills、Dashboard、Automations、MCP Apps",
        "可直接读取本地报价单、图片、装箱单",
      ],
      cta: { label: "了解工作台", href: "#ai-loop" },
    },
  ],
  shared: {
    title: "同一份事实，同一道审批",
    description:
      "Desktop 通过 OAuth 按组织授权访问 ERP；默认只读，写入只创建待审。最终确认始终在 /console/pending。",
    tags: ["OAuth 按组织授权", "默认只读", "写入进待审", "全链路审计"],
  },
} as const

export const aiLoopContent = {
  label: "AI 运营闭环",
  title: "从发现异常到写回平台，六步闭环",
  description:
    "AI 负责推理与准备，人负责最后一下。每一步都有来源、时间与审计。",
  steps: [
    {
      key: "sync",
      title: "同步",
      description:
        "Daraz / Lazada 订单、库存、刊登、结算按店铺策略同步；数据新鲜度可见。",
    },
    {
      key: "detect",
      title: "发现",
      description:
        "Dashboard 与 Agent 自动巡检低库存、异常订单、毛利波动、同步失败。",
    },
    {
      key: "explain",
      title: "解释",
      description:
        "每个结论带数据来源、时间与证据；金额分币种，不跨币种相加。",
    },
    {
      key: "propose",
      title: "建议",
      description:
        "生成选品候选、改价、补货、刊登提交建议，自动落入待审。",
    },
    {
      key: "confirm",
      title: "确认",
      description:
        "运营在 /console/pending 确认；确认后复用现有平台写回。",
    },
    {
      key: "audit",
      title: "审计",
      description:
        "记录操作者、客户端、组织、请求 ID 与前后差异。",
    },
  ],
  example: {
    title: "示例：低库存 → 补货建议 → 待审 → 确认",
    sku: "SKU KCH-014",
    metrics: [
      { label: "可售", value: "5 件" },
      { label: "日均", value: "8 件" },
      { label: "建议补货", value: "120 件" },
    ],
    evidence: "证据：近 7 日销量、在途 0、采购交期 12 天",
    status: "待审 · 来源 Desktop Agent · 张三",
    primaryCta: { label: "查看差异", href: "/console/pending" },
    secondaryCta: { label: "去控制台确认", href: "/console/pending" },
  },
} as const

export const capabilitiesContent = {
  label: "核心能力",
  title: "一套系统，覆盖跨境运营主路径",
  description:
    "从店铺连接到财务结算，业务事实都在 Open Shop；AI 在此基础上工作，而不是另起一套数据。",
  items: [
    {
      number: "001",
      title: "多店与多平台连接",
      description:
        "Daraz / Lazada OAuth 授权、租户级应用凭据、店铺策略与同步健康。",
    },
    {
      number: "002",
      title: "商品与刊登",
      description:
        "SPU / 内部 SKU、刊登草稿、平台字段映射、提交审核与发布。",
    },
    {
      number: "003",
      title: "订单与履约",
      description: "订单、异常、售后、发货、LGS / JSB 记录与轨迹。",
    },
    {
      number: "004",
      title: "库存与采购",
      description:
        "共享库存、库位、出入库、采购申请到入库、低库存预警。",
    },
    {
      number: "005",
      title: "成本与财务",
      description:
        "费用模板、海运柜次、运价卡、到仓成本、结算、利润与分币种。",
    },
    {
      number: "006",
      title: "待审与治理",
      description:
        "pending_actions、幂等与乐观锁、RBAC、审计与集成日志。",
    },
  ],
} as const

export const rolesContent = {
  label: "为每个角色",
  title: "老板看结果，运营做决策，财务对得上",
  rows: [
    {
      role: "老板 / 负责人",
      concern: "营收、利润、异常、待审",
      value: "Desktop Dashboard + 每日摘要；异常可下钻；高风险动作可审批",
    },
    {
      role: "运营",
      concern: "订单、库存、价格、活动",
      value: "Agent 巡检、改价 / 补货建议、批量操作深链回 Web",
    },
    {
      role: "选品 / 采购",
      concern: "找品、比价、算落地成本",
      value: "本地报价单读取、候选生成、成本测算、候选转刊登草稿",
    },
    {
      role: "财务",
      concern: "结算、毛利、对账",
      value: "费用模板、结算解析、利润与差异定位、待审确认",
    },
    {
      role: "IT / 管理员",
      concern: "账号、权限、审计",
      value: "组织 / 角色、OAuth 客户端与 API Key、审计日志、私有化部署",
    },
  ],
} as const

export const securityContent = {
  label: "安全与治理",
  title: "AI 可以很快，但边界必须清楚",
  description:
    "默认只读、写入进待审、按组织授权、全链路审计。平台凭证只留在 ERP。",
  items: [
    {
      title: "按组织授权",
      description:
        "OAuth token 绑定单一 organization_id；切换组织不会改变已发出的 token。",
    },
    {
      title: "默认只读",
      description:
        "MCP 首版以读取为主；写工具需要 openshop:write.pending scope。",
    },
    {
      title: "人工确认",
      description:
        "Agent 不能确认或拒绝待审；最终确认只在 /console/pending。",
    },
    {
      title: "数据脱敏",
      description:
        "买家姓名、电话、详细地址、邮箱不进入 Agent 返回内容。",
    },
    {
      title: "平台凭证隔离",
      description:
        "Daraz / Lazada 凭证只存 ERP，Desktop 不保存、不直连数据库。",
    },
    {
      title: "可审计",
      description:
        "写操作记录 actor、client、org、requestId 与前后差异。",
    },
  ],
} as const

export const deploymentContent = {
  label: "接入方式",
  title: "从设计伙伴到企业私有化",
  description:
    "先跑通 Daraz 斯里兰卡闭环，再按组织扩展平台与部署形态。",
  options: [
    {
      key: "saas",
      title: "标准 SaaS",
      audience: "适合中小卖家与起步团队",
      features: [
        "多组织与成员权限",
        "Daraz / Lazada 店铺连接",
        "核心 ERP 模块",
        "待审与审计",
      ],
      cta: { label: "免费开始", href: "/signup" },
      highlighted: false,
    },
    {
      key: "workbench",
      title: "AI 工作台",
      audience: "适合运营团队与设计伙伴",
      features: [
        "OpenMCP Station 桌面连接",
        "Skills 与 Dashboard",
        "Automations 自动巡检",
        "人机审批闭环",
      ],
      cta: { label: "开始使用", href: "/signup" },
      highlighted: true,
    },
    {
      key: "enterprise",
      title: "企业私有化",
      audience: "适合大卖家与品牌方",
      features: [
        "独立部署",
        "审计导出",
        "专属连接器",
        "专属支持",
      ],
      cta: { label: "联系销售", href: "mailto:support@open-shop.cn" },
      highlighted: false,
    },
  ],
} as const

export const quickStartContent = {
  label: "快速开始",
  title: "三步把 AI 接进你的运营",
  description:
    "不需要迁移数据库，也不需要把平台凭证交给桌面端。",
  steps: [
    {
      number: "01",
      title: "连接店铺",
      description:
        "在 Open Shop 用组织自己的 Daraz / Lazada 应用凭据完成授权。",
      href: "/settings/shops",
    },
    {
      number: "02",
      title: "授权工作台",
      description:
        "管理员在 /settings/mcp-access 创建 OAuth 客户端；成员在 Desktop 完成一次授权并选择组织。",
      href: "/settings/mcp-access",
    },
    {
      number: "03",
      title: "开始工作",
      description:
        "在 Desktop 问数据、跑巡检、接收建议；需要执行时到 /console/pending 确认。",
      href: "/console/pending",
    },
  ],
  enterprise: {
    title: "需要私有化或更大规模？",
    description:
      "独立部署、专属连接器、审计导出与实施支持，适合对数据与合规要求更高的团队。",
    stats: [
      { label: "部署形态", value: "SaaS / 私有化" },
      { label: "平台范围", value: "Daraz / Lazada / TikTok 刊登" },
      { label: "数据归属", value: "租户独立" },
      { label: "审批", value: "人工确认" },
    ],
    cta: { label: "联系销售", href: "mailto:support@open-shop.cn" },
  },
} as const

export const ctaContent = {
  title: "让 AI 从今天的数据开始工作。",
  description: "连接店铺，授权工作台，从第一个异常或第一条建议开始。",
  primaryCta: { label: "免费开始", href: "/signup" },
  secondaryCta: { label: "联系销售", href: "mailto:support@open-shop.cn" },
} as const

export const footerContent = {
  description: "跨境电商 AI 运营中枢。一套数据，两个工作面。",
  columns: [
    {
      title: "产品",
      links: [
        { label: "控制台", href: "/console/dashboard" },
        { label: "店铺连接", href: "/settings/shops" },
        { label: "工作台接入", href: "/settings/mcp-access" },
        { label: "AI 工作台", href: "/#workbench" },
      ],
    },
    {
      title: "资源",
      links: [
        { label: "产品能力", href: "/#capabilities" },
        { label: "安全治理", href: "/#security" },
        { label: "接入方式", href: "/#deployment" },
        { label: "服务条款", href: "/terms" },
      ],
    },
    {
      title: "合规",
      links: [
        { label: "隐私政策", href: "/privacy" },
        { label: "服务条款", href: "/terms" },
      ],
    },
    {
      title: "联系",
      links: [
        { label: "联系销售", href: "mailto:support@open-shop.cn" },
        { label: "技术支持", href: "mailto:support@open-shop.cn" },
      ],
    },
  ],
} as const
