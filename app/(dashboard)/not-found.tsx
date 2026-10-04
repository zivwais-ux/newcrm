import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="text-base font-semibold">We couldn&apos;t find that</h1>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        It may have been deleted, or it belongs to a workspace you don&apos;t have access to.
      </p>
      <Button asChild className="mt-6" size="sm">
        <Link href="/home">Back to Home</Link>
      </Button>
    </div>
  );
}
