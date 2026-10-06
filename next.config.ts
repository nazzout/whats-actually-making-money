import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // firebase-admin uses Node APIs; keep it out of the bundle.
  serverExternalPackages: ["firebase-admin"],
  // Lets phones on the local network load dev assets/HMR.
  allowedDevOrigins: ["192.168.1.69", "192.168.*.*"],
  // The seed file is read at runtime as a read-only fallback when Firebase is not configured.
  outputFileTracingIncludes: { "/**/*": ["./data/seed/**"] },
};

export default nextConfig;
