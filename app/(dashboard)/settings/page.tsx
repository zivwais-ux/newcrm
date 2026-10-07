import { Buildings, Kanban, Sparkle, TextAa, User, Users, WhatsappLogo } from "@phosphor-icons/react/dist/ssr";
import { getMembers, requireOrg, canManage } from "@/lib/supabase/server";
import { isAIConfigured } from "@/lib/ai/openai";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { Module, ModuleBody, ModuleFooter, ModuleRail } from "@/components/ui/module";
import { Ltr } from "@/components/ui/ltr";
import { ProfileForm, WorkspaceSettingsForm } from "@/components/business/settings-forms";
import { ROLE_LABELS, label } from "@/components/business/labels";
import { TemplatesForm } from "@/components/business/templates-form";
import { TermsForm } from "@/components/settings/terms-form";
import { StagesForm } from "@/components/settings/stages-form";
import { loadTemplates } from "@/lib/whatsapp-server";
import { initials } from "@/lib/utils";

export const metadata = { title: "הגדרות" };

export default async function SettingsPage() {
  const { supabase, org, role, profile, user } = await requireOrg();
  const [members, templates] = await Promise.all([getMembers(supabase, org.id), loadTemplates(supabase, org.id)]);
  const aiReady = isAIConfigured();

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="הגדרות" description="פרטי העסק, המילים והשלבים שלו, הפרופיל שלך והצוות." />
      <div className="space-y-6">
        <Module>
          <ModuleRail index={1} icon={<Buildings />} title="העסק" />
          <ModuleBody className="space-y-4">
            <p className="text-[13px] leading-relaxed text-muted-foreground">פרטי העסק, והתאמת המערכת לאופי העבודה שלך.</p>
            <WorkspaceSettingsForm
              initial={{ name: org.name, businessType: org.business_type, currency: org.currency }}
              canManage={canManage(role)}
            />
          </ModuleBody>
        </Module>

        <Module>
          <ModuleRail index={2} icon={<TextAa />} title="המילים של העסק" />
          <ModuleBody className="space-y-4">
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              כל עסק קורא לדברים בשם אחר. בחר את המילים שלך, והמערכת תדבר בהן בכל מקום.
            </p>
            <TermsForm canManage={canManage(role)} />
          </ModuleBody>
        </Module>

        <Module>
          <ModuleRail index={3} icon={<Kanban />} title="שלבי העבודה" />
          <ModuleBody className="space-y-4">
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              השלבים שהעבודה עוברת אצלך, מהפנייה ועד הסגירה. גרור כדי לשנות את הסדר, ולחץ על שם כדי לשנות אותו.
            </p>
            <StagesForm canManage={canManage(role)} />
          </ModuleBody>
        </Module>

        <Module>
          <ModuleRail index={4} icon={<User />} title="הפרופיל שלי" />
          <ModuleBody className="space-y-4">
            {user.email && (
              <p className="truncate text-[13px] text-muted-foreground">
                <Ltr>{user.email}</Ltr>
              </p>
            )}
            <ProfileForm name={profile.full_name ?? ""} />
          </ModuleBody>
        </Module>

        <Module>
          <ModuleRail index={5} icon={<WhatsappLogo />} title="הודעות WhatsApp מוכנות" />
          <ModuleBody className="space-y-4">
            <p className="text-[13px] leading-relaxed text-muted-foreground">ההודעות שמופיעות בכל כפתור WhatsApp במערכת.</p>
            <TemplatesForm initial={templates} canManage={canManage(role)} />
          </ModuleBody>
        </Module>

        <Module>
          <ModuleRail index={6} icon={<Users />} title="הצוות" meta={<span className="num">{members.length}</span>} />
          <p className="px-4 pt-4 text-[13px] leading-relaxed text-muted-foreground sm:px-5">
            כל מי שיש לו גישה לחשבון. הנתונים של כל עסק נפרדים לגמרי.
          </p>
          <ul className="mt-2 divide-y divide-border">
            {members.map((m) => (
              <li key={m.user_id} className="flex items-center gap-3 px-4 py-3 text-sm sm:px-5">
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
          <ModuleFooter className="px-4 py-3 leading-relaxed sm:px-5">
            בעלים ומנהלים יכולים לשנות כלים והגדרות. חברי צוות עובדים עם הלקוחות, העסקאות, הפעילות והמשימות.
          </ModuleFooter>
        </Module>

        <Module>
          <ModuleRail
            index={7}
            icon={<Sparkle />}
            title="היועץ החכם"
            actions={aiReady ? <Badge variant="positive">מחובר</Badge> : <Badge variant="warning">לא מחובר</Badge>}
          />
          <ModuleBody className="space-y-2">
            <p className="text-[13px] font-medium">היועץ רץ רק בשרת, ומשתמש רק בנתונים של העסק שלך.</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {aiReady
                ? "היועץ, זיהוי העמודות בקבצים והסיכום היומי משתמשים ב־OpenAI. היועץ יכול לקרוא ולהמליץ, אבל אף פעם לא משנה נתונים בלי האישור שלך."
                : "כדי להפעיל תשובות חכמות, צריך להוסיף מפתח OPENAI_API_KEY בשרת. עד אז, מנוע הניתוח המובנה עונה מתוך הנתונים שלך."}
            </p>
          </ModuleBody>
        </Module>
      </div>
    </PageContainer>
  );
}
