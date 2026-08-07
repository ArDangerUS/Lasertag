/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "www.lasertag.in.ua" },
    ],
  },
  experimental: {
    // Shared-хостинг обмежує кількість процесів/потоків: збірка в один
    // потік замість "по ядру на кожного" (інакше OS can't spawn worker thread)
    cpus: 1,
    workerThreads: false,
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
