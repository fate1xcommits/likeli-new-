import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import AppLayout from "@/components/layout/AppLayout";
import { StoreProvider } from "@/lib/store";
import { AuthProvider } from "@/context/AuthContext";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-serif",
});

export const metadata: Metadata = {
  title: "Likeli | From Opinions to Positions",
  description: "Institutional-grade prediction markets.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${playfair.variable}`} suppressHydrationWarning>
        <AuthProvider>
          <StoreProvider>
            <AppLayout>{children}</AppLayout>
          </StoreProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
