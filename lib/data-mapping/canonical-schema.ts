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
export type MappingTarget = string; // CanonicalField.key | IGNORE | CUSTOM

export const CANONICAL_FIELDS: CanonicalField[] = [
  // Customer / contact
  {
    key: "customer.name",
    entity: "customer",
    label: "Customer name",
    type: "text",
    description: "Full name of the customer, client or contact",
    synonyms: ["customer name", "customer", "client", "client name", "name", "full name", "contact", "contact name", "שם", "שם לקוח", "לקוח", "שם מלא", "account name"],
  },
  {
    key: "customer.email",
    entity: "customer",
    label: "Email",
    type: "email",
    description: "Customer email address",
    synonyms: ["email", "e-mail", "mail", "email address", "customer email", "אימייל", "מייל", 'דוא"ל', "דואל"],
  },
  {
    key: "customer.phone",
    entity: "customer",
    label: "Phone",
    type: "phone",
    description: "Customer phone number",
    synonyms: ["phone", "phone number", "mobile", "cell", "telephone", "tel", "טלפון", "נייד", "פלאפון", "customer phone"],
  },
  {
    key: "customer.company",
    entity: "customer",
    label: "Company",
    type: "text",
    description: "Company or organization the customer belongs to",
    synonyms: ["company", "company name", "organization", "organisation", "business", "account", "חברה", "שם חברה", "ארגון"],
  },
  {
    key: "customer.status",
    entity: "customer",
    label: "Customer status",
    type: "enum",
    description: "Customer status: active / inactive / churned",
    synonyms: ["customer status", "client status", "סטטוס לקוח"],
  },
  // Transaction
  {
    key: "transaction.date",
    entity: "transaction",
    label: "Transaction date",
    type: "date",
    description: "Date of the purchase, invoice or payment",
    synonyms: ["purchase date", "date", "transaction date", "order date", "invoice date", "payment date", "sale date", "visit date", "תאריך", "תאריך רכישה", "תאריך עסקה", "תאריך חשבונית"],
  },
  {
    key: "transaction.amount",
    entity: "transaction",
    label: "Amount (revenue)",
    type: "money",
    description: "Revenue amount of the purchase or payment",
    synonyms: ["amount", "total", "price", "revenue", "sum", "paid", "payment", "sale amount", "order total", "invoice amount", "סכום", "מחיר", "סה\"כ", "סהכ", "הכנסה", "תשלום"],
  },
  {
    key: "transaction.product_or_service",
    entity: "transaction",
    label: "Product / service",
    type: "text",
    description: "What was sold: product or service name",
    synonyms: ["service", "product", "item", "service name", "product name", "treatment", "package", "plan", "description", "שירות", "מוצר", "טיפול", "פריט", "חבילה"],
  },
  {
    key: "transaction.owner",
    entity: "transaction",
    label: "Sales rep / staff",
    type: "text",
    description: "Employee or sales representative responsible",
    synonyms: ["sales rep", "rep", "salesperson", "agent", "employee", "staff", "owner", "seller", "account manager", "נציג", "איש מכירות", "עובד", "מטפל", "אחראי"],
  },
  {
    key: "transaction.status",
    entity: "transaction",
    label: "Payment status",
    type: "enum",
    description: "paid / pending / cancelled / refunded",
    synonyms: ["payment status", "status", "invoice status", "סטטוס תשלום", "סטטוס"],
  },
  {
    key: "transaction.type",
    entity: "transaction",
    label: "Transaction type",
    type: "enum",
    description: "sale / refund / subscription",
    synonyms: ["transaction type", "type", "סוג עסקה", "סוג"],
  },
  // Service catalog
  {
    key: "service.category",
    entity: "service",
    label: "Service category",
    type: "text",
    description: "Category of the product or service",
    synonyms: ["category", "service category", "product category", "קטגוריה"],
  },
  // Lead
  {
    key: "lead.source",
    entity: "lead",
    label: "Lead source",
    type: "text",
    description: "Where the lead came from (website, referral, ads…)",
    synonyms: ["source", "lead source", "channel", "utm source", "מקור", "מקור ליד"],
  },
  {
    key: "lead.status",
    entity: "lead",
    label: "Lead status",
    type: "enum",
    description: "new / contacted / qualified / converted / lost",
    synonyms: ["lead status", "סטטוס ליד"],
  },
  {
    key: "lead.value",
    entity: "lead",
    label: "Lead value",
    type: "money",
    description: "Estimated value of the lead",
    synonyms: ["lead value", "estimated value", "potential", "שווי ליד"],
  },
  // Deal
  {
    key: "deal.name",
    entity: "deal",
    label: "Deal name",
    type: "text",
    description: "Name or title of the deal / opportunity",
    synonyms: ["deal", "deal name", "opportunity", "opportunity name", "project", "עסקה", "שם עסקה", "הזדמנות"],
  },
  {
    key: "deal.stage",
    entity: "deal",
    label: "Deal stage",
    type: "enum",
    description: "Pipeline stage of the deal",
    synonyms: ["stage", "deal stage", "pipeline stage", "phase", "שלב", "שלב עסקה"],
  },
  {
    key: "deal.value",
    entity: "deal",
    label: "Deal value",
    type: "money",
    description: "Monetary value of the deal",
    synonyms: ["deal value", "deal amount", "opportunity value", "deal size", "שווי עסקה"],
  },
  {
    key: "deal.expected_close",
    entity: "deal",
    label: "Expected close date",
    type: "date",
    description: "When the deal is expected to close",
    synonyms: ["expected close", "close date", "expected close date", "closing date", "תאריך סגירה"],
  },
  // Activity
  {
    key: "activity.date",
    entity: "activity",
    label: "Activity date",
    type: "date",
    description: "Date of an appointment, call or meeting",
    synonyms: ["appointment date", "meeting date", "activity date", "appointment", "last contact", "תאריך פגישה", "תור", "פגישה"],
  },
  {
    key: "activity.type",
    entity: "activity",
    label: "Activity type",
    type: "enum",
    description: "appointment / call / meeting / email / note / visit",
    synonyms: ["activity type", "activity", "interaction", "סוג פעילות"],
  },
  {
    key: "activity.notes",
    entity: "activity",
    label: "Notes",
    type: "text",
    description: "Free-text notes",
    synonyms: ["notes", "note", "comments", "comment", "remarks", "הערות", "הערה"],
  },
];

export const FIELD_BY_KEY = new Map(CANONICAL_FIELDS.map((f) => [f.key, f]));

export const ENTITY_LABELS: Record<CanonicalEntity, string> = {
  customer: "Customers",
  transaction: "Transactions",
  service: "Services",
  lead: "Leads",
  deal: "Deals",
  activity: "Activities",
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
