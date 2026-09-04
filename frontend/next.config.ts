import type { NextConfig } from "next";

// Baked in at build time: Next.js freezes rewrites() into the standalone
// build's routes manifest, so this cannot be a pure runtime env var.
const backendUrl = process.env.BACKEND_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${backendUrl}/api/v1/:path*`,
      },
      // Uploaded files (staff photos, ...) served straight off the
      // backend's local disk store — see backend/src/shared/uploads.ts.
      {
        source: "/uploads/:path*",
        destination: `${backendUrl}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
