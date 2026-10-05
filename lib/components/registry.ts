import type { BusinessType, DataCounts, EntityName } from "@/types/domain";
import { SIZE_TO_WIDTH, WIDTHS, type ComponentConfig, type ComponentDefinition, type ComponentWidth } from "./types";

const MANAGERS = { manage: ["owner", "admin"] } as ComponentDefinition["permissions"];

/**
 * The Component Registry. The Store, the Workspace, configuration forms,
 * recommendations and search all discover Components from this list.
 * To add a Component: add its definition here, a loader in loaders.ts and a view in views.tsx.
 */
export const COMPONENT_REGISTRY: ComponentDefinition[] = [
  {
    id: "today",
    name: "היום",
    description: "מה מחכה לך היום: תורים, משימות, ולמי כדאי לשלוח WhatsApp",
    category: "operations",
    requiredEntities: [],
    recommendedFor: ["service", "sales", "both"],
    defaultSize: "lg",
    visualization: "רשימת פעולות להיום, כל שורה עם כפתור אחד",
    configFields: [
      {
        key: "factor",
        label: "לקוח 'הגיע הזמן לחזור' כשעבר",
        type: "select",
        options: [
          { value: "1.25", label: "קצת יותר מהרגיל" },
          { value: "1.5", label: "פי 1.5 מהזמן הרגיל בין קניות" },
          { value: "2", label: "פי 2 מהזמן הרגיל" },
        ],
        default: "1.5",
      },
    ],
    actions: [
      { id: "whatsapp", label: "שלח WhatsApp" },
      { id: "complete-task", label: "סמן כבוצעה" },
    ],
    permissions: MANAGERS,
    consumes: ["service"],
    emits: ["customer"],
    emptyState: { title: "אין שום דבר דחוף היום", description: "תורים, משימות ולקוחות שכדאי לחזור אליהם יופיעו כאן כל בוקר." },
  },
  {
    id: "customer-hub",
    name: "הלקוחות שלי",
    description: "מי הלקוחות שלך, מי חדש ומי פעיל",
    category: "customers",
    requiredEntities: ["customers"],
    recommendedFor: ["service", "sales", "both"],
    defaultSize: "lg",
    visualization: "מספרים עיקריים וטבלת לקוחות עם חיפוש",
    configFields: [
      {
        key: "activeDays",
        label: "לקוח נחשב פעיל אם קנה או ביקר בתוך",
        type: "select",
        options: [
          { value: "30", label: "30 ימים" },
          { value: "60", label: "60 ימים" },
          { value: "90", label: "90 ימים" },
          { value: "180", label: "180 ימים" },
        ],
        default: "90",
      },
    ],
    actions: [
      { id: "view-customer", label: "צפה בלקוח" },
      { id: "add-customer", label: "הוסף לקוח" },
    ],
    permissions: MANAGERS,
    consumes: ["service"],
    emits: ["customer"],
    emptyState: { title: "עדיין אין לקוחות", description: "העלה את רשימת הלקוחות שלך מקובץ אקסל, או הוסף את הלקוח הראשון." },
    href: "/customers",
  },
  {
    id: "revenue-intelligence",
    name: "הכנסות",
    description: "כמה כסף נכנס, מאיזה שירות ואיך זה משתנה",
    category: "finance",
    requiredEntities: ["transactions"],
    recommendedFor: ["service", "sales", "both"],
    defaultSize: "lg",
    visualization: "מספרים עיקריים, גרף הכנסות לפי חודש והכנסות לפי שירות",
    configFields: [
      {
        key: "range",
        label: "טווח תאריכים",
        type: "select",
        options: [
          { value: "90d", label: "90 הימים האחרונים" },
          { value: "6m", label: "חצי שנה אחרונה" },
          { value: "12m", label: "12 החודשים האחרונים" },
          { value: "ytd", label: "מתחילת השנה" },
          { value: "all", label: "כל הזמן" },
        ],
        default: "12m",
      },
      {
        key: "compare",
        label: "השוואה ל",
        type: "select",
        options: [
          { value: "previous_period", label: "התקופה הקודמת" },
          { value: "previous_month", label: "החודש הקודם" },
          { value: "previous_quarter", label: "הרבעון הקודם" },
          { value: "previous_year", label: "השנה שעברה" },
        ],
        default: "previous_year",
      },
    ],
    actions: [{ id: "change-range", label: "שנה טווח תאריכים" }],
    permissions: MANAGERS,
    consumes: ["range", "service"],
    emits: ["service"],
    emptyState: { title: "עדיין אין נתוני מכירות", description: "העלה קובץ מכירות מהקופה או מהנהלת החשבונות, ונראה לך כמה כסף נכנס." },
  },
  {
    id: "ai-analyst",
    name: "היועץ החכם",
    description: "שאל שאלה על העסק במילים פשוטות וקבל תשובה",
    category: "ai",
    requiredEntities: [],
    recommendedFor: ["service", "sales", "both"],
    defaultSize: "md",
    visualization: "תיבת שאלה עם הצעות לשאלות",
    configFields: [],
    actions: [{ id: "ask", label: "שאל שאלה" }],
    permissions: MANAGERS,
    consumes: ["range", "service", "stage"],
    emits: [],
    emptyState: { title: "עדיין אין על מה לענות", description: "העלה את נתוני העסק, והיועץ יענה לך לפיהם." },
    href: "/ai",
  },
  {
    id: "repeat-customers",
    name: "לקוחות חוזרים",
    description: "מי חוזר אליך, ומי כבר היה אמור לחזור",
    category: "customers",
    requiredEntities: ["transactions"],
    recommendedFor: ["service", "both"],
    defaultSize: "md",
    visualization: "אחוז לקוחות חוזרים ורשימת קבועים שלא חזרו",
    configFields: [
      {
        key: "factor",
        label: "סמן לקוח קבוע כ\"באיחור\" אחרי",
        type: "select",
        options: [
          { value: "1.25", label: "פי 1.25 מהזמן הרגיל שלו" },
          { value: "1.5", label: "פי 1.5 מהזמן הרגיל שלו" },
          { value: "2", label: "פי 2 מהזמן הרגיל שלו" },
        ],
        default: "1.5",
      },
    ],
    actions: [
      { id: "view-customer", label: "צפה בלקוח" },
      { id: "create-task", label: "צור משימה" },
    ],
    permissions: MANAGERS,
    consumes: ["service"],
    emits: ["customer"],
    emptyState: { title: "עדיין אין היסטוריית קניות", description: "העלה את המכירות שלך כדי לראות מי חוזר אליך." },
  },
  {
    id: "customer-risk",
    name: "לקוחות בסיכון",
    description: "לקוחות שהפסיקו להגיע או מוציאים פחות, לפני שתאבד אותם",
    category: "customers",
    requiredEntities: ["transactions"],
    recommendedFor: ["service", "both"],
    defaultSize: "md",
    visualization: "רשימת לקוחות בסיכון, מהדחוף ביותר",
    configFields: [
      {
        key: "threshold",
        label: "לקוח בסיכון אם לא הגיע במשך",
        type: "select",
        options: [
          { value: "30", label: "30 ימים" },
          { value: "60", label: "60 ימים" },
          { value: "90", label: "90 ימים" },
        ],
        default: "60",
      },
      {
        key: "drop",
        label: "או שההוצאה שלו ירדה ב",
        type: "select",
        options: [
          { value: "20", label: "20% או יותר" },
          { value: "30", label: "30% או יותר" },
          { value: "50", label: "50% או יותר" },
        ],
        default: "30",
      },
    ],
    actions: [
      { id: "view-customer", label: "צפה בלקוח" },
      { id: "create-task", label: "צור משימה" },
    ],
    permissions: MANAGERS,
    consumes: ["service"],
    emits: ["customer"],
    emptyState: { title: "עדיין אין נתוני מכירות", description: "העלה את היסטוריית הקניות כדי לגלות לקוחות שעלולים לעזוב." },
  },
  {
    id: "activities",
    name: "יומן פעילות",
    description: "כל התורים, השיחות והביקורים במקום אחד",
    category: "operations",
    requiredEntities: [],
    recommendedFor: ["service", "both"],
    defaultSize: "md",
    visualization: "רשימת פעילות לפי תאריך",
    configFields: [
      {
        key: "show",
        label: "מה להציג קודם",
        type: "select",
        options: [
          { value: "upcoming", label: "מה שמחכה בהמשך" },
          { value: "recent", label: "מה שקרה לאחרונה" },
        ],
        default: "recent",
      },
    ],
    actions: [
      { id: "add-activity", label: "הוסף פעילות" },
      { id: "edit-activity", label: "ערוך פעילות" },
    ],
    permissions: MANAGERS,
    consumes: [],
    emits: ["customer"],
    emptyState: { title: "עדיין אין פעילות", description: "רשום תורים, שיחות וביקורים, וכאן ייבנה היומן שלך." },
    href: "/activities",
  },
  {
    id: "sales-pipeline",
    name: "עסקאות בתהליך",
    description: "כל עסקה ובאיזה שלב היא, מהפנייה ועד הסגירה",
    category: "sales",
    requiredEntities: [],
    recommendedFor: ["sales", "both"],
    defaultSize: "lg",
    visualization: "לוח עסקאות לפי שלב, עם סכומים",
    configFields: [],
    actions: [
      { id: "add-deal", label: "הוסף עסקה" },
      { id: "move-deal", label: "העבר עסקה לשלב אחר" },
    ],
    permissions: MANAGERS,
    consumes: ["stage"],
    emits: ["stage"],
    emptyState: { title: "עדיין אין עסקאות", description: "הוסף את העסקה הראשונה שלך, או העלה רשימת עסקאות מקובץ." },
    href: "/deals",
  },
  {
    id: "deal-risk",
    name: "עסקאות תקועות",
    description: "עסקאות שאף אחד לא נגע בהן זמן מה, לפני שהן הולכות לאיבוד",
    category: "sales",
    requiredEntities: ["deals"],
    recommendedFor: ["sales", "both"],
    defaultSize: "md",
    visualization: "רשימת עסקאות תקועות, מהדחופה ביותר",
    configFields: [
      {
        key: "idleDays",
        label: "עסקה תקועה אם לא הייתה בה פעילות במשך",
        type: "select",
        options: [
          { value: "7", label: "7 ימים" },
          { value: "14", label: "14 ימים" },
          { value: "30", label: "30 ימים" },
        ],
        default: "14",
      },
    ],
    actions: [
      { id: "view-deal", label: "צפה בעסקה" },
      { id: "create-task", label: "צור משימה" },
    ],
    permissions: MANAGERS,
    consumes: ["stage"],
    emits: [],
    emptyState: { title: "אין עסקאות פתוחות", description: "הוסף עסקאות כדי שנוכל להתריע כשמשהו נתקע." },
  },
  {
    id: "followup-radar",
    name: "למי לחזור",
    description: "משימות באיחור, עסקאות שקטות ופניות שמחכות לך",
    category: "sales",
    requiredEntities: [],
    recommendedFor: ["sales", "both"],
    defaultSize: "md",
    visualization: "שלוש רשימות של דברים שצריך לחזור אליהם",
    configFields: [
      {
        key: "leadDays",
        label: "פנייה צריכה תשומת לב אחרי",
        type: "select",
        options: [
          { value: "3", label: "3 ימים" },
          { value: "7", label: "7 ימים" },
          { value: "14", label: "14 ימים" },
        ],
        default: "7",
      },
    ],
    actions: [{ id: "create-task", label: "צור משימה" }],
    permissions: MANAGERS,
    consumes: ["stage"],
    emits: [],
    emptyState: { title: "אין למי לחזור כרגע", description: "משימות, עסקאות ופניות שמחכות לך יופיעו כאן." },
  },
  {
    id: "tasks",
    name: "משימות",
    description: "מה צריך לעשות היום, ומה כבר באיחור",
    category: "operations",
    requiredEntities: [],
    recommendedFor: ["service", "sales", "both"],
    defaultSize: "md",
    visualization: "רשימת משימות פתוחות ומשימות באיחור",
    configFields: [
      {
        key: "scope",
        label: "מה להציג",
        type: "select",
        options: [
          { value: "all", label: "כל המשימות הפתוחות" },
          { value: "mine", label: "רק המשימות שלי" },
        ],
        default: "all",
      },
    ],
    actions: [
      { id: "add-task", label: "הוסף משימה" },
      { id: "complete-task", label: "סמן כבוצעה" },
    ],
    permissions: MANAGERS,
    consumes: [],
    emits: ["customer"],
    emptyState: { title: "אין משימות פתוחות", description: "משימות שתיצור מכל כלי אחר יופיעו כאן." },
    href: "/tasks",
  },
];

export const REGISTRY_BY_ID = new Map(COMPONENT_REGISTRY.map((c) => [c.id, c]));

export function getDefinition(id: string) {
  return REGISTRY_BY_ID.get(id);
}

/** Fills in defaults for any config keys the saved config is missing. */
export function resolveConfig(def: ComponentDefinition, saved: Record<string, unknown> | null | undefined): ComponentConfig {
  const config: ComponentConfig = {};
  for (const f of def.configFields) {
    const v = saved?.[f.key];
    config[f.key] = typeof v === "string" && f.options.some((o) => o.value === v) ? v : f.default;
  }
  const size = saved?.size;
  config.size = size === "sm" || size === "md" || size === "lg" ? size : def.defaultSize;
  const w = saved?.w;
  config.w = typeof w === "string" && (WIDTHS as readonly string[]).includes(w) ? (w as ComponentWidth) : SIZE_TO_WIDTH[config.size];
  return config;
}

/** Hebrew name of each kind of data, used in "needs … data" messages. */
export const ENTITY_SINGULAR: Record<EntityName, string> = {
  customers: "לקוחות",
  transactions: "מכירות",
  services: "שירותים",
  leads: "פניות",
  deals: "עסקאות",
  activities: "פעילות",
  tasks: "משימות",
};

/** ["לקוחות","מכירות"] → "לקוחות ומכירות" (Hebrew "and" attaches to the last word). */
export function joinHebrew(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} ו${words[words.length - 1]}`;
}

/** "נתוני לקוחות ומכירות" */
export function entitiesText(entities: EntityName[]): string {
  return `נתוני ${joinHebrew(entities.map((e) => ENTITY_SINGULAR[e]))}`;
}

export function missingEntities(def: ComponentDefinition, counts: DataCounts): EntityName[] {
  return def.requiredEntities.filter((e) => !counts[e]);
}

export interface Recommendation {
  definition: ComponentDefinition;
  score: number;
  reason: string;
  ready: boolean;
}

/**
 * Data-driven recommendations. Business type and available data shape the score;
 * no Component is ever hidden because of business type.
 */
export function recommend(businessType: BusinessType, counts: DataCounts, installed: Set<string>): Recommendation[] {
  return COMPONENT_REGISTRY.filter((d) => !installed.has(d.id))
    .map((definition) => {
      const fitsType = definition.recommendedFor.includes(businessType);
      const missing = missingEntities(definition, counts);
      const ready = missing.length === 0;
      const usesData = definition.requiredEntities.length > 0 && ready;
      let score = (fitsType ? 50 : 0) + (ready ? 30 : 0) + (usesData ? 15 : 0);
      if (definition.id === "ai-analyst" && Object.values(counts).some((n) => n > 0)) score += 10;
      if (definition.id === "sales-pipeline" && counts.deals > 0) score += 20;
      if (definition.id === "activities" && counts.activities > 0) score += 15;
      if (definition.id === "followup-radar" && (counts.leads > 0 || counts.deals > 0)) score += 15;
      const reason = !ready
        ? `צריך ${entitiesText(missing)}`
        : usesData
          ? `עובד על ה${joinHebrew(definition.requiredEntities.map((e) => ENTITY_SINGULAR[e]))} שלך`
          : fitsType
            ? "מתאים לעסק שלך"
            : "זמין";
      return { definition, score, reason, ready };
    })
    .sort((a, b) => b.score - a.score);
}

/** Recommended = fits the business type and has the data it needs. */
export function topRecommendations(businessType: BusinessType, counts: DataCounts, installed: Set<string>) {
  return recommend(businessType, counts, installed).filter((r) => r.ready && r.score >= 85);
}
