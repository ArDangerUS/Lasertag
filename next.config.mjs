/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "www.lasertag.in.ua" },
    ],
  },
  async headers() {
    return [
      {
        // CRM ніколи не можна вбудовувати в iframe (захист від clickjacking)
        source: "/crm/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      {
        // Публічне бронювання можна вбудовувати лише на сайт клієнта
        source: "/",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'self' https://lasertag.in.ua https://*.lasertag.in.ua",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
