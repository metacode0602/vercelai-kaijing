/**
 * Stub OTP delivery adapters for shop demo.
 * Logs codes to the server console; no real SMS / email provider credentials required.
 * Set SMS_FORCE_REAL_SEND / mail credentials later and swap implementations.
 */

import { rememberDevOtp } from './dev-otp'

export async function sendPhoneOtpStub(params: {
  phoneNumber: string
  code: string
}): Promise<void> {
  console.info(
    `[shop-otp][phone] to=${params.phoneNumber} code=${params.code} (stub — not sent via SMS)`,
  )
  rememberDevOtp('phone', params.phoneNumber, params.code)
}

export async function sendEmailOtpStub(params: {
  email: string
  otp: string
  type: string
}): Promise<void> {
  console.info(
    `[shop-otp][email] to=${params.email} type=${params.type} code=${params.otp} (stub — not sent via email)`,
  )
  rememberDevOtp('email', params.email, params.otp)
}
