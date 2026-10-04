import Link from "next/link";
import { Logo } from "@/components/layout/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="px-6 py-5 sm:px-10">
        <Link href="/" aria-label="Business OS">
          <Logo />
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-[8vh] pb-16">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
