import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
  async redirects() {
    return [
      { source: "/docs/terms", destination: "/terms", permanent: true },
      { source: "/docs/terms/", destination: "/terms", permanent: true },
      { source: "/docs/privacy", destination: "/privacy", permanent: true },
      { source: "/docs/privacy/", destination: "/privacy", permanent: true },
    ];
  },
};

export default nextConfig;

// Enable calling `getCloudflareContext()` in `next dev`.
// See https://opennext.js.org/cloudflare/bindings#local-access-to-bindings
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
