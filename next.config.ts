import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Mechanic Desk export ZIPs (and especially several at once) easily exceed
    // the 1MB default body limit for Server Actions. The importer uploads raw
    // ZIPs, so allow a generous ceiling for a full export.
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
