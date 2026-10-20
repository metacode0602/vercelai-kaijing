import { z } from "zod"
import { createTRPCRouter, protectedProcedure } from "../trpc"
import {
  listCustomImages,
  getCustomImageDetail,
  deleteCustomImage,
  getRegistryCredentials,
  getRegistryCredentialForUser,
  saveRegistryCredentials,
} from "@/lib/server/dataaccess/image"
import { createImageSaveJob, getImageSaveJobStatus } from "@/lib/server/dataaccess/image/image-save-job"

export const imageRouter = createTRPCRouter({
  /**
   * List custom images for the current tenant, with pagination
   */
  listCustom: protectedProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
        status: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return listCustomImages(ctx.organizationId, {
        status: input.status,
        page: input.page,
        pageSize: input.pageSize,
      })
    }),

  /**
   * Get a single custom image by ID
   */
  getDetail: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return getCustomImageDetail(ctx.organizationId, input.id)
    }),

  /**
   * Delete a custom image (fails if image is in use by active instances)
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await deleteCustomImage(ctx.organizationId, input.id)
      if (!result.success) {
        throw new Error(result.error)
      }
      return { success: true }
    }),

  /**
   * Get registry credentials for the current tenant
   */
  getRegistryCredentials: protectedProcedure.query(async ({ ctx }) => {
    return getRegistryCredentials(ctx.organizationId)
  }),

  /**
   * Get the primary registry credential for user-facing operations
   */
  getRegistryCredentialForUser: protectedProcedure.query(async ({ ctx }) => {
    return getRegistryCredentialForUser(ctx.organizationId)
  }),

  /**
   * Save an image from a running instance (docker commit + push)
   */
  saveFromInstance: protectedProcedure
    .input(
      z.object({
        sourceTaskId: z.string().min(1),
        tagName: z
          .string()
          .min(1)
          .max(255)
          .regex(
            /^[a-z0-9][a-z0-9._-]*$/i,
            "标签仅支持字母、数字、点、下划线和连字符",
          ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return createImageSaveJob(ctx.organizationId, input)
    }),

  /**
   * Get the status of an image save job
   */
  getSaveJobStatus: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ ctx, input }) => {
      return getImageSaveJobStatus(ctx.organizationId, input.jobId)
    }),

  /**
   * Save (create or update) registry credentials
   */
  saveRegistryCredentials: protectedProcedure
    .input(
      z.object({
        registryHost: z.string().min(1),
        username: z.string().min(1),
        passwordEnc: z.string().min(1),
        credentialType: z.enum(["platform", "external"]).default("external"),
        scope: z.enum(["push_pull", "pull_only"]).default("push_pull"),
        expiresAt: z.date().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return saveRegistryCredentials(ctx.organizationId, input)
    }),
})
