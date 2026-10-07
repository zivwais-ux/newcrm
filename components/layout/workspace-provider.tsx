"use client";

import { createContext, useContext } from "react";
import type { BusinessType, Member, MemberRole, StageDef } from "@/types/domain";
import type { MessageTemplate } from "@/lib/whatsapp";
import { DEFAULT_TERMS, type Terms } from "@/lib/terms";
import { DEFAULT_STAGES, stageLabel } from "@/lib/stages";
import type { FieldDef, FieldEntity } from "@/lib/fields";
import type { NotificationRow } from "@/lib/actions/automations";

export interface WorkspaceContextValue {
  org: { id: string; name: string; business_type: BusinessType; currency: string };
  user: { id: string; name: string; email: string };
  role: MemberRole;
  members: Member[];
  /** WhatsApp message templates (the business's own, or the built-in defaults). */
  templates?: MessageTemplate[];
  /** The business's own words for customers, appointments, services… */
  terms?: Terms;
  /** The business's own deal stages, in order. */
  stages?: StageDef[];
  /** Fields the business defined itself, all entities. */
  fields?: FieldDef[];
  /** Messages flows prepared that still wait to be sent. */
  pendingOutbox?: number;
  /** Newest notifications (bell), loaded with the page. */
  notifications?: NotificationRow[];
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ value, children }: { value: WorkspaceContextValue; children: React.ReactNode }) {
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}

export function useCanManage() {
  const { role } = useWorkspace();
  return role === "owner" || role === "admin";
}

export function useMoney() {
  const { org } = useWorkspace();
  return org.currency;
}

/** The business's own words ("מטופל", "טיפול"…). Never hardcode these nouns in UI copy. */
export function useTerms(): Terms {
  return useContext(WorkspaceContext)?.terms ?? DEFAULT_TERMS;
}

export function useStages(): StageDef[] {
  return useContext(WorkspaceContext)?.stages ?? DEFAULT_STAGES;
}

/** Label for a stage key in this business's words. */
export function useStageLabel() {
  const stages = useStages();
  return (key: string | null | undefined) => stageLabel(key, stages);
}

const NO_FIELDS: FieldDef[] = [];
/** The business's own fields for one kind of record, in order. */
export function useFields(entity: FieldEntity): FieldDef[] {
  const all = useContext(WorkspaceContext)?.fields ?? NO_FIELDS;
  return all.filter((f) => f.entity === entity);
}
