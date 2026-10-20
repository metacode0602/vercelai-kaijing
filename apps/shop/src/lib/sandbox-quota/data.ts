import type { SandboxQuotaPageData } from "./types"

/** 演示数据；接入 API 后替换为真实数据源 */
const MOCK_SANDBOX_QUOTA_DATA: SandboxQuotaPageData = {
  tier: {
    id: "free",
    label: "free",
  },
  quotas: [
    {
      id: "max-concurrent-sandboxes",
      name: "Maximum Concurrent Sandboxes",
      currentLimit: "5",
      action: "increase",
    },
    {
      id: "sandbox-max-lifetime",
      name: "Sandbox Maximum Lifetime",
      currentLimit: "1h",
      action: "increase",
    },
    {
      id: "max-local-storage",
      name: "Maximum Local Storage per Sandbox",
      currentLimit: "20GB",
      action: "none",
    },
    {
      id: "max-vcpu",
      name: "Maximum vCPU per Sandbox",
      currentLimit: "2c",
      action: "none",
    },
    {
      id: "max-memory",
      name: "Maximum Memory per Sandbox",
      currentLimit: "4096MiB",
      action: "none",
    },
  ],
  pricingHref: "/console/pricing-console?sandbox=1",
  customQuota: {
    title: "需要自定义配额？",
    description:
      "适用于需要更高资源限制、自定义部署区域或专用基础设施的高级工作负载。",
    contactLabel: "联系销售",
  },
}

export async function getSandboxQuotaPageData(): Promise<SandboxQuotaPageData> {
  return MOCK_SANDBOX_QUOTA_DATA
}
