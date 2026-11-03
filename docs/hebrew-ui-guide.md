# Hebrew UI guide (Business OS) — shared by all translators

Audience: Israeli small-business owners (cleaning, clinics, salons, shops) with LOW tech literacy.
Tone: warm, plain, short. Second person masculine-neutral ("הוסף", "בחר", "העלה") — imperative, not infinitive.
No jargon. Never leave English UI text (brand name "Business OS" may stay). Keep code identifiers / DB values in English.

## Core terms (use EXACTLY these)
| English | Hebrew |
|---|---|
| Home | בית |
| Workspace / Canvas | מסך העבודה |
| Component(s) | כלי / כלים |
| Component library / palette | ספריית הכלים |
| Add to canvas | הוסף למסך |
| On canvas | כבר במסך |
| Drag | גרור |
| Customers | לקוחות |
| Customer | לקוח |
| Leads | פניות |
| Lead | פנייה |
| Deals | עסקאות |
| Pipeline | עסקאות בתהליך |
| Stage | שלב |
| Transactions / Sales | מכירות |
| Revenue | הכנסות |
| Service | שירות |
| Activities | פעילות |
| Activity | פעילות |
| Tasks | משימות |
| Follow-up | מעקב / לחזור ללקוח |
| Overdue | באיחור |
| At risk | בסיכון |
| Repeat customers | לקוחות חוזרים |
| Import data | העלאת נתונים |
| Data sources | מקורות נתונים |
| Settings | הגדרות |
| AI Analyst | היועץ החכם |
| Ask AI | שאל את היועץ |
| Filter | סינון |
| Date range | טווח תאריכים |
| Save / Saving… / All changes saved | שמור / שומר… / הכל נשמר |
| Cancel | ביטול |
| Remove | הסר |
| Delete | מחק |
| Edit | ערוך |
| Configure / Settings of component | הגדרות הכלי |
| Width | רוחב |
| Preview | תצוגה מקדימה |
| Search… | חיפוש… |
| Loading… | טוען… |
| Something went wrong | משהו השתבש |
| Try again | נסה שוב |
| Owner/Admin/Member | בעלים / מנהל / חבר צוות |
| Sign in / Sign up / Sign out | כניסה / הרשמה / יציאה |
| Email / Password | אימייל / סיסמה |
| Status | סטטוס |
| Active / Inactive / Churned | פעיל / לא פעיל / עזב |
| Open / Won / Lost | פתוחה / נסגרה בהצלחה / לא נסגרה |
| Due date | תאריך יעד |
| Notes | הערות |
| Phone | טלפון |
| Company | חברה |
| Amount | סכום |
| Date | תאריך |
| Source | מקור |
| Value | שווי |
| Probability | סיכוי |

## Component names (registry)
customer-hub → "הלקוחות שלי" · revenue-intelligence → "הכנסות" · ai-analyst → "היועץ החכם" · repeat-customers → "לקוחות חוזרים" ·
customer-risk → "לקוחות בסיכון" · activities → "יומן פעילות" · sales-pipeline → "עסקאות בתהליך" · deal-risk → "עסקאות תקועות" ·
followup-radar → "למי לחזור" · tasks → "משימות"

Agent modules carry a persona (names/roles in `lib/agents/personas.ts`, ids unchanged):
agent-revenue → "נועה · הכנסות" (נועה · אנליסטית הכנסות) · agent-customers → "אורי · לקוחות" (אורי · שומר הלקוחות) ·
agent-sales → "תום · מכירות" (תום · מאמן המכירות) · agent-chief → "שירה · ראש המטה" · company-brain → "נובה · המוח של העסק".
Verbs follow the name's gender ("נועה עובדת…", "אורי עובד…", "נובה חושבת…"); empty states use the name ("שירה עוד לא רצה").

## Formatting rules
- Use helpers from lib/utils: formatCurrency, formatNumber, formatDate, formatDateTime, formatMonth, relativeDays, plural.
  Never call toLocaleString("en-US") / Intl directly in components — replace with formatNumber/formatCurrency/formatMonth.
- Amounts, phones, emails, URLs, English names inside Hebrew sentences: wrap with <Ltr> from "@/components/ui/ltr" (or dir="ltr" on inputs).
  Free-text inputs: dir="auto". Email/phone/url inputs: dir="ltr".
- Plurals: Hebrew has gender; prefer constructions like `${formatNumber(n)} לקוחות`, and "לקוח אחד" for 1 (use plural()).
- Layout is RTL already (html dir="rtl"). Use logical Tailwind classes only: ms/me/ps/pe/start/end/border-s/border-e/text-start/text-end.
  Never add ml/mr/pl/pr/left/right/text-left/text-right. Direction icons (ChevronLeft/Right, ArrowLeft/Right) get className "rtl:-scale-x-100".
  Keyboard hints like "⌘K" wrap in <Ltr>/<kbd dir="ltr">.
- Colors stay EXACTLY as they are (brand indigo etc.). Design upgrade = depth, spacing, typography, motion only.
- Design primitives available: components/ui/card.tsx (Card, CardHeader, CardBody — a Module: rounded-lg 14px, hairline border, soft floating shadow),
  components/ui/empty-state.tsx (EmptyState icon/title/description/action), components/ui/ltr.tsx.
  Prefer rounded-lg/xl, shadow-xs/sm/md tokens, text sizes 12/13/14/15/16/20/24, font-semibold headings, font-bold page titles.
  Empty states must TEACH: one sentence what appears here + one action button (e.g. "העלה קובץ" → /data/import).
- Product rule: NO synthetic/demo data is ever inserted. Don't add sample data.
- The drag-and-drop empty canvas is the CORE of the product (not "just another CRM"). Don't remove or hide it.

## Visual language: "soft & alive" studio
- **Table and modules.** The app is a table (`bg-background`/`bg-table`, dot-grid + `.grain` on the home canvas) with white modules floating above it (soft indigo glow at the top of the table, softer dot grid). Every surface is a `<Module>` with a `<ModuleRail>` (mono index 01/02, brand icon in a rounded `bg-brand-soft` tile, 14px semibold title, actions at the end; airy, no grey bar) — see `components/ui/module.tsx`.
- **No sidebar.** Navigation lives in a floating dock at the bottom (same on phone and desktop). The top strip holds the business name, the command bar (⌘K) and the account menu.
- **Command bar** understands short Hebrew sentences (`lib/command/parse.ts`): "מכירה 250 לדנה", "תור ליוסי מחר ב-10", "לקוח חדש …", "משימה …", "הוסף מודול …", "פתח לקוחות"; questions go to the advisor, anything else is search.
- **Flow lines.** Modules show in/out ports; lines run through the gutters between modules from the one that sets a filter to the ones that react to it, and carry a moving dash while that filter is active.
- **Type.** IBM Plex Sans Hebrew (300–700) for everything. Numbers (amounts, counts, times) get `.num`: tabular lining digits in the same family, so columns line up and big KPI numbers read cleanly.
- **Color.** One accent: indigo `brand` (+ `brand-soft` tints). Positive/negative/warning only for status. Stone neutrals; low-contrast hairlines (`border-border/80`).
- **Shape.** `--radius` 14px. Scale: xs 6 · sm 8 · md 10 · lg 14 · xl 18 · 2xl 22 · 3xl 28. Modules/cards `rounded-lg`; buttons/inputs/selects `rounded-md` (xs buttons `rounded-sm`); chips/badges `rounded-sm`, status/filter chips and suggestion chips `rounded-full`; dialogs `rounded-xl`, sheets round their inner edge, menus/popovers 12–14px; canvases `rounded-2xl`; avatars and dots `rounded-full`. Inner bands that touch a module edge (rails, footers, tinted grids) use `rounded-t-[inherit]`/`rounded-b-[inherit]`. No square 2px surfaces, no eyebrows.
- **Depth.** Modules use `.float-block`: soft multi-layer `shadow-block`, and on hover they lift 2px into `shadow-lift` (200ms ease-out; no lift under reduced motion). No hard offset edges.
- **Icons.** `@phosphor-icons/react` only (regular; `weight="fill"` for active). Server components import from `@phosphor-icons/react/dist/ssr`.
- **Motion.** Small, fast (≤600ms), never looping except agent avatars and flow dashes. Blocks fade+rise in (`.block-enter`, staggered by index on the canvas; `.stagger` for a page's children — uses `translate`, so hover/drag transforms stay free). Dashboard numbers count up: `Stat` does it automatically; elsewhere use `<CountUp text={formatNumber(n)} />` (`components/ui/count-up.tsx`, takes the formatted string). Charts use `components/ui/chart.tsx`: `CHART_GRID` (soft dashed), `CHART_AXIS`, `chartGradient()` (low-opacity brand fill), `CHART_BAR` (rounded tops), `chartAnimation(reduce)`, `ChartTooltipCard`, and `GrowBar` for meter bars that grow from 0. Everything respects `prefers-reduced-motion`.
- **KPIs.** `Stat`: small muted label on top, big tabular `.num` value (26–28px semibold), then a `Delta` chip (soft positive/negative pill) and a muted hint.
- **Agents.** Every agent block shows `<AgentAvatar agent=… />` (`components/agents/agent-avatar.tsx`): a rounded brand tile with one calm SVG loop about its job (revenue: bars + coin; customers: breathing shield + heartbeat; sales: dot into target; chief: checklist ticking; brain: neurons). Pass `working` while it runs/thinks — the loop speeds up and the block says "{name} עובדת…". CSS keyframes `.av-*` live in globals.css.

## Quick entry terms
| English | Hebrew |
|---|---|
| Quick sale | מכירה מהירה |
| New appointment | תור חדש |
| New customer (inline) | לקוח חדש / צור לקוח חדש |
| Paid / Pending | שולם / ממתין לתשלום |
| Delete file and its data | מחק קובץ ונתונים |
| Remove from list only | הסר מהרשימה |
