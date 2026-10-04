import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <h1 className="text-base font-semibold">Page not found</h1>
      <Link href="/home" className="mt-4 text-sm underline">
        Go to your workspace
      </Link>
    </div>
  );
}
