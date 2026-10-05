import { Building2, Sparkles, UserRound, Users } from "lucide-react";
import { getMembers, requireOrg, canManage } from "@/lib/supabase/server";
import { isAIConfigured } from "@/lib/ai/openai";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Ltr } from "@/components/ui/ltr";
import { ProfileForm, WorkspaceSettingsForm } from "@/components/business/settings-forms";
import { ROLE_LABELS, label } from "@/components/business/labels";
import { initials } from "@/lib/utils";

export const metadata = { title: "הגדרות" };

export default async function SettingsPage() {
  const { supabase, org, role, profile, user } = await requireOrg();
  const members = await getMembers(supabase, org.id);
  const aiReady = isAIConfigured();

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="הגדרות" description="פרטי העסק, הפרופיל שלך והצוות." />
      <div className="space-y-6">
        <Card>
          <CardHeader icon={<Building2 />} title="העסק" description="פרטי העסק, והתאמת המערכת לאופי העבודה שלך." />
          <CardBody>
            <WorkspaceSettingsForm
              initial={{ name: org.name, businessType: org.business_type, currency: org.currency }}
              canManage={canManage(role)}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={<UserRound />} title="הפרופיל שלי" description={user.email ? <Ltr>{user.email}</Ltr> : undefined} />
          <CardBody>
            <ProfileForm name={profile.full_name ?? ""} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={<Users />} title="הצוות" description="כל מי שיש לו גישה לחשבון. הנתונים של כל עסק נפרדים לגמרי." />
          <ul className="divide-y">
            {members.map((m) => (
              <li key={m.user_id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand">
                  {initials(m.full_name ?? "?")}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {m.full_name ?? "חבר צוות"}
                  {m.user_id === user.id && <span className="text-muted-foreground"> (אני)</span>}
                </span>
                <Badge variant={m.role === "owner" ? "brand" : "outline"}>{label(ROLE_LABELS, m.role)}</Badge>
              </li>
            ))}
          </ul>
          <p className="border-t px-5 py-3 text-xs leading-relaxed text-muted-foreground">
            בעלים ומנהלים יכולים לשנות כלים והגדרות. חברי צוות עובדים עם הלקוחות, העסקאות, הפעילות והמשימות.
          </p>
        </Card>

        <Card>
          <CardHeader
            icon={<Sparkles />}
            title="היועץ החכם"
            description="היועץ רץ רק בשרת, ומשתמש רק בנתונים של העסק שלך."
            actions={aiReady ? <Badge variant="positive">מחובר</Badge> : <Badge variant="warning">לא מחובר</Badge>}
          />
          <CardBody>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {aiReady
                ? "היועץ, זיהוי העמודות בקבצים והסיכום היומי משתמשים ב־OpenAI. היועץ יכול לקרוא ולהמליץ, אבל אף פעם לא משנה נתונים בלי האישור שלך."
                : "כדי להפעיל תשובות חכמות, צריך להוסיף מפתח OPENAI_API_KEY בשרת. עד אז, מנוע הניתוח המובנה עונה מתוך הנתונים שלך."}
            </p>
          </CardBody>
        </Card>

      </div>
    </PageContainer>
  );
}
