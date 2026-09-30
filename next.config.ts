import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Needed for the Docker/Railway image; harmless elsewhere.
  output: 'standalone',

  // The suppliers fixture is read at request time via a path built from
  // process.cwd(), which file tracing cannot follow, so it has to be
  // listed explicitly or the route ships without it and returns [].
  outputFileTracingIncludes: {
    '/api/suppliers': ['./data/suppliers.json'],
    '/api/invoices': ['./data/suppliers.json'],
  },
};

export default nextConfig;
