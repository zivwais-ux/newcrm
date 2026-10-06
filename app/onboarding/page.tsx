import { redirect } from "next/navigation";
import { getSession } from "@/lib/supabase/server";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { Logo } from "@/components/layout/logo";
import { Module, ModuleBody, ModuleRail } from "@/components/ui/module";

export const metadata = { title: "ברוך הבא" };
export const maxDuration = 60;

export default async function OnboardingPage() {
  const { user, profile, org } = await getSession();
  if (!user) redirect("/login");
  if (org?.onboarding_completed) redirect("/home");

  return (
    <div className="dot-grid grain flex min-h-screen flex-col bg-table">
      <header className="px-6 py-5 sm:px-10">
        <Logo />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-[4vh] pb-16">
        <Module className="w-full max-w-xl">
          <ModuleRail index={1} title="הקמת מסך העבודה" />
          <ModuleBody className="flex justify-center px-5 py-8 sm:px-10 sm:py-10">
            <OnboardingFlow
              initialStep={org ? "data" : "business"}
              defaultName={profile?.full_name ?? ""}
              businessType={org?.business_type ?? null}
            />
          </ModuleBody>
        </Module>
      </main>
    </div>
  );
}
