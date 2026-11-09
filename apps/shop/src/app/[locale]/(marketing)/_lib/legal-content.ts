export type LegalLocale = "zh" | "en"

export type LegalSection = {
  title: string
  paragraphs?: string[]
  items?: string[]
}

export type LegalDoc = {
  title: string
  description: string
  updatedAt: string
  intro: string[]
  sections: LegalSection[]
}

export type LegalDocKey = "terms" | "privacy"

const termsZh: LegalDoc = {
  title: "服务条款",
  description: "Open Shop 跨境电商运营平台服务条款",
  updatedAt: "最后更新：2026年11月9日",
  intro: [
    "欢迎使用 Open Shop。Open Shop 是面向跨境电商卖家的多租户运营数据平台，由天津聚链科技有限公司（以下简称“我们”）运营。",
    "本条款构成您与我们之间关于使用 Open Shop 平台及相关服务的协议。注册、登录或使用本平台，即表示您已阅读、理解并同意本条款。如您代表企业或其他组织使用本平台，您确认已获得相应授权。",
  ],
  sections: [
    {
      title: "定义与协议范围",
      paragraphs: [
        "本条款中的“平台”指 Open Shop 提供的网页端、接口、文档及相关软件服务；“租户”指在本平台注册并独立管理其组织数据的企业或组织；“用户”指经租户授权访问平台的自然人。",
        "本条款适用于平台官网、租户控制台、OpenAPI 与文档站。第三方电商平台、支付机构、物流服务商等另行适用其自身条款。",
      ],
    },
    {
      title: "账号注册与租户管理",
      items: [
        "您应提供真实、准确、完整的注册与认证信息，并在信息变更时及时更新。",
        "租户管理员负责创建、分配和管理其组织内的用户账号及权限，并对该等账号下的操作承担责任。",
        "您应妥善保管账号凭证，不得共享、转让或出借账号。发现未经授权访问时，应立即通知我们。",
      ],
    },
    {
      title: "平台服务内容",
      paragraphs: [
        "平台围绕跨境电商运营提供店铺连接、商品与刊登管理、订单与售后处理、库存与成本核算、经营分析与财务对账等能力。具体功能、额度和可用范围以您所订阅的方案、平台实际提供情况以及双方另行签署的协议为准。",
        "我们可能根据业务发展调整、升级或下线部分功能，并尽可能提前通知。涉及重大不利变更的，您可按本条款终止使用。",
      ],
    },
    {
      title: "第三方平台与授权",
      items: [
        "为提供店铺连接与数据同步服务，您可授权平台访问您在 Daraz 等第三方电商平台的店铺数据。您保证拥有授予该等授权的合法权利。",
        "第三方平台的服务、数据、接口可用性及政策由其自行控制。我们不对第三方平台的中断、变更、数据错误或处罚承担责任，但会在合理范围内提供协助。",
        "您应遵守第三方平台的规则以及适用法律法规，不得利用本平台从事违反平台政策的行为。",
      ],
    },
    {
      title: "使用规范",
      items: [
        "不得上传、存储或传播违法、侵权、虚假或恶意内容。",
        "不得未经授权访问、抓取、复制或篡改他人数据或平台系统。",
        "不得对本平台进行反向工程、绕过访问控制、发起攻击或干扰平台正常运行。",
        "不得利用本平台从事刷单、欺诈、洗钱、侵犯知识产权或其他违法违规活动。",
        "不得超出授权范围使用第三方平台数据，或将其用于与约定服务无关的目的。",
      ],
    },
    {
      title: "费用与付款",
      paragraphs: [
        "平台部分服务按订阅方案或实际用量收费。费用标准、计费周期和结算方式以订购页面、订单或双方协议为准。",
        "除另有约定外，已支付费用不予退还。逾期未付的，我们有权暂停或终止相关服务。价格调整将提前通知，并在下一个计费周期生效。",
        "您应自行承担因使用本平台产生的税费及第三方平台费用。",
      ],
    },
    {
      title: "数据与知识产权",
      paragraphs: [
        "您及您的租户对其上传、同步或生成的业务数据享有合法权利。您授予我们在提供、维护和改进服务所必需的范围内处理该等数据的非独占许可。",
        "本平台及其软件、界面、文档、商标和相关知识产权归我们或我们的许可方所有。未经书面许可，您不得复制、修改、分发或用于本条款以外的目的。",
        "我们可能使用经聚合、去标识化且无法识别您或您客户身份的数据用于统计分析和服务改进。",
      ],
    },
    {
      title: "数据安全与合规",
      paragraphs: [
        "我们采取合理的技术和管理措施保护平台及数据安全，包括多租户数据隔离、访问控制、传输加密和审计。",
        "您应确保其业务经营、商品信息、客户数据处理及跨境传输符合适用法律法规，并在必要时取得客户或相关方的同意。",
      ],
    },
    {
      title: "服务可用性、变更与中止",
      paragraphs: [
        "我们将以合理努力维持平台稳定运行，但不保证服务完全无中断或无错误。计划内维护将尽可能提前通知。",
        "因系统升级、安全风险、第三方原因、不可抗力或您违反本条款，我们可暂停或限制全部或部分服务。",
      ],
    },
    {
      title: "免责声明与责任限制",
      paragraphs: [
        "在法律允许的最大范围内，平台按“现状”和“可用”状态提供。我们不对第三方平台数据、经营决策结果或您依赖平台信息作出的决定作出保证。",
        "除法律强制规定或故意、重大过失外，我们不对间接、附带、特殊或惩罚性损害承担责任；对直接损失的累计赔偿责任以您在争议发生前十二个月内就相关服务实际支付的费用为上限。",
      ],
    },
    {
      title: "终止",
      paragraphs: [
        "您可随时停止使用平台并申请注销租户。我们可在您严重违反本条款、存在违法风险或长期欠费时暂停或终止服务。",
        "终止后，除法律要求或双方另有约定外，我们将在合理期限后删除或匿名化相关数据。您应在终止前自行导出必要数据。",
      ],
    },
    {
      title: "条款修改",
      paragraphs: [
        "我们可能根据法律、业务或产品变化更新本条款。更新后的条款将在平台公布并标明生效日期。继续使用平台即视为接受更新内容；如不同意，您应停止使用。",
      ],
    },
    {
      title: "适用法律与争议解决",
      paragraphs: [
        "本条款适用中华人民共和国法律（不含冲突法规则）。因本条款或平台服务产生的争议，双方应先友好协商；协商不成的，任一方可向天津聚链科技有限公司所在地有管辖权的人民法院提起诉讼。",
      ],
    },
    {
      title: "联系我们",
      paragraphs: [
        "如对本条款有疑问，请通过 support@gpurun.cn 联系我们。",
      ],
    },
  ],
}

const termsEn: LegalDoc = {
  title: "Terms of Service",
  description: "Terms of Service for the Open Shop cross-border commerce operations platform",
  updatedAt: "Last updated: November 9, 2026",
  intro: [
    "Welcome to Open Shop. Open Shop is a multi-tenant operations data platform for cross-border e-commerce sellers, operated by Tianjin Julian Technology Co., Ltd. (\"we\", \"us\" or \"our\").",
    "These Terms form an agreement between you and us regarding your use of the Open Shop platform and related services. By registering, signing in or using the platform, you confirm that you have read, understood and agree to these Terms. If you use the platform on behalf of a company or other organization, you confirm that you are authorized to do so.",
  ],
  sections: [
    {
      title: "Definitions and scope",
      paragraphs: [
        "\"Platform\" means the web application, APIs, documentation and related software services provided by Open Shop. \"Tenant\" means the company or organization that registers on the platform and independently manages its organization data. \"User\" means an individual authorized by a tenant to access the platform.",
        "These Terms apply to the marketing site, tenant console, OpenAPI and documentation site. Third-party marketplaces, payment institutions and logistics providers are governed by their own terms.",
      ],
    },
    {
      title: "Accounts and tenant administration",
      items: [
        "You must provide true, accurate and complete registration and verification information and keep it up to date.",
        "Tenant administrators are responsible for creating, assigning and managing user accounts and permissions within their organization, and for all activity under those accounts.",
        "You must safeguard account credentials and must not share, transfer or lend accounts. If you discover unauthorized access, you must notify us immediately.",
      ],
    },
    {
      title: "Platform services",
      paragraphs: [
        "The platform provides capabilities for cross-border commerce operations, including store connections, product and listing management, order and after-sales processing, inventory and cost accounting, business analytics and financial reconciliation. The specific features, limits and availability depend on your subscribed plan, the actual services provided and any separate agreement between the parties.",
        "We may adjust, upgrade or discontinue certain features as our business evolves and will provide advance notice where reasonably possible. If a change is materially adverse, you may stop using the affected services in accordance with these Terms.",
      ],
    },
    {
      title: "Third-party marketplaces and authorization",
      items: [
        "To provide store connection and data synchronization, you may authorize the platform to access store data on third-party marketplaces such as Daraz. You represent that you have the legal right to grant such authorization.",
        "Third-party marketplaces control their own services, data, API availability and policies. We are not responsible for outages, changes, data errors or penalties imposed by third-party marketplaces, but we will provide reasonable assistance.",
        "You must comply with third-party marketplace rules and applicable laws, and must not use the platform to violate marketplace policies.",
      ],
    },
    {
      title: "Acceptable use",
      items: [
        "Do not upload, store or distribute unlawful, infringing, false or malicious content.",
        "Do not access, scrape, copy or alter the data or systems of others or of the platform without authorization.",
        "Do not reverse engineer the platform, bypass access controls, launch attacks or interfere with normal operation.",
        "Do not use the platform for fake orders, fraud, money laundering, intellectual property infringement or other unlawful activities.",
        "Do not use third-party marketplace data beyond the scope of your authorization or for purposes unrelated to the agreed services.",
      ],
    },
    {
      title: "Fees and payment",
      paragraphs: [
        "Some services are charged by subscription plan or actual usage. Fees, billing cycles and settlement methods are set out on the order page, in an order or in a separate agreement.",
        "Unless otherwise agreed, paid fees are non-refundable. If payment is overdue, we may suspend or terminate the relevant services. Price changes will be notified in advance and take effect in the next billing cycle.",
        "You are responsible for taxes and third-party marketplace fees arising from your use of the platform.",
      ],
    },
    {
      title: "Data and intellectual property",
      paragraphs: [
        "You and your tenants retain the lawful rights to business data that you upload, synchronize or generate. You grant us a non-exclusive license to process that data to the extent necessary to provide, maintain and improve the services.",
        "The platform, including its software, interfaces, documentation, trademarks and related intellectual property, is owned by us or our licensors. Without written permission, you may not copy, modify, distribute or use it for purposes other than those permitted by these Terms.",
        "We may use aggregated, de-identified data that cannot identify you or your customers for statistical analysis and service improvement.",
      ],
    },
    {
      title: "Data security and compliance",
      paragraphs: [
        "We implement reasonable technical and organizational measures to protect the platform and data, including multi-tenant data isolation, access controls, encryption in transit and audit logs.",
        "You are responsible for ensuring that your business operations, product information, customer data processing and cross-border transfers comply with applicable laws, and for obtaining consent from customers or relevant parties where required.",
      ],
    },
    {
      title: "Availability, changes and suspension",
      paragraphs: [
        "We will use reasonable efforts to keep the platform stable, but we do not guarantee uninterrupted or error-free service. We will provide advance notice of scheduled maintenance where possible.",
        "We may suspend or restrict all or part of the services due to upgrades, security risks, third-party causes, force majeure or your breach of these Terms.",
      ],
    },
    {
      title: "Disclaimers and limitation of liability",
      paragraphs: [
        "To the maximum extent permitted by law, the platform is provided \"as is\" and \"as available\". We make no guarantees regarding third-party marketplace data, business outcomes or decisions you make based on platform information.",
        "Except where required by law or in cases of willful misconduct or gross negligence, we are not liable for indirect, incidental, special or punitive damages. Our aggregate liability for direct losses is limited to the fees you actually paid for the relevant services in the twelve months preceding the event giving rise to the claim.",
      ],
    },
    {
      title: "Termination",
      paragraphs: [
        "You may stop using the platform at any time and request closure of your tenant. We may suspend or terminate services if you materially breach these Terms, present a legal risk or fail to pay for an extended period.",
        "After termination, we will delete or anonymize relevant data after a reasonable period unless required by law or agreed otherwise. You should export any necessary data before termination.",
      ],
    },
    {
      title: "Changes to these Terms",
      paragraphs: [
        "We may update these Terms in response to legal, business or product changes. Updated Terms will be published on the platform with an effective date. Continued use of the platform constitutes acceptance of the updated Terms; if you do not agree, you must stop using the platform.",
      ],
    },
    {
      title: "Governing law and disputes",
      paragraphs: [
        "These Terms are governed by the laws of the People's Republic of China, excluding its conflict-of-law rules. The parties will first attempt to resolve any dispute arising from these Terms or the platform services through friendly negotiation. If negotiation fails, either party may bring an action in the competent people's court at the place where Tianjin Julian Technology Co., Ltd. is located.",
      ],
    },
    {
      title: "Contact us",
      paragraphs: [
        "If you have questions about these Terms, please contact us at support@gpurun.cn.",
      ],
    },
  ],
}

const privacyZh: LegalDoc = {
  title: "隐私政策",
  description: "Open Shop 跨境电商运营平台隐私政策",
  updatedAt: "最后更新：2026年11月9日",
  intro: [
    "本隐私政策说明天津聚链科技有限公司（以下简称“我们”）在您使用 Open Shop 跨境电商运营平台及相关服务时，如何收集、使用、存储、共享和保护个人信息。",
    "本政策适用于平台官网、租户控制台、OpenAPI 与文档站。第三方电商平台的隐私实践适用其自身政策。",
  ],
  sections: [
    {
      title: "我们收集的信息",
      items: [
        "账号与联系信息：姓名、邮箱、手机号、公司名称和职位。",
        "认证与审核信息：为完成卖家入驻审核，可能收集营业执照、法定代表人或经办人身份信息、证件影像和联系方式。",
        "店铺与经营数据：经您授权从 Daraz 等第三方平台同步的店铺、商品、订单、库存、结算、售后和费用数据。",
        "使用与日志信息：IP 地址、设备与浏览器信息、访问时间、操作日志和错误日志。",
        "沟通信息：您与客服或支持团队沟通时提供的信息。",
      ],
    },
    {
      title: "信息的使用",
      items: [
        "提供、运营和维护平台功能，包括店铺连接、数据同步、经营分析与财务对账。",
        "完成租户认证、审核、权限管理和安全验证。",
        "处理费用结算、开具发票和提供客户支持。",
        "检测、预防和调查欺诈、滥用、安全事件及违反条款的行为。",
        "改进产品体验、进行统计分析并遵守法律义务。",
      ],
    },
    {
      title: "信息共享与委托处理",
      paragraphs: [
        "我们不会出售您的个人信息。仅在以下情形共享或委托处理：",
      ],
      items: [
        "第三方电商平台：在您授权范围内同步和回传店铺数据。",
        "云服务、存储、短信、邮件等基础设施服务商：为提供平台服务所必需。",
        "支付与结算服务商：用于处理费用支付。",
        "法律要求或监管、司法机关依法要求的情形。",
        "涉及合并、收购或资产转让时，在符合法律要求的前提下转移。",
      ],
    },
    {
      title: "数据跨境传输",
      paragraphs: [
        "跨境电商业态可能涉及数据在不同国家和地区之间传输。我们将根据适用法律采取必要措施，包括签订标准合同、开展安全评估或取得您的同意。您应确保其向平台提供的个人信息具备合法来源和跨境传输依据。",
      ],
    },
    {
      title: "数据存储与安全",
      paragraphs: [
        "平台数据主要存储于我们选择的云服务环境中。我们采取访问控制、多租户隔离、传输加密、审计日志和备份等措施保护数据安全。",
        "互联网环境并非绝对安全。如发生可能影响您权益的数据安全事件，我们将按法律要求及时通知。",
      ],
    },
    {
      title: "数据保留",
      paragraphs: [
        "我们仅在实现本政策所述目的、满足合同履行和法律法规要求所需的期限内保留数据。超出期限后，我们将删除或匿名化处理，但法律另有要求的除外。",
      ],
    },
    {
      title: "您的权利",
      paragraphs: [
        "在适用法律允许的范围内，您有权访问、更正、复制、删除您的个人信息，撤回同意或注销账号。租户用户可通过租户管理员或控制台行使权利；其他请求可发送至下方联系方式。",
        "我们将在核实身份后于合理期限内处理。法律要求保留或存在其他合法处理依据的，我们可能无法立即删除。",
      ],
    },
    {
      title: "Cookie 与类似技术",
      paragraphs: [
        "我们使用必要的 Cookie 和本地存储维持登录状态、记住语言和主题偏好并保障安全。您可通过浏览器设置管理 Cookie，但禁用必要 Cookie 可能影响平台功能。",
      ],
    },
    {
      title: "未成年人保护",
      paragraphs: [
        "本平台面向企业和经营者，不面向未成年人。我们不会有意收集未成年人的个人信息。如发现相关情况，请联系我们删除。",
      ],
    },
    {
      title: "政策更新",
      paragraphs: [
        "我们可能根据法律或业务变化更新本政策。重大变更将通过平台公告或适当方式通知。更新后的政策自公布之日起生效。",
      ],
    },
    {
      title: "联系我们",
      paragraphs: [
        "如对本政策或个人信息处理有疑问、投诉或请求，请发送邮件至 support@gpurun.cn，或联系天津聚链科技有限公司。",
      ],
    },
  ],
}

const privacyEn: LegalDoc = {
  title: "Privacy Policy",
  description: "Privacy Policy for the Open Shop cross-border commerce operations platform",
  updatedAt: "Last updated: November 9, 2026",
  intro: [
    "This Privacy Policy explains how Tianjin Julian Technology Co., Ltd. (\"we\", \"us\" or \"our\") collects, uses, stores, shares and protects personal information when you use the Open Shop cross-border commerce operations platform and related services.",
    "This Policy applies to the marketing site, tenant console, OpenAPI and documentation site. Third-party e-commerce marketplaces are governed by their own privacy practices.",
  ],
  sections: [
    {
      title: "Information we collect",
      items: [
        "Account and contact information: name, email address, phone number, company name and job title.",
        "Verification and review information: to complete seller onboarding, we may collect business licenses, identity information of legal representatives or authorized agents, ID images and contact details.",
        "Store and business data: store, product, order, inventory, settlement, after-sales and fee data synchronized from third-party marketplaces such as Daraz with your authorization.",
        "Usage and log information: IP address, device and browser information, access times, operation logs and error logs.",
        "Communications: information you provide when contacting customer service or support.",
      ],
    },
    {
      title: "How we use information",
      items: [
        "Provide, operate and maintain platform features, including store connections, data synchronization, business analytics and financial reconciliation.",
        "Complete tenant verification, review, permission management and security checks.",
        "Process billing, issue invoices and provide customer support.",
        "Detect, prevent and investigate fraud, abuse, security incidents and violations of our terms.",
        "Improve the product experience, perform statistical analysis and comply with legal obligations.",
      ],
    },
    {
      title: "Sharing and entrusted processing",
      paragraphs: [
        "We do not sell your personal information. We share or entrust processing only in the following circumstances:",
      ],
      items: [
        "Third-party marketplaces: to synchronize and return store data within the scope of your authorization.",
        "Cloud, storage, SMS, email and other infrastructure providers: as necessary to provide the platform services.",
        "Payment and settlement providers: to process payments.",
        "Where required by law or by regulators or judicial authorities.",
        "In connection with a merger, acquisition or asset transfer, subject to compliance with applicable law.",
      ],
    },
    {
      title: "Cross-border data transfers",
      paragraphs: [
        "Cross-border commerce may involve transferring data between countries and regions. We will take the measures required by applicable law, including standard contractual clauses, security assessments or obtaining your consent. You must ensure that personal information you provide to the platform has a lawful source and a lawful basis for cross-border transfer.",
      ],
    },
    {
      title: "Data storage and security",
      paragraphs: [
        "Platform data is primarily stored in the cloud environments we select. We protect data through access controls, multi-tenant isolation, encryption in transit, audit logs and backups.",
        "The internet is not absolutely secure. If a data security incident may affect your rights, we will notify you in a timely manner as required by law.",
      ],
    },
    {
      title: "Data retention",
      paragraphs: [
        "We retain data only for as long as necessary to fulfill the purposes described in this Policy, perform our contracts and comply with legal requirements. After that period, we will delete or anonymize the data unless the law requires otherwise.",
      ],
    },
    {
      title: "Your rights",
      paragraphs: [
        "To the extent permitted by applicable law, you have the right to access, correct, copy and delete your personal information, withdraw consent or close your account. Tenant users may exercise these rights through their tenant administrator or the console; other requests may be sent to the contact details below.",
        "We will process requests within a reasonable period after verifying your identity. We may be unable to delete information immediately where the law requires retention or another lawful basis for processing exists.",
      ],
    },
    {
      title: "Cookies and similar technologies",
      paragraphs: [
        "We use essential cookies and local storage to maintain sign-in state, remember language and theme preferences and keep the platform secure. You can manage cookies through your browser settings, but disabling essential cookies may affect platform functionality.",
      ],
    },
    {
      title: "Protection of minors",
      paragraphs: [
        "The platform is intended for businesses and operators, not minors. We do not knowingly collect personal information from minors. If you become aware of such collection, please contact us so we can delete it.",
      ],
    },
    {
      title: "Updates to this Policy",
      paragraphs: [
        "We may update this Policy in response to legal or business changes. We will notify you of material changes through the platform or other appropriate means. Updated policies take effect on the date they are published.",
      ],
    },
    {
      title: "Contact us",
      paragraphs: [
        "If you have questions, complaints or requests regarding this Policy or our handling of personal information, please email support@gpurun.cn or contact Tianjin Julian Technology Co., Ltd.",
      ],
    },
  ],
}

const legalContent: Record<LegalDocKey, Record<LegalLocale, LegalDoc>> = {
  terms: { zh: termsZh, en: termsEn },
  privacy: { zh: privacyZh, en: privacyEn },
}

export function getLegalDoc(key: LegalDocKey, locale: string): LegalDoc {
  return legalContent[key][locale === "en" ? "en" : "zh"]
}
