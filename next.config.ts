import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev-only: HMR websocket is blocked unless the browser origin is listed.
  allowedDevOrigins: ["127.0.0.1", "192.168.1.25"],
};

export default nextConfig;
