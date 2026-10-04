import { redirect } from "next/navigation";
import { getSession } from "@/lib/supabase/server";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { Logo } from "@/components/layout/logo";

export const metadata = { title: "Welcome" };

export default async function OnboardingPage() {
  const { user, profile, org } = await getSession();
  if (!user) redirect("/login");
  if (org?.onboarding_completed) redirect("/home");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="px-6 py-5 sm:px-10">
        <Logo />
      </header>
      <main className="flex flex-1 justify-center px-4 pt-[6vh] pb-16">
        <OnboardingFlow
          initialStep={org ? "data" : "business"}
          defaultName={profile?.full_name ?? ""}
          businessType={org?.business_type ?? null}
        />
      </main>
    </div>
  );
}
