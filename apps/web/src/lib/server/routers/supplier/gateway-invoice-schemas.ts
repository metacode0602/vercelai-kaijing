import { z } from 'zod'

export const gatewayNodeReviewSchema = z.object({
  id: z.string(),
  auditStatus: z.enum(['approved', 'rejected']),
  auditRemark: z.string().optional(),
})

export const invoiceRequestReviewSchema = z.object({
  id: z.string(),
  action: z.enum(['approve', 'reject']),
  rejectionReason: z.string().optional(),
})

export const invoiceIssueSchema = z.object({
  requestId: z.string(),
  invoiceNo: z.string(),
  invoiceCode: z.string().optional(),
  taxRate: z.number().min(0).max(1),
  issuerName: z.string().optional(),
  issuerTaxNo: z.string().optional(),
  pdfUrl: z.string().min(1),
  pdfStorageKey: z.string().optional(),
  fileMimeType: z.string().min(1).max(128).optional(),
  fileSize: z.number().int().positive().max(20 * 1024 * 1024).optional(),
  fileOriginalName: z.string().min(1).max(255).optional(),
})

export const invoiceVoidSchema = z.object({
  id: z.string().min(1),
  reason: z.string().trim().min(1, '请填写作废原因').max(500, '作废原因不能超过 500 字'),
})
