import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import {
  createTRPCRouter,
  tenantAdminProcedure,
  tenantOwnerProcedure,
  userProcedure,
} from '@/lib/server/trpc'
import * as onboardingDa from '@/lib/server/dataaccess/onboarding'
import { allowRateLimited } from '@/lib/server/rate-limit'

async function assertRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  message: string,
) {
  if (!(await allowRateLimited(key, limit, windowSeconds))) {
    throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message })
  }
}

function wrap<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : '操作失败'
    throw new TRPCError({ code: 'BAD_REQUEST', message })
  })
}

const subjectTypeSchema = z.enum(['enterprise', 'individual'])
const handlerTypeSchema = z.enum(['legal_rep', 'authorized_agent'])
const countryCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{2}$/, '请选择国家 / 地区')

const fileKeySchema = z.string().trim().max(1024).nullish()
const textSchema = z.string().trim().max(255).nullish()

const saveStepInput = z.object({
  subjectType: subjectTypeSchema,
  companyName: z.string().trim().min(2).max(255),
  registrationNo: z.string().trim().min(4).max(32).nullish(),
  countryCode: countryCodeSchema,
  handlerType: handlerTypeSchema.optional(),
  legalRepresentative: textSchema,
  legalRepIdNo: z.string().trim().max(64).nullish(),
  legalRepIdFrontKey: fileKeySchema,
  legalRepIdBackKey: fileKeySchema,
  authorizationFileKey: fileKeySchema,
  agentName: textSchema,
  agentIdNo: z.string().trim().max(64).nullish(),
  agentIdFrontKey: fileKeySchema,
  agentIdBackKey: fileKeySchema,
  contactName: z.string().trim().min(1).max(128),
  contactPhone: z.string().trim().min(5).max(32),
  contactEmail: z.string().trim().email().max(255).nullish(),
  licenseFileKey: fileKeySchema,
  licenseFileName: textSchema,
})

export const onboardingRouter = createTRPCRouter({
  getState: userProcedure.query(async ({ ctx }) =>
    onboardingDa.getOnboardingState(ctx.db, ctx.user.id, ctx.organizationId),
  ),

  start: userProcedure
    .input(
      z.object({
        subjectType: subjectTypeSchema,
        countryCode: countryCodeSchema,
        nameHint: z.string().trim().max(255).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertRateLimit(
        `onboarding.start:${ctx.user.id}`,
        5,
        3600,
        '提交过于频繁，请稍后再试',
      )
      const result = await wrap(() =>
        onboardingDa.startOnboarding(ctx.db, {
          userId: ctx.user.id,
          subjectType: input.subjectType,
          countryCode: input.countryCode.toUpperCase(),
          nameHint: input.nameHint,
          organizationId: ctx.organizationId,
        }),
      )
      await auth.api.setActiveOrganization({
        headers: ctx.headers,
        body: { organizationId: result.organizationId },
      })
      return result
    }),

  saveStep: tenantAdminProcedure.input(saveStepInput).mutation(async ({ ctx, input }) =>
    wrap(() =>
      onboardingDa.saveOnboardingStep(ctx.db, {
        ...input,
        userId: ctx.user.id,
        organizationId: ctx.organizationId,
        countryCode: input.countryCode.toUpperCase(),
      }),
    ),
  ),

  submit: tenantOwnerProcedure
    .input(z.object({ agreement: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      await assertRateLimit(
        `onboarding.submit:${ctx.organizationId}`,
        10,
        3600,
        '提交过于频繁，请稍后再试',
      )
      return wrap(() =>
        onboardingDa.submitOnboarding(ctx.db, {
          userId: ctx.user.id,
          organizationId: ctx.organizationId,
          agreement: input.agreement,
        }),
      )
    }),

  resubmit: tenantOwnerProcedure
    .input(saveStepInput.extend({ agreement: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      await assertRateLimit(
        `onboarding.submit:${ctx.organizationId}`,
        10,
        3600,
        '提交过于频繁，请稍后再试',
      )
      return wrap(async () => {
        const { agreement, ...step } = input
        void agreement
        await onboardingDa.saveOnboardingStep(ctx.db, {
          ...step,
          userId: ctx.user.id,
          organizationId: ctx.organizationId,
          countryCode: step.countryCode.toUpperCase(),
        })
        return onboardingDa.submitOnboarding(ctx.db, {
          userId: ctx.user.id,
          organizationId: ctx.organizationId,
          agreement: true,
        })
      })
    }),
})
