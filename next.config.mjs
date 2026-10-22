/** @type {import('next').NextConfig} */
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

const isDev = process.env.NODE_ENV === "development";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Dev needs 'unsafe-eval': react-refresh (Fast Refresh) evaluates code.
      // The production bundle contains no eval — verified — so it stays out there.
      isDev
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
        : "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "manifest-src 'self'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig = {
  poweredByHeader: false,
  outputFileTracingRoot: dirname,
  // Keep dev and production artifacts apart: next dev and next build share
  // the webpack cache, and a dev-compiled main-app.js (react-refresh) once
  // leaked into a production bundle and broke hydration under CSP.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
