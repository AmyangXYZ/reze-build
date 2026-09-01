import type { NextConfig } from "next"
// import { join } from "path"

const nextConfig: NextConfig = {
  // Uncommented while reze-engine is npm-linked, so Next traces the sibling
  // checkout instead of resolving a copy that is not there.
  // outputFileTracingRoot: join(__dirname, ".."),
  reactStrictMode: false,
  devIndicators: false,
}

export default nextConfig
