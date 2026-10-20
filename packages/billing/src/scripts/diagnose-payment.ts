/**
 * 支付通道诊断（运营/排障用）
 *
 * 商户端在「当前没有可用的支付方式」时看不到任何提示细节，这个脚本把
 * `describePaymentChannels()` 的判定结果打印出来，并逐个列出缺失的环境变量，
 * 让管理员照着补配置即可，不用去翻代码。
 *
 * 用法：
 *   pnpm --filter @workspace/billing run diagnose:payment
 *   （需在已加载 .env 的 shell 里执行；Next.js 应用会自动读 .env，本脚本不会）
 *
 * 退出码：0 = 至少有一个线上通道可下单；1 = 没有任何线上通道（需补配置）。
 * 注意 `bank_transfer`（对公转账）恒为 available，它是否展示还取决于
 * `bank_account` 表里是否为该商户配置了启用中的收款账户，与本脚本无关。
 */

import { describePaymentChannels } from "../payment-gateway"

/** 与 `WechatPayGateway` / `AlipayGateway` 构造函数的必填校验保持一致。 */
const REQUIRED: Record<string, string[]> = {
  wechat: [
    "WECHAT_PAY_MCH_ID",
    "WECHAT_PAY_APP_ID",
    "WECHAT_PAY_PRIVATE_KEY",
    "WECHAT_PAY_SERIAL_NO",
    "WECHAT_PAY_PLATFORM_CERT",
    "WECHAT_PAY_API_V3_KEY",
    "WECHAT_PAY_NOTIFY_URL",
  ],
  alipay: ["ALIPAY_APP_ID", "ALIPAY_PRIVATE_KEY", "ALIPAY_PUBLIC_KEY", "ALIPAY_NOTIFY_URL"],
}

const LABEL: Record<string, string> = {
  wechat: "微信支付（Native 扫码）",
  alipay: "支付宝（电脑网站支付）",
  bank_transfer: "对公转账",
}

/** 只回报「设了没」，不回显值本身——避免把密钥打进 CI 日志。 */
function isSet(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0
}

function main(): void {
  const channels = describePaymentChannels()

  console.log("=== 支付通道诊断 ===\n")

  for (const channel of channels) {
    const name = LABEL[channel.method] ?? channel.method
    const required = REQUIRED[channel.method]
    console.log(
      `${channel.offered ? "✓ 可用  " : "✗ 不可用"}  ${name}  (${channel.method})` +
        `  available=${channel.available} orderCapable=${channel.orderCapable} offered=${channel.offered}`,
    )
    if (channel.reason) console.log(`    原因：${channel.reason}`)

    if (required) {
      // 只看 process.env：readPem 之类的归一化不影响「设了没」这个判断。
      const missing = required.filter((key) => !isSet(process.env[key]))
      if (missing.length > 0) {
        console.log(`    缺失环境变量（${missing.length}/${required.length}）：`)
        for (const key of missing) console.log(`      - ${key}`)
      } else {
        console.log(`    环境变量齐备（${required.length}/${required.length}）`)
      }
    }
    console.log("")
  }

  const onlineOffered = channels.filter((c) => c.offered && c.method !== "bank_transfer")
  if (onlineOffered.length === 0) {
    console.log(
      "结论：没有任何线上支付通道可下单，商户端只会看到「当前没有可用的支付方式」。\n" +
        "      请按上面列出的缺失变量补齐 .env 并重启应用。\n" +
        "      若只想尽快放出充值入口，可为商户在 `bank_account` 表配置一条启用中的\n" +
        "      收款账户来启用「对公转账」（该方式不依赖任何第三方凭据）。",
    )
    process.exitCode = 1
    return
  }

  console.log(
    `结论：${onlineOffered.map((c) => LABEL[c.method] ?? c.method).join("、")} 可下单，` +
      "商户端充值下拉将展示这些方式。",
  )
}

main()
