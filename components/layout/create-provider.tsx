"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { QuickAppointmentDialog, QuickSaleDialog, type CustomerPrefill } from "@/components/business/quick-entry";
import { RecordFormDialog } from "@/components/business/record-form";
import type { RecordEntity } from "@/lib/actions/records";

/** Everything that can be created from the dock "+", the command bar or a shortcut. */
export type CreateRequest =
  | { kind: "sale"; customer?: CustomerPrefill; amount?: number | null; service?: string | null }
  | { kind: "appointment"; customer?: CustomerPrefill; date?: string | null; time?: string | null; service?: string | null }
  | { kind: "record"; entity: RecordEntity; initial?: Record<string, string | number | null | undefined>; labels?: { customer_id?: string | null } };

const CreateContext = createContext<((req: CreateRequest) => void) | null>(null);

/** One place that owns the creation dialogs, so any surface can open them with a prefill. */
export function CreateProvider({ children }: { children: React.ReactNode }) {
  const [req, setReq] = useState<(CreateRequest & { key: number }) | null>(null);
  const open = useCallback((r: CreateRequest) => setReq({ ...r, key: Date.now() }), []);
  const close = (o: boolean) => !o && setReq(null);
  const value = useMemo(() => open, [open]);

  return (
    <CreateContext.Provider value={value}>
      {children}
      {req?.kind === "sale" && (
        <QuickSaleDialog key={req.key} open onOpenChange={close} customer={req.customer} amount={req.amount} service={req.service} />
      )}
      {req?.kind === "appointment" && (
        <QuickAppointmentDialog key={req.key} open onOpenChange={close} customer={req.customer} date={req.date} time={req.time} service={req.service} />
      )}
      {req?.kind === "record" && (
        <RecordFormDialog key={req.key} entity={req.entity} open onOpenChange={close} initial={req.initial} labels={req.labels} />
      )}
    </CreateContext.Provider>
  );
}

export function useCreate() {
  const ctx = useContext(CreateContext);
  if (!ctx) throw new Error("useCreate must be used inside CreateProvider");
  return ctx;
}
