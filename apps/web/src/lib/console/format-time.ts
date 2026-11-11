const TIME_ZONE = 'Asia/Shanghai'

export function formatOpsTime(value: Date | string | null | undefined) {
  if (!value) return '—'
  return `${new Date(value).toLocaleString('zh-CN', { timeZone: TIME_ZONE })}（${TIME_ZONE}）`
}
