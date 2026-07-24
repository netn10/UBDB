/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  async rewrites() {
    // Same-origin API. Next matches its own routes first (afterFiles), so
    // /api/image-proxy hits the Next route; everything else under /api/*
    // proxies to the internal Flask backend on this same dyno.
    const backend = process.env.INTERNAL_API_URL ?? "http://127.0.0.1:5000/api";
    return [{ source: "/api/:path*", destination: `${backend}/:path*` }];
  },
  async headers() {
    // Baseline hardening on every response. No CSP yet: Next's inline bootstrap
    // needs a nonce setup to avoid breaking the app, tracked as follow-up.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};
