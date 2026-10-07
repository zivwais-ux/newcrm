// The canonical business model. Imported columns are mapped onto these fields;
// Components only ever read the resulting canonical tables.

export type CanonicalEntity = "customer" | "transaction" | "service" | "lead" | "deal" | "activity";
export type FieldType = "text" | "email" | "phone" | "date" | "money" | "enum";

export interface CanonicalField {
  key: string; // e.g. "transaction.amount"
  entity: CanonicalEntity;
  label: string;
  type: FieldType;
  description: string;
  synonyms: string[]; // lowercase; English + Hebrew
}

export const IGNORE = "ignore";
export const CUSTOM = "custom";
export type MappingTarget = string; // CanonicalField.key | IGNORE | CUSTOM | field:… | newfield:…

/** Entities a business's own field can be filled for from a file (their tables have custom_fields). */
export const IMPORT_FIELD_ENTITIES = ["customers", "leads", "transactions", "deals"] as const;
export type ImportFieldEntity = (typeof IMPORT_FIELD_ENTITIES)[number];
export const FIELD_ENTITY_OF: Record<ImportFieldEntity, CanonicalEntity> = {
  customers: "customer",
  leads: "lead",
  transactions: "transaction",
  deals: "deal",
};

/** "field:customers:f_ab12" — the column fills an existing field of the business. */
export const fieldTarget = (entity: ImportFieldEntity, key: string) => `field:${entity}:${key}`;
/** "newfield:customers" — a new field named after the column is created when the import starts. */
export const newFieldTarget = (entity: ImportFieldEntity) => `newfield:${entity}`;

export function parseFieldTarget(target: MappingTarget): { entity: ImportFieldEntity; key: string } | null {
  const m = target.match(/^field:([a-z]+):(f_[a-z0-9_]{1,40})$/);
  return m && (IMPORT_FIELD_ENTITIES as readonly string[]).includes(m[1]) ? { entity: m[1] as ImportFieldEntity, key: m[2] } : null;
}

export function parseNewFieldTarget(target: MappingTarget): ImportFieldEntity | null {
  const m = target.match(/^newfield:([a-z]+)$/);
  return m && (IMPORT_FIELD_ENTITIES as readonly string[]).includes(m[1]) ? (m[1] as ImportFieldEntity) : null;
}

export const CANONICAL_FIELDS: CanonicalField[] = [
  // Customer / contact
  {
    key: "customer.name",
    entity: "customer",
    label: "שם לקוח",
    type: "text",
    description: "Full name of the customer, client or contact",
    synonyms: ["customer name", "customer", "client", "client name", "name", "full name", "contact", "contact name", "שם", "שם לקוח", "לקוח", "שם מלא", "account name", "שם הלקוח", "שם פרטי ומשפחה", "שם משפחה", "איש קשר", "שם איש קשר", "מטופל", "שם המטופל", "לקוחה", "שם לקוחה", "מזמין", "שם מזמין"],
  },
  {
    key: "customer.email",
    entity: "customer",
    label: "אימייל",
    type: "email",
    description: "Customer email address",
    synonyms: ["email", "e-mail", "mail", "email address", "customer email", "אימייל", "מייל", 'דוא"ל', "דואל", "מייל לקוח", "כתובת מייל", "כתובת אימייל", "דואר אלקטרוני", "דוא״ל"],
  },
  {
    key: "customer.phone",
    entity: "customer",
    label: "טלפון",
    type: "phone",
    description: "Customer phone number",
    synonyms: ["phone", "phone number", "mobile", "cell", "telephone", "tel", "טלפון", "נייד", "פלאפון", "customer phone", "מספר טלפון", "טלפון נייד", "מס טלפון", "מס' טלפון", "סלולרי", "נייד לקוח", "whatsapp", "וואטסאפ", "ווצאפ"],
  },
  {
    key: "customer.company",
    entity: "customer",
    label: "חברה",
    type: "text",
    description: "Company or organization the customer belongs to",
    synonyms: ["company", "company name", "organization", "organisation", "business", "account", "חברה", "שם חברה", "ארגון", "שם העסק", "עסק", "שם עסק"],
  },
  {
    key: "customer.status",
    entity: "customer",
    label: "סטטוס לקוח",
    type: "enum",
    description: "Customer status: active / inactive / churned",
    synonyms: ["customer status", "client status", "סטטוס לקוח", "מצב לקוח"],
  },
  // Transaction
  {
    key: "transaction.date",
    entity: "transaction",
    label: "תאריך מכירה",
    type: "date",
    description: "Date of the purchase, invoice or payment",
    synonyms: ["purchase date", "date", "transaction date", "order date", "invoice date", "payment date", "sale date", "visit date", "תאריך", "תאריך רכישה", "תאריך עסקה", "תאריך חשבונית", "תאריך תשלום", "תאריך קנייה", "תאריך הזמנה", "תאריך ביצוע", "תאריך שירות", "תאריך טיפול", "תאריך מסמך", "תאריך קבלה", "יום"],
  },
  {
    key: "transaction.amount",
    entity: "transaction",
    label: "סכום",
    type: "money",
    description: "Revenue amount of the purchase or payment",
    synonyms: ["amount", "total", "price", "revenue", "sum", "paid", "payment", "sale amount", "order total", "invoice amount", "סכום", "מחיר", "סה\"כ", "סהכ", "הכנסה", "תשלום", "סכום כולל", "סכום לתשלום", "סה״כ", "סך הכל", "סה\"כ לתשלום", "מחיר כולל", "סכום בש\"ח", "שולם", "סכום ששולם", "סכום עסקה", "הכנסות", "מחזור", "₪"],
  },
  {
    key: "transaction.product_or_service",
    entity: "transaction",
    label: "שירות / מוצר",
    type: "text",
    description: "What was sold: product or service name",
    synonyms: ["service", "product", "item", "service name", "product name", "treatment", "package", "plan", "description", "שירות", "מוצר", "טיפול", "פריט", "חבילה", "סוג שירות", "סוג טיפול", "שם שירות", "שם מוצר", "תיאור", "פירוט", "מוצרים", "שירותים"],
  },
  {
    key: "transaction.owner",
    entity: "transaction",
    label: "עובד / נציג",
    type: "text",
    description: "Employee or sales representative responsible",
    synonyms: ["sales rep", "rep", "salesperson", "agent", "employee", "staff", "owner", "seller", "account manager", "נציג", "איש מכירות", "עובד", "מטפל", "אחראי", "מוכר", "שם העובד", "מבצע", "ספר", "קוסמטיקאית", "מנקה", "צוות"],
  },
  {
    key: "transaction.status",
    entity: "transaction",
    label: "סטטוס תשלום",
    type: "enum",
    description: "paid / pending / cancelled / refunded",
    synonyms: ["payment status", "status", "invoice status", "סטטוס תשלום", "סטטוס", "מצב תשלום", "שולם?"],
  },
  {
    key: "transaction.type",
    entity: "transaction",
    label: "סוג מכירה",
    type: "enum",
    description: "sale / refund / subscription",
    synonyms: ["transaction type", "type", "סוג עסקה", "סוג", "סוג תשלום", "סוג מסמך"],
  },
  // Service catalog
  {
    key: "service.category",
    entity: "service",
    label: "קטגוריית שירות",
    type: "text",
    description: "Category of the product or service",
    synonyms: ["category", "service category", "product category", "קטגוריה", "תחום", "סוג"],
  },
  // Lead
  {
    key: "lead.source",
    entity: "lead",
    label: "מקור הפנייה",
    type: "text",
    description: "Where the lead came from (website, referral, ads…)",
    synonyms: ["source", "lead source", "channel", "utm source", "מקור", "מקור ליד", "מאיפה הגיע", "הגיע דרך", "ערוץ", "מקור פנייה", "מקור הגעה", "קמפיין"],
  },
  {
    key: "lead.status",
    entity: "lead",
    label: "סטטוס פנייה",
    type: "enum",
    description: "new / contacted / qualified / converted / lost",
    synonyms: ["lead status", "סטטוס ליד", "סטטוס פנייה", "מצב פנייה"],
  },
  {
    key: "lead.value",
    entity: "lead",
    label: "שווי פנייה",
    type: "money",
    description: "Estimated value of the lead",
    synonyms: ["lead value", "estimated value", "potential", "שווי ליד", "שווי משוער", "פוטנציאל"],
  },
  // Deal
  {
    key: "deal.name",
    entity: "deal",
    label: "שם עסקה",
    type: "text",
    description: "Name or title of the deal / opportunity",
    synonyms: ["deal", "deal name", "opportunity", "opportunity name", "project", "עסקה", "שם עסקה", "הזדמנות", "שם הזדמנות", "פרויקט", "שם פרויקט", "הצעת מחיר"],
  },
  {
    key: "deal.stage",
    entity: "deal",
    label: "שלב עסקה",
    type: "enum",
    description: "Pipeline stage of the deal",
    synonyms: ["stage", "deal stage", "pipeline stage", "phase", "שלב", "שלב עסקה", "שלב מכירה", "מצב עסקה", "סטטוס עסקה"],
  },
  {
    key: "deal.value",
    entity: "deal",
    label: "שווי עסקה",
    type: "money",
    description: "Monetary value of the deal",
    synonyms: ["deal value", "deal amount", "opportunity value", "deal size", "שווי עסקה", "סכום עסקה משוער", "גודל עסקה", "שווי הצעה"],
  },
  {
    key: "deal.expected_close",
    entity: "deal",
    label: "תאריך סגירה צפוי",
    type: "date",
    description: "When the deal is expected to close",
    synonyms: ["expected close", "close date", "expected close date", "closing date", "תאריך סגירה", "צפי סגירה", "תאריך סגירה צפוי"],
  },
  // Activity
  {
    key: "activity.date",
    entity: "activity",
    label: "תאריך פגישה / תור",
    type: "date",
    description: "Date of an appointment, call or meeting",
    synonyms: ["appointment date", "meeting date", "activity date", "appointment", "last contact", "תאריך פגישה", "תור", "פגישה", "תאריך תור", "מועד", "מועד פגישה", "תאריך ושעה", "תאריך הפגישה"],
  },
  {
    key: "activity.type",
    entity: "activity",
    label: "סוג פעילות",
    type: "enum",
    description: "appointment / call / meeting / email / note / visit",
    synonyms: ["activity type", "activity", "interaction", "סוג פעילות", "סוג פגישה", "סוג תור"],
  },
  {
    key: "activity.notes",
    entity: "activity",
    label: "הערות",
    type: "text",
    description: "Free-text notes",
    synonyms: ["notes", "note", "comments", "comment", "remarks", "הערות", "הערה", "תיאור פגישה", "סיכום", "סיכום שיחה", "פרטים"],
  },
];

export const FIELD_BY_KEY = new Map(CANONICAL_FIELDS.map((f) => [f.key, f]));

export const ENTITY_LABELS: Record<CanonicalEntity, string> = {
  customer: "לקוחות",
  transaction: "מכירות",
  service: "שירותים",
  lead: "פניות",
  deal: "עסקאות",
  activity: "פגישות ופעילות",
};

export interface ColumnMapping {
  column: string;
  target: MappingTarget;
  confidence: number; // 0..1
  reason?: string;
  source: "ai" | "heuristic" | "user";
}

export function isCanonicalTarget(target: MappingTarget) {
  return FIELD_BY_KEY.has(target);
}

/** Which canonical entities will an import produce, given its mapping? */
export function detectEntities(mapping: ColumnMapping[]): CanonicalEntity[] {
  const targets = new Set(mapping.map((m) => m.target));
  const entities = new Set<CanonicalEntity>();
  const has = (prefix: string) => [...targets].some((t) => t.startsWith(prefix));

  if (has("customer.")) entities.add("customer");
  if (targets.has("transaction.amount")) {
    entities.add("transaction");
    entities.add("customer");
  }
  if (targets.has("transaction.product_or_service") && targets.has("transaction.amount")) entities.add("service");
  if (has("deal.")) {
    entities.add("deal");
    entities.add("customer");
  }
  if (has("lead.")) {
    entities.add("lead");
    entities.delete("customer"); // contacts become leads, not customers
    if (targets.has("transaction.amount")) entities.add("customer");
  }
  if (targets.has("activity.date") || targets.has("activity.type")) {
    entities.add("activity");
    entities.add("customer");
  }
  return [...entities];
}
