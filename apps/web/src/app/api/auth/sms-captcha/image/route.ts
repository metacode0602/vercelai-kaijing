import { createImageHandler } from '@workspace/sms-captcha/server'

// 见 challenge/route.ts：以 Request 适配包内 NextRequest 类型的 handler。
const handler = createImageHandler() as unknown as (req: Request) => Promise<Response>

export const GET = (req: Request) => handler(req)
