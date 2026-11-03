import type { AgentKey } from "./validate";

/** Every agent block has a person behind it: a first name, a role, and how to say it's working. */
export type PersonaKey = AgentKey | "brain";

export interface Persona {
  /** First name, shown everywhere the agent speaks. */
  name: string;
  /** Full role, shown next to the name ("נועה · אנליסטית הכנסות"). */
  role: string;
  /** Short area, used in the module name on the table ("נועה · הכנסות"). */
  area: string;
  /** "עובדת" / "עובד" — Hebrew verbs follow the name's gender. */
  working: string;
  /** "היא" / "הוא". */
  pronoun: string;
  /** "רצה" / "רץ" (ran). */
  ran: string;
  /** "מצאה" / "מצא" (found). */
  found: string;
}

export const PERSONAS: Record<PersonaKey, Persona> = {
  revenue: { name: "נועה", role: "אנליסטית הכנסות", area: "הכנסות", working: "עובדת", pronoun: "היא", ran: "רצה", found: "מצאה" },
  customers: { name: "אורי", role: "שומר הלקוחות", area: "לקוחות", working: "עובד", pronoun: "הוא", ran: "רץ", found: "מצא" },
  sales: { name: "תום", role: "מאמן המכירות", area: "מכירות", working: "עובד", pronoun: "הוא", ran: "רץ", found: "מצא" },
  chief: { name: "שירה", role: "ראש המטה", area: "ראש המטה", working: "עובדת", pronoun: "היא", ran: "רצה", found: "מצאה" },
  brain: { name: "נובה", role: "המוח של העסק", area: "המוח של העסק", working: "חושבת", pronoun: "היא", ran: "רצה", found: "מצאה" },
};

/** "נועה · אנליסטית הכנסות" */
export function personaTitle(key: PersonaKey) {
  const p = PERSONAS[key];
  return `${p.name} · ${p.role}`;
}

/** Module name on the table and in the library: "נועה · הכנסות". */
export function personaModuleName(key: PersonaKey) {
  const p = PERSONAS[key];
  return `${p.name} · ${p.area}`;
}
