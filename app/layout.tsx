import type { Metadata, Viewport } from "next";
import { Rubik } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const rubik = Rubik({ subsets: ["hebrew", "latin"], variable: "--font-rubik", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Business OS", template: "%s · Business OS" },
  description: "כל העסק שלך במסך אחד — בונים את מסך העבודה בגרירה, והכלים עובדים יחד.",
  applicationName: "Business OS",
  appleWebApp: { capable: true, title: "Business OS", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#fafaf9",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl" className={`${rubik.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        <Toaster
          dir="rtl"
          position="bottom-left"
          toastOptions={{ classNames: { toast: "!rounded-sm !border-border !text-sm !font-sans !shadow-lg" } }}
        />
      </body>
    </html>
  );
}
