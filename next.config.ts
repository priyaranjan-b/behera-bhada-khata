import type { NextConfig } from "next";

// Applied to every response. No script/style CSP: Next's inline bootstrap
// scripts and Emotion's inline styles would need nonces - these directives
// are the ones that don't.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,

  // The receipt PDF reads its fonts from disk at runtime (src/server/pdf/receipt.ts).
  outputFileTracingIncludes: {
    "/api/confirm/**": ["./src/server/pdf/fonts/**/*"],
    "/api/dashboard/payments/*/receipt": ["./src/server/pdf/fonts/**/*"],
    "/api/dashboard/adjustments/*/receipt": ["./src/server/pdf/fonts/**/*"],
  },

  // Every page used to live under /dashboard (/dashboard/tenants/…); now it is
  // at the root (/tenants/…, the Overview at /). Old bookmarks and links keep
  // working (A13). Redirects run before the proxy, so a signed-out visitor
  // lands on /login?next=<new path>.
  async redirects() {
    return [
      { source: "/dashboard", destination: "/", permanent: true },
      { source: "/dashboard/:path*", destination: "/:path*", permanent: true },
    ];
  },

  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The confirm token is in the URL path: never send it on to another
      // site as a Referer.
      { source: "/confirm/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
      { source: "/api/confirm/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
    ];
  },
};

export default nextConfig;
