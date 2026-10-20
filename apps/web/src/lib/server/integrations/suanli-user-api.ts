import { z } from 'zod'
import adminInstance from './request'

const platformUserRecordSchema = z.object({
  id: z.number(),
  nickname: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  username: z.string().nullable().optional(),
  create_time: z.string().nullable().optional(),
  tenant_names: z.array(z.string()).optional(),
  tenant_ids: z.array(z.number()).optional(),
  tenant_types: z.array(z.string()).optional(),
  merchant_ids: z.array(z.number()).optional(),
  merchant_marks: z.array(z.string()).optional(),
  real_name_enc: z.string().nullable().optional(),
})

const userListDataSchema = z.object({
  results: z.array(platformUserRecordSchema).optional(),
  count: z.number().optional(),
})

export type PlatformUserApiRecord = z.infer<typeof platformUserRecordSchema>

export class SuanliUserOpenApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'SuanliUserOpenApiError'
  }
}

export async function fetchPlatformUsersByPhone(phone: string): Promise<PlatformUserApiRecord[]> {
  try {
    const data = await adminInstance.get<unknown>('/admin/user/list', {
      params: {
        nickname: '',
        email: '',
        phone,
        username: '',
        start_time: '',
        end_time: '',
        page: 1,
        page_size: 20,
      },
    })

    const parsed = userListDataSchema.safeParse(data)
    if (!parsed.success) {
      throw new SuanliUserOpenApiError('平台返回数据格式异常')
    }

    return parsed.data.results ?? []
  } catch (e) {
    if (e instanceof SuanliUserOpenApiError) throw e
    throw new SuanliUserOpenApiError(e instanceof Error ? e.message : '连接算算力平台失败')
  }
}

export function isPlatformUserRealNameVerified(record: PlatformUserApiRecord): boolean {
  return Boolean(record.real_name_enc?.trim())
}
