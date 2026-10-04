import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // firebase-admin uses Node APIs; keep it out of the bundle.
  serverExternalPackages: ["firebase-admin"],
  // The seed file is read at runtime as a read-only fallback when Firebase is not configured.
  outputFileTracingIncludes: { "/**/*": ["./data/seed/**"] },
};

export default nextConfig;
