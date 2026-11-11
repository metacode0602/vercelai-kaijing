import createNextIntlPlugin from "next-intl/plugin"

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  async redirects() {
    return [
      { source: "/crossborder", destination: "/console", permanent: false },
      { source: "/crossborder/:path*", destination: "/console/:path*", permanent: false },
      { source: "/:locale/crossborder", destination: "/:locale/console", permanent: false },
      { source: "/:locale/crossborder/:path*", destination: "/:locale/console/:path*", permanent: false },
      { source: "/console/platform-config", destination: "/settings/platform-config", permanent: false },
      { source: "/console/audit-logs", destination: "/settings/audit-logs", permanent: false },
      { source: "/console/announcements", destination: "/settings/announcements", permanent: false },
      { source: "/console/roles", destination: "/settings/roles", permanent: false },
      { source: "/:locale/console/platform-config", destination: "/:locale/settings/platform-config", permanent: false },
      { source: "/:locale/console/audit-logs", destination: "/:locale/settings/audit-logs", permanent: false },
      { source: "/:locale/console/announcements", destination: "/:locale/settings/announcements", permanent: false },
      { source: "/:locale/console/roles", destination: "/:locale/settings/roles", permanent: false },
    ]
  },
  transpilePackages: [
    "@workspace/ui",
    "@workspace/auth",
    "@workspace/db",
    "@workspace/shared-next",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "liblibai-tmp-image.liblib.cloud",
      },
    ],
  },
}

// Default is src/i18n/request.ts; this project uses lib/i18n/request.ts
// https://next-intl.dev/docs/getting-started/app-router#i18nrequestts
const withNextIntl = createNextIntlPlugin("./src/lib/i18n/request.ts")

export default withNextIntl(nextConfig)
