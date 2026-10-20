import type { BetterAuthOptions } from "better-auth"
import { openAPI, organization } from "better-auth/plugins"
import {
  ac,
  platform_admin,
  platform_operator,
  platform_finance,
  tenant_owner,
  tenant_engineer,
  tenant_viewer,
  site_operator,
  merchant_owner,
  merchant_sales,
  merchant_operator,
  merchant_finance,
  supplier_owner,
  supplier_technician,
  supplier_viewer,
  member,
} from "./permissions"

export const sharedAuthOptions = {
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    openAPI(),
    organization({
      ac,
      roles: {
        // 平台角色
        platform_admin,
        platform_operator,
        platform_finance,
        // 租户角色
        tenant_owner,
        tenant_engineer,
        tenant_viewer,
        site_operator,
        // 经销商角色
        merchant_owner,
        merchant_sales,
        merchant_operator,
        merchant_finance,
        // 供应商角色
        supplier_owner,
        supplier_technician,
        supplier_viewer,
        // 向后兼容
        owner: platform_admin,
        admin: platform_operator,
        member,
      },
    }),
  ],
} satisfies Partial<BetterAuthOptions>
