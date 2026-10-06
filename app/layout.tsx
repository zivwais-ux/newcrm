import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans_Hebrew } from "next/font/google";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const plex = IBM_Plex_Sans_Hebrew({
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-plex",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Business OS", template: "%s · Business OS" },
  description: "כל העסק שלך במסך אחד — בונים את מסך העבודה בגרירה, והכלים עובדים יחד.",
  applicationName: "Business OS",
  appleWebApp: { capable: true, title: "Business OS", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#f3f2ef",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl" className={`${plex.variable} ${plexMono.variable}`}>
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
