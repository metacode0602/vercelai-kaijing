import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { createTRPCRouter, protectedProcedure } from "../trpc"
import { db } from "@/lib/db"
import { registryCredential, user } from "@workspace/db"
import { getHarborClient, generateHarborPassword, HARBOR_HOST } from "@/lib/server/services/harbor"
import { sendIdentitySmsOtp, verifyIdentitySmsOtp } from "@/lib/server/identity/otp"
import { eq, and } from "drizzle-orm"

export const registryRouter = createTRPCRouter({
  sendResetPasswordSms: protectedProcedure.mutation(async ({ ctx }) => {
    const [userRow] = await db
      .select({ phoneNumber: user.phoneNumber })
      .from(user)
      .where(eq(user.id, ctx.user.id))
      .limit(1)

    const phone = userRow?.phoneNumber
    if (!phone) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "用户未绑定手机号，请先完成实名认证",
      })
    }

    return sendIdentitySmsOtp(phone)
  }),

  resetPassword: protectedProcedure
    .input(z.object({ smsCode: z.string().min(4).max(8) }))
    .mutation(async ({ ctx, input }) => {
      const [userRow] = await db
        .select({ phoneNumber: user.phoneNumber })
        .from(user)
        .where(eq(user.id, ctx.user.id))
        .limit(1)

      const phone = userRow?.phoneNumber
      if (!phone) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "用户未绑定手机号，请先完成实名认证",
        })
      }

      const verified = await verifyIdentitySmsOtp(phone, input.smsCode)
      if (!verified) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "验证码错误或已过期",
        })
      }

      const harbor = getHarborClient()

      const [credential] = await db
        .select()
        .from(registryCredential)
        .where(
          and(
            eq(registryCredential.tenantId, ctx.organizationId),
            eq(registryCredential.registryHost, HARBOR_HOST),
          ),
        )
        .limit(1)

      const username = credential?.username ?? ctx.user.name

      const newPassword = generateHarborPassword()

      await harbor.resetUserPassword(username, newPassword)

      if (credential) {
        await db
          .update(registryCredential)
          .set({ passwordEnc: Buffer.from(newPassword).toString("base64") })
          .where(eq(registryCredential.id, credential.id))
      }

      return { success: true, username }
    }),
})
