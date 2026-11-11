import { TRPCError } from '@trpc/server'
import { ZodError } from 'zod'
import {
  isLikelyUserFacingMessage,
  isSqlDumpMessage,
  isUniqueViolation,
  uniqueViolationMessage,
} from '@/lib/server/errors/unique-constraint'

function firstZodIssue(error: unknown): { path: string; code?: string; message?: string } | null {
  const candidates: unknown[] = [error]
  if (error && typeof error === 'object') {
    const obj = error as { cause?: unknown; issues?: unknown }
    if (obj.cause) candidates.push(obj.cause)
  }
  for (const candidate of candidates) {
    const zod =
      candidate instanceof ZodError
        ? candidate
        : candidate && typeof candidate === 'object' && Array.isArray((candidate as { issues?: unknown }).issues)
          ? (candidate as ZodError)
          : null
    const issue = zod?.issues?.[0]
    if (!issue) continue
    return {
      path: issue.path.filter(Boolean).join('.'),
      code: String(issue.code ?? ''),
      message: typeof issue.message === 'string' ? issue.message : undefined,
    }
  }
  return null
}

function formatZodMessage(error: unknown): string | null {
  const issue = firstZodIssue(error)
  if (!issue) return null
  if (issue.message && /[\u4e00-\u9fff]/.test(issue.message)) return issue.message
  if (issue.code === 'too_small' || issue.code === 'invalid_type' || issue.code === 'invalid_string') {
    return issue.path ? `请填写必填项：${issue.path}` : '请填写必填项'
  }
  return '请检查输入是否完整、格式是否正确'
}

function rawMessage(error: unknown): string {
  if (error instanceof TRPCError) return error.message
  if (error instanceof Error) return error.message
  return ''
}

/**
 * 把 dataaccess / Drizzle / Zod 错误收敛为可展示的 TRPCError。
 * 唯一冲突用 CONFLICT；不要把 Postgres 23505 或 SQL 原文作为 500 返回。
 */
export function toUserFacingTrpcError(error: unknown): TRPCError {
  const uniqueMessage = uniqueViolationMessage(error)
  if (uniqueMessage) {
    return new TRPCError({ code: 'CONFLICT', message: uniqueMessage })
  }

  const zodMessage = formatZodMessage(error)
  if (error instanceof TRPCError) {
    if (isUniqueViolation(error.cause) && uniqueMessage) {
      return new TRPCError({ code: 'CONFLICT', message: uniqueMessage })
    }
    if (isSqlDumpMessage(error.message) || !error.message.trim()) {
      return new TRPCError({
        code: error.code === 'INTERNAL_SERVER_ERROR' ? 'BAD_REQUEST' : error.code,
        message: '保存失败，请检查输入后重试',
      })
    }
    if (zodMessage && !isLikelyUserFacingMessage(error.message)) {
      return new TRPCError({ code: 'BAD_REQUEST', message: zodMessage })
    }
    return error
  }

  if (zodMessage) {
    return new TRPCError({ code: 'BAD_REQUEST', message: zodMessage })
  }

  const message = rawMessage(error)
  if (!message || isSqlDumpMessage(message) || !isLikelyUserFacingMessage(message)) {
    return new TRPCError({ code: 'BAD_REQUEST', message: '保存失败，请检查输入后重试' })
  }
  if (message.includes('无权') || message.includes('不能授予') || message.includes('不能停用') || message.includes('不能移除')) {
    return new TRPCError({ code: 'FORBIDDEN', message })
  }
  return new TRPCError({
    code: /不存在|无效|过期/.test(message) ? 'NOT_FOUND' : 'BAD_REQUEST',
    message,
  })
}
