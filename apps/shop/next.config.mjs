import createNextIntlPlugin from 'next-intl/plugin'

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  transpilePackages: ['@workspace/ui', '@workspace/shared-next', '@workspace/db'],
}

const withNextIntl = createNextIntlPlugin('./src/lib/i18n/request.ts')

export default withNextIntl(nextConfig)
