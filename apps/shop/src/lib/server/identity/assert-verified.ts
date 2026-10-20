import { eq } from "drizzle-orm"
import { TRPCError } from "@trpc/server"
import { organization } from "@workspace/db"
import { db } from "@/lib/db"

export async function assertOrganizationVerified(organizationId: string) {
  const [org] = await db
    .select({ identityStatus: organization.identityStatus })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1)

  const status = org?.identityStatus
  if (status === "individual_verified" || status === "enterprise_verified") {
    return
  }

  throw new TRPCError({
    code: "FORBIDDEN",
    message:
      status === "pending"
        ? "实名认证审核中，通过后方可充值或下单"
        : "请先完成实名认证后再充值或下单",
  })
}
