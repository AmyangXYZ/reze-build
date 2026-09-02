import type { NextConfig } from "next"
import { join } from "path"
import { version } from "./package.json"

const nextConfig: NextConfig = {
  /** The version badge reads the manifest, so it cannot go stale. Baked in here
   *  rather than imported by the client, which would ship package.json with it. */
  env: { NEXT_PUBLIC_APP_VERSION: version },
  // Uncommented while reze-engine is npm-linked, so Next traces the sibling
  // checkout instead of resolving a copy that is not there.
  outputFileTracingRoot: join(__dirname, ".."),
  reactStrictMode: false,
  devIndicators: false,
}

export default nextConfig
