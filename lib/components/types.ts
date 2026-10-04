import type { BusinessType, EntityName, MemberRole } from "@/types/domain";

export type ComponentCategory = "customers" | "sales" | "finance" | "operations" | "ai";
export type ComponentSize = "sm" | "md" | "lg";

export const CATEGORY_LABELS: Record<ComponentCategory, string> = {
  customers: "Customers",
  sales: "Sales",
  finance: "Finance",
  operations: "Operations",
  ai: "AI",
};

export const SIZE_LABELS: Record<ComponentSize, string> = { sm: "Small", md: "Medium", lg: "Wide" };

export interface ConfigField {
  key: string;
  label: string;
  type: "select";
  options: { value: string; label: string }[];
  default: string;
  description?: string;
}

export interface ComponentAction {
  id: string;
  label: string;
}

/**
 * A Component is a modular business capability, not a dashboard card. Its metadata
 * lives here; its server loader and client view are registered by id in
 * lib/components/loaders.ts and components/components-system/views.tsx.
 */
export interface ComponentDefinition {
  id: string;
  name: string;
  description: string;
  category: ComponentCategory;
  /** Canonical entities the Component reads. At least one row of each is required. */
  requiredEntities: EntityName[];
  /** Business types this Component is recommended for. Never used to hide it. */
  recommendedFor: BusinessType[];
  defaultSize: ComponentSize;
  visualization: string;
  configFields: ConfigField[];
  actions: ComponentAction[];
  /** Who may add, configure or remove the Component. */
  permissions: { manage: MemberRole[] };
  emptyState: { title: string; description: string };
  /** Optional standalone page for the full experience. */
  href?: string;
}

export type ComponentConfig = Record<string, string> & { size?: ComponentSize };
