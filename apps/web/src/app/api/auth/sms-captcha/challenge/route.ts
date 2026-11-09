import { createChallengeHandler, createChallengeGetHandler } from '@workspace/sms-captcha/server'

// 包内 handler 以自身依赖树的 NextRequest 类型标注，与应用内 Next 16 类型生成器不兼容；
// 运行时为同构对象，这里以 Request 适配导出。
const post = createChallengeHandler() as unknown as (req: Request) => Promise<Response>
const get = createChallengeGetHandler() as unknown as (req: Request) => Promise<Response>

export const POST = (req: Request) => post(req)
export const GET = (req: Request) => get(req)
