import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Extra hostnames/IPs allowed to reach `next dev` (e.g. a phone on your LAN testing the scan flow).
  // Comma-separated in ALLOWED_DEV_ORIGINS, e.g. ALLOWED_DEV_ORIGINS=192.168.1.20
  allowedDevOrigins: (process.env.ALLOWED_DEV_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // The scan page needs the camera and location; nothing else needs sensors.
          { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
