import { createChallengeHandler, createChallengeGetHandler } from '@workspace/sms-captcha/server'

const POST = createChallengeHandler()
const GET = createChallengeGetHandler()

export { POST, GET }
