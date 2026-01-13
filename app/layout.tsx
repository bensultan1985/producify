import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Producify - Beat Machine",
  description: "An experimental, futuristic suite of music tools",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
