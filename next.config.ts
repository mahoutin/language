import type { NextConfig } from "next";
const staticExport = process.env.STATIC_EXPORT === "true";
const config: NextConfig = {
  ...(staticExport ? { output: "export", trailingSlash: true } : {}),
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  poweredByHeader: false,
  ...(staticExport
    ? {}
    : {
        async headers() {
          return [
            {
              source: "/:path*",
              headers: [
                { key: "X-Content-Type-Options", value: "nosniff" },
                { key: "X-Frame-Options", value: "DENY" },
                { key: "Referrer-Policy", value: "no-referrer" },
                {
                  key: "Permissions-Policy",
                  value: "camera=(self), microphone=(self), geolocation=()",
                },
                {
                  key: "Content-Security-Policy",
                  value:
                    "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
                },
              ],
            },
            {
              source: "/sw.js",
              headers: [
                {
                  key: "Cache-Control",
                  value: "no-cache, no-store, must-revalidate",
                },
                {
                  key: "Content-Security-Policy",
                  value: "default-src 'self'; script-src 'self'",
                },
              ],
            },
          ];
        },
      }),
};
export default config;
