import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const heebo = Heebo({ subsets: ["hebrew", "latin"], variable: "--font-heebo", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Business OS", template: "%s · Business OS" },
  description: "כל העסק שלך במסך אחד — בונים את מסך העבודה בגרירה, והכלים עובדים יחד.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        <Toaster
          dir="rtl"
          position="bottom-left"
          toastOptions={{ classNames: { toast: "!rounded-lg !border-border !text-sm !font-sans !shadow-lg" } }}
        />
      </body>
    </html>
  );
}
