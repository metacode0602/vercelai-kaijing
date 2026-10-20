export function AppsHeroIllustration() {
  return (
    <svg
      viewBox="0 0 900 640"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="h-auto w-full"
      role="img"
      aria-labelledby="apps-illustration-title apps-illustration-description"
    >
      <title id="apps-illustration-title">AI 应用模板库</title>
      <desc id="apps-illustration-description">
        LLM、Image、Video 和 Audio 应用通过 GPU Cloud 一键部署
      </desc>

      <defs>
        <linearGradient id="apps-surface" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--card)" stopOpacity="0.92" />
          <stop offset="100%" stopColor="var(--card)" stopOpacity="0.38" />
        </linearGradient>
        <linearGradient id="apps-surface-strong" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--card)" stopOpacity="0.98" />
          <stop offset="100%" stopColor="var(--card)" stopOpacity="0.62" />
        </linearGradient>
        <linearGradient id="apps-primary-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--primary)" />
          <stop offset="100%" stopColor="var(--chart-2)" />
        </linearGradient>
        <radialGradient id="apps-orb-primary" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="apps-orb-secondary" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--chart-2)" stopOpacity="0.24" />
          <stop offset="100%" stopColor="var(--chart-2)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="apps-orb-warm" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--chart-4)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--chart-4)" stopOpacity="0" />
        </radialGradient>
        <pattern id="apps-grid" width="32" height="32" patternUnits="userSpaceOnUse">
          <path d="M32 0H0V32" stroke="var(--border)" strokeOpacity="0.32" />
        </pattern>
        <filter id="apps-shadow" x="-30%" y="-30%" width="160%" height="170%" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="18" stdDeviation="18" floodColor="var(--foreground)" floodOpacity="0.14" />
        </filter>
        <filter id="apps-glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="9" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="apps-soft-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="18" />
        </filter>
      </defs>

      <g aria-hidden="true">
        <ellipse cx="742" cy="122" rx="230" ry="190" fill="url(#apps-orb-secondary)" />
        <ellipse cx="178" cy="500" rx="250" ry="190" fill="url(#apps-orb-primary)" />
        <ellipse cx="610" cy="548" rx="180" ry="120" fill="url(#apps-orb-warm)" />
        <rect x="34" y="28" width="832" height="580" rx="40" fill="url(#apps-grid)" opacity="0.46" />
        <path d="M78 532C218 458 290 556 430 510C570 464 652 340 830 364" stroke="var(--primary)" strokeOpacity="0.14" strokeWidth="2" />
        <path d="M66 174C208 248 276 126 420 184C564 242 636 142 842 212" stroke="var(--chart-2)" strokeOpacity="0.12" strokeWidth="2" />
      </g>

      <g aria-hidden="true" fill="none" strokeLinecap="round">
        <path d="M252 184C300 184 300 250 350 272" stroke="var(--primary)" strokeOpacity="0.42" strokeWidth="2" />
        <path d="M252 472C300 472 306 406 350 386" stroke="var(--chart-2)" strokeOpacity="0.4" strokeWidth="2" />
        <path d="M598 184C550 184 552 250 500 272" stroke="var(--chart-3)" strokeOpacity="0.4" strokeWidth="2" />
        <path d="M598 472C550 472 546 406 500 386" stroke="var(--chart-4)" strokeOpacity="0.36" strokeWidth="2" />
        <path d="M450 450V526" stroke="var(--primary)" strokeOpacity="0.32" strokeWidth="2" strokeDasharray="5 9" />
        <circle cx="350" cy="272" r="4" fill="var(--primary)" stroke="none" />
        <circle cx="350" cy="386" r="4" fill="var(--chart-2)" stroke="none" />
        <circle cx="500" cy="272" r="4" fill="var(--chart-3)" stroke="none" />
        <circle cx="500" cy="386" r="4" fill="var(--chart-4)" stroke="none" />
        <circle cx="450" cy="526" r="4" fill="var(--primary)" stroke="none" />
      </g>

      <g aria-hidden="true" filter="url(#apps-shadow)">
        <rect x="300" y="188" width="300" height="270" rx="28" fill="url(#apps-surface-strong)" stroke="var(--border)" strokeOpacity="0.72" />
        <path d="M300 242H600" stroke="var(--border)" strokeOpacity="0.58" />
        <circle cx="328" cy="215" r="6" fill="var(--primary)" />
        <text x="344" y="221" fill="var(--muted-foreground)" fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize="11" fontWeight="700" letterSpacing="1.8">
          AI WORKLOADS
        </text>
        <rect x="528" y="204" width="48" height="22" rx="11" fill="var(--primary)" fillOpacity="0.14" stroke="var(--primary)" strokeOpacity="0.4" />
        <circle cx="542" cy="215" r="3" fill="var(--primary)" />
        <text x="552" y="219" fill="var(--primary)" fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize="9" fontWeight="700" letterSpacing="1">
          LIVE
        </text>

        <text x="330" y="282" fill="var(--foreground)" fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize="28" fontWeight="700" letterSpacing="-0.8">
          GPU Cloud
        </text>
        <text x="330" y="304" fill="var(--muted-foreground)" fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize="12" fontWeight="500">
          One click, ready to run
        </text>

        <g transform="translate(390 322)">
          <path d="M46 0L88 24V72L46 96L4 72V24L46 0Z" fill="url(#apps-primary-gradient)" fillOpacity="0.2" stroke="var(--primary)" strokeOpacity="0.72" strokeWidth="2" />
          <path d="M46 14L76 32V68L46 86L16 68V32L46 14Z" fill="var(--card)" fillOpacity="0.74" stroke="var(--chart-2)" strokeOpacity="0.64" />
          <path d="M46 27L64 38V60L46 71L28 60V38L46 27Z" fill="url(#apps-primary-gradient)" fillOpacity="0.84" />
          <path d="M46 0V-13M88 24L101 16M88 72L101 80M46 96V109M4 72L-9 80M4 24L-9 16" stroke="var(--primary)" strokeOpacity="0.6" strokeWidth="2" strokeLinecap="round" />
          <circle cx="46" cy="49" r="7" fill="var(--primary-foreground)" fillOpacity="0.9" />
        </g>

        <path d="M330 424H570" stroke="var(--border)" strokeOpacity="0.58" />
        <circle cx="340" cy="442" r="4" fill="var(--primary)" />
        <text x="352" y="446" fill="var(--muted-foreground)" fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize="11" fontWeight="600">
          13 templates
        </text>
        <circle cx="454" cy="442" r="4" fill="var(--chart-2)" />
        <text x="466" y="446" fill="var(--muted-foreground)" fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize="11" fontWeight="600">
          Open source
        </text>
      </g>

      <g transform="rotate(-7 160 170)" filter="url(#apps-shadow)">
        <rect x="48" y="102" width="224" height="142" rx="22" fill="url(#apps-surface)" stroke="var(--primary)" strokeOpacity="0.42" />
        <rect x="68" y="122" width="38" height="38" rx="12" fill="var(--primary)" fillOpacity="0.16" stroke="var(--primary)" strokeOpacity="0.4" />
        <path d="M78 136H96C100 136 102 138 102 142V151C102 155 100 157 96 157H88L82 164V157H78C74 157 72 155 72 151V142C72 138 74 136 78 136Z" fill="var(--primary)" fillOpacity="0.84" />
        <circle cx="82" cy="146" r="2" fill="var(--primary-foreground)" />
        <circle cx="88" cy="146" r="2" fill="var(--primary-foreground)" />
        <circle cx="94" cy="146" r="2" fill="var(--primary-foreground)" />
        <text x="120" y="140" fill="var(--foreground)" fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize="21" fontWeight="700">
          LLM
        </text>
        <text x="120" y="158" fill="var(--muted-foreground)" fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize="10" fontWeight="600" letterSpacing="1.1">
          TEXT GENERATION
        </text>
        <rect x="70" y="188" width="108" height="5" rx="2.5" fill="var(--primary)" fillOpacity="0.26" />
        <rect x="70" y="202" width="72" height="5" rx="2.5" fill="var(--primary)" fillOpacity="0.14" />
        <circle cx="224" cy="204" r="4" fill="var(--primary)" />
        <text x="234" y="208" fill="var(--muted-foreground)" fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize="10" fontWeight="600">
          READY
        </text>
      </g>

      <g transform="rotate(6 155 480)" filter="url(#apps-shadow)">
        <rect x="42" y="408" width="224" height="142" rx="22" fill="url(#apps-surface)" stroke="var(--chart-2)" strokeOpacity="0.48" />
        <rect x="62" y="428" width="38" height="38" rx="12" fill="var(--chart-2)" fillOpacity="0.16" stroke="var(--chart-2)" strokeOpacity="0.42" />
        <rect x="70" y="436" width="22" height="20" rx="4" stroke="var(--chart-2)" strokeWidth="2" />
        <circle cx="76" cy="443" r="2.5" fill="var(--chart-2)" />
        <path d="M74 452L80 446L85 450L90 444V452H74Z" fill="var(--chart-2)" fillOpacity="0.75" />
        <text x="114" y="446" fill="var(--foreground)" fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize="21" fontWeight="700">
          Image
        </text>
        <text x="114" y="464" fill="var(--muted-foreground)" fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize="10" fontWeight="600" letterSpacing="1.1">
          IMAGE GENERATION
        </text>
        <rect x="64" y="494" width="126" height="5" rx="2.5" fill="var(--chart-2)" fillOpacity="0.28" />
        <rect x="64" y="508" width="86" height="5" rx="2.5" fill="var(--chart-2)" fillOpacity="0.15" />
        <circle cx="216" cy="510" r="4" fill="var(--chart-2)" />
        <text x="226" y="514" fill="var(--muted-foreground)" fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize="10" fontWeight="600">
          DIFFUSION
        </text>
      </g>

      <g transform="rotate(7 742 170)" filter="url(#apps-shadow)">
        <rect x="628" y="102" width="224" height="142" rx="22" fill="url(#apps-surface)" stroke="var(--chart-3)" strokeOpacity="0.5" />
        <rect x="648" y="122" width="38" height="38" rx="12" fill="var(--chart-3)" fillOpacity="0.16" stroke="var(--chart-3)" strokeOpacity="0.44" />
        <rect x="656" y="130" width="22" height="20" rx="4" stroke="var(--chart-3)" strokeWidth="2" />
        <path d="M665 136L672 140L665 145V136Z" fill="var(--chart-3)" />
        <text x="700" y="140" fill="var(--foreground)" fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize="21" fontWeight="700">
          Video
        </text>
        <text x="700" y="158" fill="var(--muted-foreground)" fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize="10" fontWeight="600" letterSpacing="1.1">
          VIDEO GENERATION
        </text>
        <rect x="650" y="188" width="112" height="5" rx="2.5" fill="var(--chart-3)" fillOpacity="0.28" />
        <rect x="650" y="202" width="76" height="5" rx="2.5" fill="var(--chart-3)" fillOpacity="0.15" />
        <circle cx="808" cy="204" r="4" fill="var(--chart-3)" />
        <text x="818" y="208" fill="var(--muted-foreground)" fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize="10" fontWeight="600">
          MOTION
        </text>
      </g>

      <g transform="rotate(-6 742 480)" filter="url(#apps-shadow)">
        <rect x="628" y="408" width="224" height="142" rx="22" fill="url(#apps-surface)" stroke="var(--chart-4)" strokeOpacity="0.46" />
        <rect x="648" y="428" width="38" height="38" rx="12" fill="var(--chart-4)" fillOpacity="0.16" stroke="var(--chart-4)" strokeOpacity="0.44" />
        <path d="M656 447H660L664 439L669 455L674 445L678 449H682" stroke="var(--chart-4)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <text x="700" y="446" fill="var(--foreground)" fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize="21" fontWeight="700">
          Audio
        </text>
        <text x="700" y="464" fill="var(--muted-foreground)" fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize="10" fontWeight="600" letterSpacing="1.1">
          SPEECH &amp; MUSIC
        </text>
        <rect x="650" y="494" width="132" height="5" rx="2.5" fill="var(--chart-4)" fillOpacity="0.28" />
        <rect x="650" y="508" width="92" height="5" rx="2.5" fill="var(--chart-4)" fillOpacity="0.15" />
        <circle cx="808" cy="510" r="4" fill="var(--chart-4)" />
        <text x="818" y="514" fill="var(--muted-foreground)" fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize="10" fontWeight="600">
          STREAM
        </text>
      </g>

      <g aria-hidden="true">
        <rect x="76" y="48" width="174" height="32" rx="16" fill="url(#apps-surface-strong)" stroke="var(--border)" strokeOpacity="0.7" />
        <circle cx="94" cy="64" r="5" fill="var(--primary)" filter="url(#apps-glow)" />
        <text x="108" y="68" fill="var(--foreground)" fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize="11" fontWeight="700" letterSpacing="1.1">
          OPEN SOURCE APPS
        </text>
        <rect x="650" y="48" width="174" height="32" rx="16" fill="url(#apps-surface-strong)" stroke="var(--border)" strokeOpacity="0.7" />
        <circle cx="668" cy="64" r="5" fill="var(--chart-2)" filter="url(#apps-glow)" />
        <text x="682" y="68" fill="var(--foreground)" fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize="11" fontWeight="700" letterSpacing="1.1">
          ONE-CLICK DEPLOY
        </text>
      </g>

      <g aria-hidden="true" filter="url(#apps-soft-glow)" opacity="0.56">
        <circle cx="300" cy="304" r="7" fill="var(--primary)" />
        <circle cx="600" cy="304" r="7" fill="var(--chart-2)" />
        <circle cx="300" cy="386" r="7" fill="var(--chart-3)" />
        <circle cx="600" cy="386" r="7" fill="var(--chart-4)" />
      </g>
    </svg>
  )
}
