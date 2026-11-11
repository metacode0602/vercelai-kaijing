/**
 * 从 tRPC / Error 中取出可展示的中文错误信息。
 */

const GENERIC_FAILURE = '操作失败，请检查输入后重试'
const SQL_DUMP_RE =
  /failed query|duplicate key value|violates (?:unique|foreign key|not-null|check) constraint|insert into\s|internal server error|unexpected error/i

type IssueLike = { path?: unknown; message?: unknown; code?: unknown }
type TrpcLike = {
  message?: unknown
  shape?: { message?: unknown }
  data?: { message?: unknown; zodError?: { fieldErrors?: Record<string, string[] | undefined>; formErrors?: string[] } }
  cause?: unknown
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function firstZodMessage(error: TrpcLike): string {
  const zod = error.data?.zodError
  if (!zod) return ''
  const form = zod.formErrors?.find((item) => item?.trim())
  if (form) return form.trim()
  if (zod.fieldErrors) {
    for (const [field, messages] of Object.entries(zod.fieldErrors)) {
      const message = messages?.find((item) => item?.trim())
      if (message) return /[\u4e00-\u9fff]/.test(message) ? message.trim() : `请填写必填项：${field}`
    }
  }
  return ''
}

function fromIssues(error: unknown): string {
  if (!error || typeof error !== 'object') return ''
  const issues = (error as { issues?: IssueLike[] }).issues
  const issue = issues?.[0]
  if (!issue) return ''
  const message = firstString(issue.message)
  if (message && /[\u4e00-\u9fff]/.test(message)) return message
  const path = Array.isArray(issue.path) ? issue.path.filter(Boolean).join('.') : ''
  if (issue.code === 'too_small' || issue.code === 'invalid_type') {
    return path ? `请填写必填项：${path}` : '请填写必填项'
  }
  return ''
}

export function getClientErrorMessage(error: unknown, fallback: string = GENERIC_FAILURE): string {
  if (error == null) return fallback
  if (typeof error === 'string' && error.trim()) {
    return SQL_DUMP_RE.test(error) ? fallback : error.trim()
  }
  if (typeof error !== 'object') return fallback

  const trpc = error as TrpcLike
  const extracted =
    firstZodMessage(trpc) ||
    fromIssues(error) ||
    fromIssues(trpc.cause) ||
    firstString(trpc.data?.message, trpc.shape?.message, trpc.message, error instanceof Error ? error.message : '')

  if (!extracted || SQL_DUMP_RE.test(extracted)) return fallback
  return extracted
}
