"use client";

import { createContext, useContext } from "react";
import type { BusinessType, Member, MemberRole } from "@/types/domain";
import type { MessageTemplate } from "@/lib/whatsapp";

export interface WorkspaceContextValue {
  org: { id: string; name: string; business_type: BusinessType; currency: string };
  user: { id: string; name: string; email: string };
  role: MemberRole;
  members: Member[];
  /** WhatsApp message templates (the business's own, or the built-in defaults). */
  templates?: MessageTemplate[];
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
