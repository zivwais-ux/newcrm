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
