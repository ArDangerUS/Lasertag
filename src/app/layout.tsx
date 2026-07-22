import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Онлайн бронювання — Лазертаг G-75",
  description:
    "Онлайн бронювання розваг у центрі Лазертаг G-75: лазертаг, квести, паперове шоу, банкетні кімнати та комплексні свята у Києві.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uk">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
