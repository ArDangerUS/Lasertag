/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "www.lasertag.in.ua" },
    ],
  },
};

export default nextConfig;
