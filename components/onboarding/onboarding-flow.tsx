"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight,
  Briefcase,
  FileSpreadsheet,
  FileText,
  Layers,
  Loader2,
  PencilLine,
  Sparkles,
  Store,
  Sprout,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { completeOnboarding, createOrganization } from "@/lib/actions/org";
import { loadDemoData } from "@/lib/actions/demo";
import type { BusinessType } from "@/types/domain";

const BUSINESS_TYPES: { value: BusinessType; title: string; description: string; icon: React.ElementType }[] = [
  { value: "service", title: "Service Business", description: "Salons, clinics, studios, cleaning, repairs, local services", icon: Store },
  { value: "sales", title: "Sales Business", description: "Agencies, B2B, sales teams, IT, real estate", icon: Briefcase },
  { value: "both", title: "Both", description: "Services delivered with a sales process", icon: Layers },
];

const DATA_SOURCES = [
  { value: "excel", title: "Excel", description: "An .xlsx workbook", icon: FileSpreadsheet },
  { value: "csv", title: "CSV", description: "Exported from another system", icon: FileText },
  { value: "manual", title: "Manual", description: "I'll add records myself", icon: PencilLine },
  { value: "none", title: "I don't have data yet", description: "Start fresh", icon: Sprout },
] as const;

type DataSource = (typeof DATA_SOURCES)[number]["value"];

function OptionCard({
  selected,
  onClick,
  icon: Icon,
  title,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-start gap-3 rounded-md border bg-surface p-4 text-left transition-colors cursor-pointer",
        selected ? "border-foreground ring-1 ring-foreground" : "hover:border-zinc-300",
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", selected ? "text-foreground" : "text-muted-foreground")} />
      <span className="space-y-0.5">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-[13px] text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}

export function OnboardingFlow({
  initialStep,
  defaultName,
  businessType: initialType,
}: {
  initialStep: "business" | "data";
  defaultName: string;
  businessType: BusinessType | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState(initialStep);
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState<BusinessType | null>(initialType);
  const [source, setSource] = useState<DataSource | null>(null);
  const [pending, startTransition] = useTransition();
  const [demoPending, setDemoPending] = useState(false);

  function submitBusiness(e: React.FormEvent) {
    e.preventDefault();
    if (!businessType) return toast.error("Choose the type of business you run.");
    startTransition(async () => {
      const res = await createOrganization({ name: businessName, businessType, fullName: defaultName || undefined });
      if (!res.ok) return void toast.error(res.error);
      setStep("data");
    });
  }

  function submitData() {
    if (!source) return toast.error("Choose where your data is today.");
    startTransition(async () => {
      const res = await completeOnboarding(source);
      if (!res.ok) return void toast.error(res.error);
      router.replace(res.data.next);
      router.refresh();
    });
  }

  async function exploreDemo() {
    setDemoPending(true);
    const done = await completeOnboarding("none");
    if (!done.ok) {
      setDemoPending(false);
      return void toast.error(done.error);
    }
    const res = await loadDemoData();
    setDemoPending(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success(`Sample data loaded: ${res.data.customers} customers, ${res.data.transactions} transactions.`);
    router.replace("/components?imported=1");
    router.refresh();
  }

  return (
    <div className="w-full max-w-lg">
      <div className="mb-8 flex items-center gap-2 text-xs text-muted-foreground">
        <span className={cn("h-1 w-8 rounded-full", "bg-foreground")} />
        <span className={cn("h-1 w-8 rounded-full", step === "data" ? "bg-foreground" : "bg-border")} />
        <span className="ml-2 tabular">Step {step === "business" ? 1 : 2} of 2</span>
      </div>

      {step === "business" ? (
        <form onSubmit={submitBusiness} className="space-y-8">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Welcome to your Business OS</h1>
            <p className="text-[15px] text-muted-foreground">Build a workspace around the way your business actually works.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="businessName">Business name</Label>
            <Input
              id="businessName"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="e.g. Sparkle & Shine Cleaning"
              required
              autoFocus
            />
          </div>
          <fieldset className="space-y-3">
            <legend className="mb-3 text-sm font-medium">What type of business do you run?</legend>
            {BUSINESS_TYPES.map((t) => (
              <OptionCard
                key={t.value}
                selected={businessType === t.value}
                onClick={() => setBusinessType(t.value)}
                icon={t.icon}
                title={t.title}
                description={t.description}
              />
            ))}
          </fieldset>
          <Button type="submit" size="lg" className="w-full" disabled={pending || !businessName.trim() || !businessType}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            Continue
            {!pending && <ArrowRight />}
          </Button>
        </form>
      ) : (
        <div className="space-y-8">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Where is your business data today?</h1>
            <p className="text-[15px] text-muted-foreground">
              Bring it in as it is. The system will understand it and suggest the tools you need.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {DATA_SOURCES.map((s) => (
              <OptionCard
                key={s.value}
                selected={source === s.value}
                onClick={() => setSource(s.value)}
                icon={s.icon}
                title={s.title}
                description={s.description}
              />
            ))}
          </div>
          <Button size="lg" className="w-full" onClick={submitData} disabled={pending || !source || demoPending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {source === "excel" || source === "csv" ? "Continue to import" : "Go to my workspace"}
            {!pending && <ArrowRight />}
          </Button>
          {source === "none" && (
            <div className="flex items-start gap-3 rounded-md border border-dashed p-4">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-brand" />
              <div className="flex-1 space-y-2">
                <p className="text-sm">
                  Want to look around first? Load a realistic sample{" "}
                  {businessType === "sales" ? "B2B sales company" : "service business"} into your workspace.
                </p>
                <Button variant="outline" size="sm" onClick={exploreDemo} disabled={demoPending || pending}>
                  {demoPending && <Loader2 className="animate-spin" />}
                  {demoPending ? "Loading sample data…" : "Explore with sample data"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
