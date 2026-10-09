import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // firebase-admin uses Node APIs; keep it out of the bundle.
  serverExternalPackages: ["firebase-admin"],
  // Lets phones on the local network load dev assets/HMR. Covers every private range (home, office, hotspot Wi-Fi);
  // an origin not listed here gets a black page because the client scripts are blocked. Dev server only.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.16.*.*", "172.17.*.*", "172.18.*.*", "172.19.*.*", "172.2*.*.*", "172.30.*.*", "172.31.*.*", "*.local"],
  // The seed file is read at runtime as a read-only fallback when Firebase is not configured.
  outputFileTracingIncludes: { "/**/*": ["./data/seed/**"] },
};

export default nextConfig;
