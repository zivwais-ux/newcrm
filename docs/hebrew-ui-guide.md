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
- Design primitives available: components/ui/card.tsx (Card, CardHeader, CardBody — rounded-xl border shadow-sm),
  components/ui/empty-state.tsx (EmptyState icon/title/description/action), components/ui/ltr.tsx.
  Prefer rounded-lg/xl, shadow-xs/sm/md tokens, text sizes 12/13/14/15/16/20/24, font-semibold headings, font-bold page titles.
  Empty states must TEACH: one sentence what appears here + one action button (e.g. "העלה קובץ" → /data/import).
- Product rule: NO synthetic/demo data is ever inserted. Don't add sample data.
- The drag-and-drop empty canvas is the CORE of the product (not "just another CRM"). Don't remove or hide it.

## Visual language: "modular studio"
- **Table and modules.** The app is a table (`bg-background`/`bg-table`, dot-grid + `.grain` on the home canvas) with white modules on it. Every surface is a `<Module>` with a `<ModuleRail>` (mono index 01/02, brand icon, 14px semibold title, actions at the end) — see `components/ui/module.tsx`.
- **No sidebar.** Navigation lives in a floating dock at the bottom (same on phone and desktop). The top strip holds the business name, the command bar (⌘K) and the account menu.
- **Command bar** understands short Hebrew sentences (`lib/command/parse.ts`): "מכירה 250 לדנה", "תור ליוסי מחר ב-10", "לקוח חדש …", "משימה …", "הוסף מודול …", "פתח לקוחות"; questions go to the advisor, anything else is search.
- **Flow lines.** Modules show in/out ports; lines run through the gutters between modules from the one that sets a filter to the ones that react to it, and carry a moving dash while that filter is active.
- **Type.** IBM Plex Sans Hebrew (300–700) for text, IBM Plex Mono via `.num` for numbers (amounts, counts, times). Use `.num` only on numeric strings — Plex Mono has no Hebrew glyphs.
- **Color.** One accent: indigo `brand`. Positive/negative/warning only for status. Stone neutrals; warm-tinted shadows (`shadow-block` for modules).
- **Shape.** 2px everywhere. `rounded-full` only for avatars, status dots and check circles. No pills, no eyebrows.
- **Icons.** `@phosphor-icons/react` only (regular; `weight="fill"` for active). Server components import from `@phosphor-icons/react/dist/ssr`.
- **Motion.** Only when it explains something: module entry stagger, dock active bar, drawer slide, flow dashes. Everything respects `prefers-reduced-motion`.

## Quick entry terms
| English | Hebrew |
|---|---|
| Quick sale | מכירה מהירה |
| New appointment | תור חדש |
| New customer (inline) | לקוח חדש / צור לקוח חדש |
| Paid / Pending | שולם / ממתין לתשלום |
| Delete file and its data | מחק קובץ ונתונים |
| Remove from list only | הסר מהרשימה |
