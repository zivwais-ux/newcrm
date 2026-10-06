"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight,
  Briefcase,
  Check,
  FileXls,
  Stack,
  CircleNotch,
  Storefront,
  Plant,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { completeOnboarding, createOrganization } from "@/lib/actions/org";
import type { BusinessType } from "@/types/domain";

const BUSINESS_TYPES: { value: BusinessType; title: string; description: string; icon: React.ElementType }[] = [
  { value: "service", title: "אני נותן שירות", description: "מספרה, קליניקה, סטודיו, ניקיון, תיקונים, שירותים מקומיים", icon: Storefront },
  { value: "sales", title: "אני מוכר", description: "סוכנות, מכירות לעסקים, צוות מכירות, נדל״ן", icon: Briefcase },
  { value: "both", title: "גם וגם", description: "נותן שירות, ויש גם תהליך מכירה", icon: Stack },
];

const DATA_SOURCES = [
  { value: "excel", title: "יש לי קובץ", description: "אקסל, CSV או ייצוא מתוכנה אחרת — נעלה אותו עכשיו", icon: FileXls },
  { value: "none", title: "מתחילים עם מסך ריק", description: "אוסיף לקוחות בעצמי, או אעלה קובץ אחר כך", icon: Plant },
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
        "group relative flex w-full items-center gap-4 rounded-xl border bg-surface p-4 text-start shadow-xs transition-all cursor-pointer sm:p-5",
        selected ? "border-brand ring-2 ring-brand/20" : "hover:-translate-y-px hover:border-zinc-300 hover:shadow-sm",
      )}
    >
      <span
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-xl transition-colors",
          selected ? "bg-brand text-white" : "bg-brand-soft text-brand",
        )}
      >
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="block text-[15px] font-semibold">{title}</span>
        <span className="block text-[13px] leading-relaxed text-muted-foreground">{description}</span>
      </span>
      <span
        aria-hidden
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-full border transition-colors",
          selected ? "border-brand bg-brand text-white" : "border-border",
        )}
      >
        {selected && <Check className="size-3" />}
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

  function submitBusiness(e: React.FormEvent) {
    e.preventDefault();
    if (!businessType) return toast.error("בחר איזה סוג עסק יש לך.");
    startTransition(async () => {
      const res = await createOrganization({ name: businessName, businessType, fullName: defaultName || undefined });
      if (!res.ok) return void toast.error(res.error);
      setStep("data");
    });
  }

  function submitData() {
    if (!source) return toast.error("בחר איפה הנתונים שלך נמצאים היום.");
    startTransition(async () => {
      const res = await completeOnboarding(source);
      if (!res.ok) return void toast.error(res.error);
      router.replace(res.data.next);
      router.refresh();
    });
  }

  return (
    <div className="w-full max-w-lg">
      <div className="mb-10 space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{step === "business" ? "על העסק" : "הנתונים שלך"}</span>
          <span className="tabular">שלב {step === "business" ? 1 : 2} מתוך 2</span>
        </div>
        <Progress value={step === "business" ? 50 : 100} className="h-2" />
      </div>

      {step === "business" ? (
        <form onSubmit={submitBusiness} className="space-y-8">
          <div className="space-y-2">
            <h1 className="text-[28px] leading-tight font-bold tracking-tight">ברוך הבא! בוא נכיר את העסק שלך</h1>
            <p className="text-[15px] leading-relaxed text-muted-foreground">שתי שאלות קצרות, ונבנה לך מסך עבודה שמתאים בדיוק לאיך שהעסק שלך עובד.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="businessName">איך קוראים לעסק?</Label>
            <Input
              id="businessName"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="למשל: ניקיון ברק"
              dir="auto"
              className="h-11 text-[15px]"
              required
              autoFocus
            />
          </div>
          <fieldset className="space-y-3">
            <legend className="mb-3 text-sm font-medium">מה העסק עושה?</legend>
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
            {pending ? <CircleNotch className="animate-spin" /> : null}
            המשך
            {!pending && <ArrowRight className="rtl:-scale-x-100" />}
          </Button>
        </form>
      ) : (
        <div className="space-y-8">
          <div className="space-y-2">
            <h1 className="text-[28px] leading-tight font-bold tracking-tight">איפה הנתונים של העסק נמצאים היום?</h1>
            <p className="text-[15px] leading-relaxed text-muted-foreground">
              מביאים אותם כמו שהם. המערכת תבין לבד ותציע את הכלים שמתאימים לך.
            </p>
          </div>
          <div className="grid gap-3">
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
          <Button size="lg" className="w-full" onClick={submitData} disabled={pending || !source}>
            {pending ? <CircleNotch className="animate-spin" /> : null}
            {source === "excel" ? "המשך להעלאת הקובץ" : "קח אותי למסך העבודה"}
            {!pending && <ArrowRight className="rtl:-scale-x-100" />}
          </Button>
        </div>
      )}
    </div>
  );
}
