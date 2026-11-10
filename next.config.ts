import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/api/bible/draft": ["./.kiro/agents/*.md", "./.kiro/hooks/*.md"],
    "/api/pipeline/stream": ["./.kiro/agents/*.md", "./.kiro/hooks/*.md"],
  },
};

export default nextConfig;
