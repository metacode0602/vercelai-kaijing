/**
 * OTP 下发通道（当前为服务端日志桩）。
 * 当前环境未配置短信 / 邮件服务商凭证，验证码不会真实下发，
 * 仅以结构化日志写入服务端控制台，便于本地与测试环境完成登录验证。
 * 接入真实通道后替换本模块实现（短信 FORCE_REAL_SEND / 邮件凭证），调用方无需改动。
 */

export async function sendPhoneOtpStub(params: {
  phoneNumber: string
  code: string
}): Promise<void> {
  console.info(
    `[shop-otp][phone] to=${params.phoneNumber} code=${params.code} （未配置短信通道，验证码仅写入服务端日志，未真实下发）`,
  )
}

export async function sendEmailOtpStub(params: {
  email: string
  otp: string
  type: string
}): Promise<void> {
  console.info(
    `[shop-otp][email] to=${params.email} type=${params.type} code=${params.otp} （未配置邮件通道，验证码仅写入服务端日志，未真实下发）`,
  )
}
