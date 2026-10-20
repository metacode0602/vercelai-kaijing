import type { ReactNode } from "react"
import { Cpu } from "lucide-react"

export interface ProductHeroStat {
  label: string
  value: string
}

export interface ProductHeroVisualMeta {
  eyebrow: string
  label: string
}

export interface ProductHeroSectionProps {
  eyebrow: string
  title: ReactNode
  description: ReactNode
  actions: ReactNode
  stats: ProductHeroStat[]
  illustration: ReactNode
  visual: ProductHeroVisualMeta
  statusLabel: string
}

export function ProductHeroSection({
  eyebrow,
  title,
  description,
  actions,
  stats,
  illustration,
  visual,
  statusLabel,
}: ProductHeroSectionProps) {
  return (
    <section className="relative w-full overflow-hidden pt-20 md:pt-24">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -top-48 left-1/2 size-[560px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute top-40 right-[8%] size-72 rounded-full bg-chart-2/10 blur-3xl" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-background/50 to-background" />
      </div>

      <div className="relative mx-auto max-w-7xl px-5 pb-12 md:pb-16 mt-20">
        <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/45 shadow-sm backdrop-blur-xl">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-card/40 to-background"
          />
          <div className="relative grid lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
            <div className="flex flex-col justify-center p-6 md:p-10 lg:p-12">
              <div className="mb-6 flex items-center gap-2 text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
                <span
                  className="size-2 rounded-full bg-primary"
                  aria-hidden="true"
                />
                {eyebrow}
              </div>

              <h1 className="max-w-2xl text-3xl leading-[1.08] font-semibold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
                {title}
              </h1>

              <div className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
                {description}
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                {actions}
              </div>

              <div className="mt-10 grid grid-cols-3 gap-3 border-t border-border/50 pt-5 sm:gap-6">
                {stats.map((stat) => (
                  <div key={stat.label} className="min-w-0">
                    <div className="truncate text-lg font-semibold text-foreground sm:text-xl">
                      {stat.value}
                    </div>
                    <div className="mt-1 text-[11px] leading-4 text-muted-foreground sm:text-xs">
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative flex min-h-[360px] items-center justify-center overflow-hidden border-t border-border/50 p-4 sm:min-h-[480px] sm:p-8 lg:min-h-[560px] lg:border-t-0 lg:border-l">
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,var(--primary)_0%,transparent_52%)] opacity-[0.08]"
              />
              <div
                aria-hidden="true"
                className="absolute top-8 left-8 h-28 w-28 rounded-full border border-primary/20"
              />
              <div
                aria-hidden="true"
                className="absolute right-8 bottom-10 h-48 w-48 rounded-full border border-chart-2/20"
              />
              <div className="absolute top-6 left-6 z-10 rounded-full border border-border/60 bg-card/70 px-3 py-2 backdrop-blur-md sm:top-8 sm:left-8">
                <div className="text-[10px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
                  {visual.eyebrow}
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs font-medium text-foreground">
                  <span className="size-1.5 rounded-full bg-primary" />
                  {visual.label}
                </div>
              </div>
              <div className="relative z-10 w-full max-w-[760px] select-none">
                {illustration}
              </div>
              <div className="absolute right-6 bottom-6 z-10 hidden items-center gap-2 rounded-full border border-border/60 bg-card/70 px-3 py-2 text-xs text-muted-foreground backdrop-blur-md sm:flex">
                <Cpu className="size-3.5 text-primary" />
                {statusLabel}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-0 bottom-0 left-0 h-24 bg-gradient-to-t from-background to-transparent"
      />
    </section>
  )
}

export interface ProductHeroFeature {
  title: string
  description: string
  status: string
}

export interface ProductHeroIllustrationProps {
  title: string
  description: string
  headline: string
  subheadline: string
  topLabel: string
  sideLabel: string
  features: readonly [
    ProductHeroFeature,
    ProductHeroFeature,
    ProductHeroFeature,
    ProductHeroFeature,
  ]
}

const featurePositions = [
  { transform: "rotate(-7 160 170)", x: 48, y: 102, textX: 120, textY: 140 },
  { transform: "rotate(6 155 480)", x: 42, y: 408, textX: 114, textY: 446 },
  { transform: "rotate(7 742 170)", x: 628, y: 102, textX: 700, textY: 140 },
  { transform: "rotate(-6 742 480)", x: 628, y: 408, textX: 700, textY: 446 },
] as const

const accents = [
  { stroke: "var(--primary)", fill: "var(--primary)" },
  { stroke: "var(--chart-2)", fill: "var(--chart-2)" },
  { stroke: "var(--chart-3)", fill: "var(--chart-3)" },
  { stroke: "var(--chart-4)", fill: "var(--chart-4)" },
] as const

function FeatureGlyph({ index, color }: { index: number; color: string }) {
  const props = {
    fill: "none",
    stroke: color,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 2,
  }

  if (index === 0) {
    return (
      <g transform="translate(10 10)">
        <path d="M2 3H18V14H8L4 18V14H2V3Z" {...props} />
        <circle cx="7" cy="8.5" r="1" fill={color} stroke="none" />
        <circle cx="10" cy="8.5" r="1" fill={color} stroke="none" />
        <circle cx="13" cy="8.5" r="1" fill={color} stroke="none" />
      </g>
    )
  }

  if (index === 1) {
    return (
      <g transform="translate(10 10)">
        <rect x="2" y="3" width="16" height="14" rx="3" {...props} />
        <path d="M5 14L8 11L11 13L15 8" {...props} />
      </g>
    )
  }

  if (index === 2) {
    return (
      <g transform="translate(10 10)">
        <rect x="2" y="3" width="16" height="14" rx="3" {...props} />
        <path d="M9 7L13 10L9 13V7Z" fill={color} stroke="none" />
      </g>
    )
  }

  return (
    <g transform="translate(10 10)">
      <rect x="2" y="3" width="16" height="14" rx="3" {...props} />
      <path d="M5 11H7L9 7L12 14L14 9H16" {...props} />
    </g>
  )
}

export function ProductHeroIllustration({
  title,
  description,
  headline,
  subheadline,
  topLabel,
  sideLabel,
  features,
}: ProductHeroIllustrationProps) {
  return (
    <svg
      viewBox="0 0 900 640"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="h-auto w-full"
      role="img"
      aria-labelledby="product-hero-title product-hero-description"
    >
      <title id="product-hero-title">{title}</title>
      <desc id="product-hero-description">{description}</desc>

      <defs>
        <linearGradient
          id="product-surface"
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
        >
          <stop offset="0%" stopColor="var(--card)" stopOpacity="0.92" />
          <stop offset="100%" stopColor="var(--card)" stopOpacity="0.38" />
        </linearGradient>
        <linearGradient
          id="product-surface-strong"
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
        >
          <stop offset="0%" stopColor="var(--card)" stopOpacity="0.98" />
          <stop offset="100%" stopColor="var(--card)" stopOpacity="0.62" />
        </linearGradient>
        <linearGradient
          id="product-primary-gradient"
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
        >
          <stop offset="0%" stopColor="var(--primary)" />
          <stop offset="100%" stopColor="var(--chart-2)" />
        </linearGradient>
        <radialGradient id="product-orb-primary" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="product-orb-secondary" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--chart-2)" stopOpacity="0.24" />
          <stop offset="100%" stopColor="var(--chart-2)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="product-orb-warm" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--chart-4)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--chart-4)" stopOpacity="0" />
        </radialGradient>
        <pattern
          id="product-grid"
          width="32"
          height="32"
          patternUnits="userSpaceOnUse"
        >
          <path d="M32 0H0V32" stroke="var(--border)" strokeOpacity="0.32" />
        </pattern>
        <filter
          id="product-shadow"
          x="-30%"
          y="-30%"
          width="160%"
          height="170%"
          colorInterpolationFilters="sRGB"
        >
          <feDropShadow
            dx="0"
            dy="18"
            stdDeviation="18"
            floodColor="var(--foreground)"
            floodOpacity="0.14"
          />
        </filter>
        <filter id="product-glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="9" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter
          id="product-soft-glow"
          x="-50%"
          y="-50%"
          width="200%"
          height="200%"
        >
          <feGaussianBlur stdDeviation="18" />
        </filter>
      </defs>

      <g aria-hidden="true">
        <ellipse
          cx="742"
          cy="122"
          rx="230"
          ry="190"
          fill="url(#product-orb-secondary)"
        />
        <ellipse
          cx="178"
          cy="500"
          rx="250"
          ry="190"
          fill="url(#product-orb-primary)"
        />
        <ellipse
          cx="610"
          cy="548"
          rx="180"
          ry="120"
          fill="url(#product-orb-warm)"
        />
        <rect
          x="34"
          y="28"
          width="832"
          height="580"
          rx="40"
          fill="url(#product-grid)"
          opacity="0.46"
        />
        <path
          d="M78 532C218 458 290 556 430 510C570 464 652 340 830 364"
          stroke="var(--primary)"
          strokeOpacity="0.14"
          strokeWidth="2"
        />
        <path
          d="M66 174C208 248 276 126 420 184C564 242 636 142 842 212"
          stroke="var(--chart-2)"
          strokeOpacity="0.12"
          strokeWidth="2"
        />
      </g>

      <g aria-hidden="true" fill="none" strokeLinecap="round">
        <path
          d="M252 184C300 184 300 250 350 272"
          stroke="var(--primary)"
          strokeOpacity="0.42"
          strokeWidth="2"
        />
        <path
          d="M252 472C300 472 306 406 350 386"
          stroke="var(--chart-2)"
          strokeOpacity="0.4"
          strokeWidth="2"
        />
        <path
          d="M598 184C550 184 552 250 500 272"
          stroke="var(--chart-3)"
          strokeOpacity="0.4"
          strokeWidth="2"
        />
        <path
          d="M598 472C550 472 546 406 500 386"
          stroke="var(--chart-4)"
          strokeOpacity="0.36"
          strokeWidth="2"
        />
        <path
          d="M450 450V526"
          stroke="var(--primary)"
          strokeOpacity="0.32"
          strokeWidth="2"
          strokeDasharray="5 9"
        />
        <circle cx="350" cy="272" r="4" fill="var(--primary)" stroke="none" />
        <circle cx="350" cy="386" r="4" fill="var(--chart-2)" stroke="none" />
        <circle cx="500" cy="272" r="4" fill="var(--chart-3)" stroke="none" />
        <circle cx="500" cy="386" r="4" fill="var(--chart-4)" stroke="none" />
        <circle cx="450" cy="526" r="4" fill="var(--primary)" stroke="none" />
      </g>

      <g aria-hidden="true" filter="url(#product-shadow)">
        <rect
          x="300"
          y="188"
          width="300"
          height="270"
          rx="28"
          fill="url(#product-surface-strong)"
          stroke="var(--border)"
          strokeOpacity="0.72"
        />
        <path d="M300 242H600" stroke="var(--border)" strokeOpacity="0.58" />
        <circle cx="328" cy="215" r="6" fill="var(--primary)" />
        <text
          x="344"
          y="221"
          fill="var(--muted-foreground)"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize="11"
          fontWeight="700"
          letterSpacing="1.8"
        >
          GPU CLOUD
        </text>
        <rect
          x="528"
          y="204"
          width="48"
          height="22"
          rx="11"
          fill="var(--primary)"
          fillOpacity="0.14"
          stroke="var(--primary)"
          strokeOpacity="0.4"
        />
        <circle cx="542" cy="215" r="3" fill="var(--primary)" />
        <text
          x="552"
          y="219"
          fill="var(--primary)"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize="9"
          fontWeight="700"
          letterSpacing="1"
        >
          LIVE
        </text>

        <text
          x="330"
          y="282"
          fill="var(--foreground)"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize="28"
          fontWeight="700"
          letterSpacing="-0.8"
        >
          {headline}
        </text>
        <text
          x="330"
          y="304"
          fill="var(--muted-foreground)"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize="12"
          fontWeight="500"
        >
          {subheadline}
        </text>

        <g transform="translate(390 322)">
          <path
            d="M46 0L88 24V72L46 96L4 72V24L46 0Z"
            fill="url(#product-primary-gradient)"
            fillOpacity="0.2"
            stroke="var(--primary)"
            strokeOpacity="0.72"
            strokeWidth="2"
          />
          <path
            d="M46 14L76 32V68L46 86L16 68V32L46 14Z"
            fill="var(--card)"
            fillOpacity="0.74"
            stroke="var(--chart-2)"
            strokeOpacity="0.64"
          />
          <path
            d="M46 27L64 38V60L46 71L28 60V38L46 27Z"
            fill="url(#product-primary-gradient)"
            fillOpacity="0.84"
          />
          <path
            d="M46 0V-13M88 24L101 16M88 72L101 80M46 96V109M4 72L-9 80M4 24L-9 16"
            stroke="var(--primary)"
            strokeOpacity="0.6"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle
            cx="46"
            cy="49"
            r="7"
            fill="var(--primary-foreground)"
            fillOpacity="0.9"
          />
        </g>

        <path d="M330 424H570" stroke="var(--border)" strokeOpacity="0.58" />
        <circle cx="340" cy="442" r="4" fill="var(--primary)" />
        <text
          x="352"
          y="446"
          fill="var(--muted-foreground)"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize="11"
          fontWeight="600"
        >
          {features.length} modules
        </text>
        <circle cx="454" cy="442" r="4" fill="var(--chart-2)" />
        <text
          x="466"
          y="446"
          fill="var(--muted-foreground)"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize="11"
          fontWeight="600"
        >
          Ready to run
        </text>
      </g>

      {features.map((feature, index) => {
        const position = featurePositions[index]
        const accent = accents[index]

        return (
          <g
            key={feature.title}
            transform={position.transform}
            filter="url(#product-shadow)"
          >
            <rect
              x={position.x}
              y={position.y}
              width="224"
              height="142"
              rx="22"
              fill="url(#product-surface)"
              stroke={accent.stroke}
              strokeOpacity="0.48"
            />
            <rect
              x={position.x + 20}
              y={position.y + 20}
              width="38"
              height="38"
              rx="12"
              fill={accent.fill}
              fillOpacity="0.16"
              stroke={accent.stroke}
              strokeOpacity="0.42"
            />
            <g transform={`translate(${position.x + 30} ${position.y + 20})`}>
              <FeatureGlyph index={index} color={accent.stroke} />
            </g>
            <text
              x={position.textX}
              y={position.textY}
              fill="var(--foreground)"
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              fontSize="21"
              fontWeight="700"
            >
              {feature.title}
            </text>
            <text
              x={position.textX}
              y={position.textY + 18}
              fill="var(--muted-foreground)"
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              fontSize="10"
              fontWeight="600"
              letterSpacing="1.1"
            >
              {feature.description.toUpperCase()}
            </text>
            <rect
              x={position.x + 22}
              y={position.y + 86}
              width="126"
              height="5"
              rx="2.5"
              fill={accent.fill}
              fillOpacity="0.26"
            />
            <rect
              x={position.x + 22}
              y={position.y + 100}
              width="86"
              height="5"
              rx="2.5"
              fill={accent.fill}
              fillOpacity="0.14"
            />
            <circle
              cx={position.x + 174}
              y={position.y + 102}
              r="4"
              fill={accent.fill}
            />
            <text
              x={position.x + 184}
              y={position.y + 106}
              fill="var(--muted-foreground)"
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              fontSize="10"
              fontWeight="600"
            >
              {feature.status}
            </text>
          </g>
        )
      })}

      <g aria-hidden="true">
        <rect
          x="76"
          y="48"
          width="174"
          height="32"
          rx="16"
          fill="url(#product-surface-strong)"
          stroke="var(--border)"
          strokeOpacity="0.7"
        />
        <circle
          cx="94"
          cy="64"
          r="5"
          fill="var(--primary)"
          filter="url(#product-glow)"
        />
        <text
          x="108"
          y="68"
          fill="var(--foreground)"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize="11"
          fontWeight="700"
          letterSpacing="1.1"
        >
          {topLabel}
        </text>
        <rect
          x="650"
          y="48"
          width="174"
          height="32"
          rx="16"
          fill="url(#product-surface-strong)"
          stroke="var(--border)"
          strokeOpacity="0.7"
        />
        <circle
          cx="668"
          cy="64"
          r="5"
          fill="var(--chart-2)"
          filter="url(#product-glow)"
        />
        <text
          x="682"
          y="68"
          fill="var(--foreground)"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize="11"
          fontWeight="700"
          letterSpacing="1.1"
        >
          {sideLabel}
        </text>
      </g>

      <g aria-hidden="true" filter="url(#product-soft-glow)" opacity="0.56">
        <circle cx="300" cy="304" r="7" fill="var(--primary)" />
        <circle cx="600" cy="304" r="7" fill="var(--chart-2)" />
        <circle cx="300" cy="386" r="7" fill="var(--chart-3)" />
        <circle cx="600" cy="386" r="7" fill="var(--chart-4)" />
      </g>
    </svg>
  )
}
