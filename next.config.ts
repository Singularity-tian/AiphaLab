import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // required for Docker / Railway container deployment
};

export default nextConfig;
