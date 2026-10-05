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
    id: "customer-hub",
    name: "Customer Hub",
    description: "Manage and understand your customers",
    category: "customers",
    requiredEntities: ["customers"],
    recommendedFor: ["service", "sales", "both"],
    defaultSize: "lg",
    visualization: "KPIs + searchable customer table",
    configFields: [
      {
        key: "activeDays",
        label: "Count a customer as active if seen within",
        type: "select",
        options: [
          { value: "30", label: "30 days" },
          { value: "60", label: "60 days" },
          { value: "90", label: "90 days" },
          { value: "180", label: "180 days" },
        ],
        default: "90",
      },
    ],
    actions: [
      { id: "view-customer", label: "View customer" },
      { id: "add-customer", label: "Add customer" },
    ],
    permissions: MANAGERS,
    consumes: ["service"],
    emits: ["customer"],
    emptyState: { title: "No customers yet", description: "Import your customer list or add your first customer to unlock Customer Hub." },
    href: "/customers",
  },
  {
    id: "revenue-intelligence",
    name: "Revenue Intelligence",
    description: "Understand your revenue",
    category: "finance",
    requiredEntities: ["transactions"],
    recommendedFor: ["service", "sales", "both"],
    defaultSize: "lg",
    visualization: "KPIs, revenue trend, revenue by service",
    configFields: [
      {
        key: "range",
        label: "Date range",
        type: "select",
        options: [
          { value: "90d", label: "Last 90 days" },
          { value: "6m", label: "Last 6 months" },
          { value: "12m", label: "Last 12 months" },
          { value: "ytd", label: "Year to date" },
          { value: "all", label: "All time" },
        ],
        default: "12m",
      },
      {
        key: "compare",
        label: "Comparison",
        type: "select",
        options: [
          { value: "previous_period", label: "Previous period" },
          { value: "previous_month", label: "Previous month" },
          { value: "previous_quarter", label: "Previous quarter" },
          { value: "previous_year", label: "Previous year" },
        ],
        default: "previous_year",
      },
    ],
    actions: [{ id: "change-range", label: "Change date range" }],
    permissions: MANAGERS,
    consumes: ["range", "service"],
    emits: ["service"],
    emptyState: { title: "No transaction data yet", description: "Import your existing sales data to unlock Revenue Intelligence." },
  },
  {
    id: "ai-analyst",
    name: "AI Business Analyst",
    description: "Ask questions about your business in plain language",
    category: "ai",
    requiredEntities: [],
    recommendedFor: ["service", "sales", "both"],
    defaultSize: "md",
    visualization: "Question box with suggested prompts",
    configFields: [],
    actions: [{ id: "ask", label: "Ask a question" }],
    permissions: MANAGERS,
    consumes: ["range", "service", "stage"],
    emits: [],
    emptyState: { title: "Nothing to analyze yet", description: "Import your business data and the analyst will answer from it." },
    href: "/ai",
  },
  {
    id: "repeat-customers",
    name: "Repeat Customers",
    description: "See who comes back — and who usually would by now",
    category: "customers",
    requiredEntities: ["transactions"],
    recommendedFor: ["service", "both"],
    defaultSize: "md",
    visualization: "Repeat rate, split, overdue regulars",
    configFields: [
      {
        key: "factor",
        label: "Flag a regular as overdue after",
        type: "select",
        options: [
          { value: "1.25", label: "1.25× their usual interval" },
          { value: "1.5", label: "1.5× their usual interval" },
          { value: "2", label: "2× their usual interval" },
        ],
        default: "1.5",
      },
    ],
    actions: [
      { id: "view-customer", label: "View customer" },
      { id: "create-task", label: "Create task" },
    ],
    permissions: MANAGERS,
    consumes: ["service"],
    emits: ["customer"],
    emptyState: { title: "No purchase history yet", description: "Import transactions to see repeat behaviour." },
  },
  {
    id: "customer-risk",
    name: "Customer Risk",
    description: "Find customers who need attention",
    category: "customers",
    requiredEntities: ["transactions"],
    recommendedFor: ["service", "both"],
    defaultSize: "md",
    visualization: "Ranked list of at-risk customers",
    configFields: [
      {
        key: "threshold",
        label: "Risk threshold (inactivity)",
        type: "select",
        options: [
          { value: "30", label: "30 days" },
          { value: "60", label: "60 days" },
          { value: "90", label: "90 days" },
        ],
        default: "60",
      },
      {
        key: "drop",
        label: "Revenue drop",
        type: "select",
        options: [
          { value: "20", label: "20% or more" },
          { value: "30", label: "30% or more" },
          { value: "50", label: "50% or more" },
        ],
        default: "30",
      },
    ],
    actions: [
      { id: "view-customer", label: "View customer" },
      { id: "create-task", label: "Create task" },
    ],
    permissions: MANAGERS,
    consumes: ["service"],
    emits: ["customer"],
    emptyState: { title: "No transaction data yet", description: "Import purchase history to detect customers at risk." },
  },
  {
    id: "activities",
    name: "Appointments & Activities",
    description: "A simple timeline of appointments, calls and visits",
    category: "operations",
    requiredEntities: [],
    recommendedFor: ["service", "both"],
    defaultSize: "md",
    visualization: "Chronological activity list",
    configFields: [
      {
        key: "show",
        label: "Show",
        type: "select",
        options: [
          { value: "upcoming", label: "Upcoming first" },
          { value: "recent", label: "Most recent first" },
        ],
        default: "recent",
      },
    ],
    actions: [
      { id: "add-activity", label: "Add activity" },
      { id: "edit-activity", label: "Edit activity" },
    ],
    permissions: MANAGERS,
    consumes: [],
    emits: ["customer"],
    emptyState: { title: "No activities yet", description: "Log appointments, calls and visits to build a timeline." },
    href: "/activities",
  },
  {
    id: "sales-pipeline",
    name: "Sales Pipeline",
    description: "Move deals from first contact to closed",
    category: "sales",
    requiredEntities: [],
    recommendedFor: ["sales", "both"],
    defaultSize: "lg",
    visualization: "Kanban by stage with totals",
    configFields: [],
    actions: [
      { id: "add-deal", label: "Add deal" },
      { id: "move-deal", label: "Move deal" },
    ],
    permissions: MANAGERS,
    consumes: ["stage"],
    emits: ["stage"],
    emptyState: { title: "No deals yet", description: "Create your first deal or import your pipeline." },
    href: "/deals",
  },
  {
    id: "deal-risk",
    name: "Deal Risk",
    description: "Spot deals that are stalling",
    category: "sales",
    requiredEntities: ["deals"],
    recommendedFor: ["sales", "both"],
    defaultSize: "md",
    visualization: "Ranked list of stalled deals",
    configFields: [
      {
        key: "idleDays",
        label: "Flag deals without activity for",
        type: "select",
        options: [
          { value: "7", label: "7 days" },
          { value: "14", label: "14 days" },
          { value: "30", label: "30 days" },
        ],
        default: "14",
      },
    ],
    actions: [
      { id: "view-deal", label: "View deal" },
      { id: "create-task", label: "Create task" },
    ],
    permissions: MANAGERS,
    consumes: ["stage"],
    emits: [],
    emptyState: { title: "No open deals", description: "Add deals to your pipeline to monitor risk." },
  },
  {
    id: "followup-radar",
    name: "Follow-up Radar",
    description: "Overdue follow-ups, quiet deals and leads waiting on you",
    category: "sales",
    requiredEntities: [],
    recommendedFor: ["sales", "both"],
    defaultSize: "md",
    visualization: "Three lists of things to follow up",
    configFields: [
      {
        key: "leadDays",
        label: "Leads need attention after",
        type: "select",
        options: [
          { value: "3", label: "3 days" },
          { value: "7", label: "7 days" },
          { value: "14", label: "14 days" },
        ],
        default: "7",
      },
    ],
    actions: [{ id: "create-task", label: "Create task" }],
    permissions: MANAGERS,
    consumes: ["stage"],
    emits: [],
    emptyState: { title: "Nothing to follow up", description: "Tasks, deals and leads that need attention will show up here." },
  },
  {
    id: "tasks",
    name: "Tasks",
    description: "Follow-ups your team needs to do — overdue first",
    category: "operations",
    requiredEntities: [],
    recommendedFor: ["service", "sales", "both"],
    defaultSize: "md",
    visualization: "Checklist of open and overdue tasks",
    configFields: [
      {
        key: "scope",
        label: "Show",
        type: "select",
        options: [
          { value: "all", label: "All open tasks" },
          { value: "mine", label: "Assigned to me" },
        ],
        default: "all",
      },
    ],
    actions: [
      { id: "add-task", label: "Add task" },
      { id: "complete-task", label: "Complete task" },
    ],
    permissions: MANAGERS,
    consumes: [],
    emits: ["customer"],
    emptyState: { title: "No open tasks", description: "Tasks you create from other Components show up here." },
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

export const ENTITY_SINGULAR: Record<EntityName, string> = {
  customers: "customer",
  transactions: "transaction",
  services: "service",
  leads: "lead",
  deals: "deal",
  activities: "activity",
  tasks: "task",
};

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
        ? `Needs ${missing.map((m) => ENTITY_SINGULAR[m]).join(" and ")} data`
        : usesData
          ? `Uses your ${definition.requiredEntities.join(" and ")}`
          : fitsType
            ? "A good fit for your business"
            : "Available";
      return { definition, score, reason, ready };
    })
    .sort((a, b) => b.score - a.score);
}

/** Recommended = fits the business type and has the data it needs. */
export function topRecommendations(businessType: BusinessType, counts: DataCounts, installed: Set<string>) {
  return recommend(businessType, counts, installed).filter((r) => r.ready && r.score >= 85);
}
