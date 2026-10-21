import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  output: 'standalone',
  serverExternalPackages: ['@takumi-rs/image-response', '@takumi-rs/core', 'takumi-js'],
  reactStrictMode: true,
};

export default withMDX(config);
