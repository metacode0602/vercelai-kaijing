import { z } from "zod"
import { createTRPCRouter, protectedProcedure } from "../trpc"
import { identityDataAccess } from "@/lib/server/identity/dataaccess"

const attachmentSchema = z.object({
  kind: z.enum([
    "business_license",
    "id_front",
    "id_back",
    "auth_letter",
    "rename_proof",
    "other",
  ]),
  fileName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(128),
  sizeBytes: z.number().int().positive().max(10 * 1024 * 1024),
  storageKey: z.string().min(1),
})

export const identityRouter = createTRPCRouter({
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    return identityDataAccess.getStatus(ctx.organizationId)
  }),

  sendSmsCode: protectedProcedure
    .input(z.object({ mobile: z.string().min(11).max(11) }))
    .mutation(async ({ input }) => {
      return identityDataAccess.sendSmsCode(input.mobile)
    }),

  createUploadUrl: protectedProcedure
    .input(
      z.object({
        kind: z.enum([
          "business_license",
          "id_front",
          "id_back",
          "auth_letter",
          "rename_proof",
          "other",
        ]),
        fileName: z.string().min(1).max(255),
        contentType: z.string().min(1).max(128),
        sizeBytes: z.number().int().positive().max(10 * 1024 * 1024),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return identityDataAccess.createUploadUrl({
        organizationId: ctx.organizationId,
        ...input,
      })
    }),

  submitIndividual: protectedProcedure
    .input(
      z.object({
        realName: z.string().min(2).max(128),
        idNumber: z.string().min(15).max(18),
        mobile: z.string().min(11).max(11),
        smsCode: z.string().min(4).max(8),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return identityDataAccess.submitIndividual({
        organizationId: ctx.organizationId,
        userId: ctx.user.id,
        ...input,
      })
    }),

  submitEnterprise: protectedProcedure
    .input(
      z.object({
        companyName: z.string().min(2).max(255),
        uscc: z.string().min(18).max(18),
        legalPersonName: z.string().min(2).max(128),
        applicantRole: z.enum(["legal_person", "authorized"]),
        authorizedPersonName: z.string().min(2).max(128).optional(),
        attachments: z.array(attachmentSchema).min(1).max(10),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return identityDataAccess.submitEnterprise({
        organizationId: ctx.organizationId,
        userId: ctx.user.id,
        ...input,
      })
    }),

  submitRename: protectedProcedure
    .input(
      z.object({
        newCompanyName: z.string().min(2).max(255),
        reason: z.string().max(1000).optional(),
        attachments: z
          .array(
            attachmentSchema.extend({
              kind: z.enum(["rename_proof", "other"]),
            }),
          )
          .min(1)
          .max(10),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return identityDataAccess.submitRename({
        organizationId: ctx.organizationId,
        userId: ctx.user.id,
        ...input,
      })
    }),
})
