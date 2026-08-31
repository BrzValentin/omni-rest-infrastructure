import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.example.test",
      },
    ],
  },
  async headers() {
    return [
      // Defense in depth for every non-indexable surface (PR-17 Task 4). Per-page `robots` metadata
      // is the primary control, but config headers are evaluated before the filesystem routes, so
      // this keeps an admin page that ships without metadata from ever being indexable. Where a page
      // tag and this header disagree, Google applies the more restrictive rule, so this can only
      // tighten indexing, never loosen it.
      {
        source: "/admin/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        // A JSON response cannot carry a meta tag, so the header is the only available control.
        source: "/api/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex" }],
      },
      {
        source: "/admin/design-preview/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; frame-ancestors 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
