/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@channelbase/shared"],
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost" },
      { protocol: "https", hostname: "**" },
    ],
  },
  webpack: (config) => {
    // @channelbase/shared (like every package in this repo) uses explicit ".js"
    // extensions in its relative imports pointing at ".ts" source files — the
    // convention Node's native ESM resolver (and tsx, which apps/api and
    // apps/worker run on) requires. tsc/tsx/vitest all resolve ".js" -> ".ts"
    // automatically; webpack does not, by default, which made every page that
    // transitively imports @channelbase/shared 500 with "Module not found:
    // Can't resolve './enums.js'" instead of rendering. This teaches webpack
    // the same fallback.
    config.resolve.extensionAlias = {
      ".js": [".js", ".ts", ".tsx"],
    };
    return config;
  },
};

export default nextConfig;
