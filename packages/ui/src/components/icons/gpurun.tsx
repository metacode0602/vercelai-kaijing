import type { SVGProps } from 'react'

export default function GPURunIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      width={24}
      height={24}
      {...props}
    >
      <rect
        width="64"
        height="64"
        rx="14"
        className="fill-primary"
      />
      <rect
        x="14"
        y="15"
        width="11"
        height="11"
        rx="2.5"
        className="fill-primary-foreground"
      />
      <rect
        x="14"
        y="30"
        width="11"
        height="11"
        rx="2.5"
        className="fill-primary-foreground"
      />
      <rect
        x="29"
        y="15"
        width="11"
        height="11"
        rx="2.5"
        className="fill-primary-foreground"
      />
      <path
        d="M33 26L47 32L33 38V26Z"
        className="fill-primary-foreground"
      />

      {/* 品牌文字：居中放置，颜色与图形一致 */}
      <text
        x="32"
        y="55"
        textAnchor="middle"
        className="fill-primary-foreground"
        fontFamily="ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        fontSize="13"
        fontWeight="700"
        letterSpacing="-0.05em"
      >
        GPURun
      </text>
    </svg>
  )
}
