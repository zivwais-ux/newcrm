"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, CircleNotch, Receipt, UserPlus, X } from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EntityPicker } from "./entity-picker";
import { useMoney, useTerms } from "@/components/layout/workspace-provider";
import { getServiceChips, quickAppointment, quickSale, type ServiceChip } from "@/lib/actions/quick";
import { israelNow, israelToday } from "@/lib/analytics/dates";
import { cn, formatCurrency } from "@/lib/utils";
import { Ltr } from "@/components/ui/ltr";

type CustomerValue = { id: string | null; label: string | null; name: string; phone: string };
const EMPTY_CUSTOMER: CustomerValue = { id: null, label: null, name: "", phone: "" };

/** Pick an existing customer, or switch to typing a new one (name + phone). */
function CustomerField({
  value,
  onChange,
  optional,
}: {
  value: CustomerValue;
  onChange: (v: CustomerValue) => void;
  optional?: boolean;
}) {
  // A name without an id (e.g. from the command bar) starts in "new customer" mode.
  const [isNew, setIsNew] = useState(!value.id && !!value.name);
  const t = useTerms();
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>
          {t.customer}
          {optional && <span className="font-normal text-muted-foreground"> (לא חובה)</span>}
        </Label>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline cursor-pointer"
          onClick={() => {
            setIsNew(!isNew);
            onChange(EMPTY_CUSTOMER);
          }}
        >
          {isNew ? <X className="size-3.5" /> : <UserPlus className="size-3.5" />}
          {isNew ? "בחר מהרשימה" : `הוספת ${t.customer}`}
        </button>
      </div>
      {isNew ? (
        <div className="grid grid-cols-2 gap-2">
          <Input dir="auto" placeholder="שם" autoFocus value={value.name} onChange={(e) => onChange({ ...value, id: null, name: e.target.value })} />
          <Input dir="ltr" type="tel" inputMode="tel" className="text-end" placeholder="טלפון" value={value.phone} onChange={(e) => onChange({ ...value, id: null, phone: e.target.value })} />
        </div>
      ) : (
        <EntityPicker
          kind="customer"
          allowCreate={false}
          value={value.id}
          initialLabel={value.label}
          placeholder={optional ? "חיפוש לפי שם או טלפון — או השאר ריק" : "חיפוש לפי שם או טלפון"}
          onChange={(id, label) => onChange({ ...EMPTY_CUSTOMER, id, label })}
        />
      )}
    </div>
  );
}

function ServiceChips({
  chips,
  value,
  onPick,
}: {
  chips: ServiceChip[] | null;
  value: string;
  onPick: (chip: ServiceChip | null, name: string) => void;
}) {
  const currency = useMoney();
  const t = useTerms();
  const [other, setOther] = useState(false);
  const inList = chips?.some((c) => c.name === value);
  return (
    <div className="space-y-1.5">
      <Label>{t.service === "שירות" ? "שירות או מוצר" : t.service}</Label>
      {chips === null ? (
        <div className="flex h-8 items-center gap-1.5 text-xs text-muted-foreground">
          <CircleNotch className="size-3.5 animate-spin" /> טוען…
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <button
              key={c.name}
              type="button"
              aria-pressed={value === c.name}
              onClick={() => {
                setOther(false);
                onPick(value === c.name ? null : c, value === c.name ? "" : c.name);
              }}
              className={cn(
                "rounded-sm border px-2.5 py-1 text-[13px] transition-colors cursor-pointer",
                value === c.name ? "border-brand bg-brand text-white" : "bg-surface hover:border-brand/40",
              )}
            >
              <span dir="auto">{c.name}</span>
              {c.price != null && (
                <span className={cn("ms-1.5 text-xs", value === c.name ? "text-white/80" : "text-muted-foreground")}>
                  <Ltr>{formatCurrency(c.price, currency)}</Ltr>
                </span>
              )}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={other || (!!value && !inList)}
            onClick={() => {
              setOther(true);
              if (inList) onPick(null, "");
            }}
            className={cn(
              "rounded-sm border border-dashed px-2.5 py-1 text-[13px] cursor-pointer",
              other || (value && !inList) ? "border-brand text-brand" : "text-muted-foreground hover:border-brand/40",
            )}
          >
            {chips.length ? "אחר…" : `+ כתוב ${t.service}`}
          </button>
        </div>
      )}
      {(other || (!!value && !inList && chips !== null)) && (
        <Input dir="auto" autoFocus placeholder="למשל: תספורת, שיעור פרטי, תיקון" value={value} onChange={(e) => onPick(null, e.target.value)} />
      )}
    </div>
  );
}

function useServiceChips(open: boolean) {
  const [chips, setChips] = useState<ServiceChip[] | null>(null);
  useEffect(() => {
    if (!open || chips) return;
    getServiceChips()
      .then(setChips)
      .catch(() => setChips([]));
  }, [open, chips]);
  return chips;
}

/** A customer to prefill: an existing one (id) or a new name typed elsewhere (id null). */
export type CustomerPrefill = { id: string | null; name: string };
const fromPrefill = (c?: CustomerPrefill): CustomerValue =>
  !c ? EMPTY_CUSTOMER : c.id ? { ...EMPTY_CUSTOMER, id: c.id, label: c.name } : { ...EMPTY_CUSTOMER, name: c.name };

const customerPayload = (c: CustomerValue) =>
  c.id || c.name.trim() ? { id: c.id, name: c.name.trim(), phone: c.phone.trim() } : null;

export function QuickSaleDialog({
  open,
  onOpenChange,
  customer,
  amount: initialAmount,
  service: initialService,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prefill from a customer's page or the command bar. */
  customer?: CustomerPrefill;
  amount?: number | null;
  service?: string | null;
}) {
  const router = useRouter();
  const currency = useMoney();
  const t = useTerms();
  const chips = useServiceChips(open);
  const [cust, setCust] = useState<CustomerValue>(() => fromPrefill(customer));
  const [amount, setAmount] = useState(initialAmount ? String(initialAmount) : "");
  const [service, setService] = useState(initialService ?? "");
  const [date, setDate] = useState(() => israelToday());
  const [paid, setPaid] = useState(true);
  const [more, setMore] = useState(false);
  const [notes, setNotes] = useState("");
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await quickSale({
        customer: customerPayload(cust),
        amount: amount as unknown as number,
        service,
        date,
        status: paid ? "paid" : "pending",
        notes,
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success(`נרשם: ${t.sale} של ${formatCurrency(Number(amount), currency)}${res.data.customerCreated ? ` · נוצר כרטיס ${t.customer}` : ""}`);
      onOpenChange(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="size-4 text-brand" />
            רישום {t.sale}
          </DialogTitle>
          <DialogDescription>מי קנה, כמה ומה. כל השאר כבר ממולא.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <CustomerField value={cust} onChange={setCust} optional />
          <div className="space-y-1.5">
            <Label htmlFor="qs-amount">סכום *</Label>
            <Input
              id="qs-amount"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              dir="ltr"
              required
              className="h-11 text-end text-lg font-semibold tabular"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <ServiceChips
            chips={chips}
            value={service}
            onPick={(chip, name) => {
              setService(name);
              if (chip?.price != null && !amount) setAmount(String(chip.price));
            }}
          />
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <div className="inline-flex rounded-sm border p-0.5" role="radiogroup" aria-label="סטטוס תשלום">
              {[
                [true, "שולם"],
                [false, "ממתין לתשלום"],
              ].map(([v, l]) => (
                <button
                  key={String(v)}
                  type="button"
                  role="radio"
                  aria-checked={paid === v}
                  onClick={() => setPaid(v as boolean)}
                  className={cn("rounded-sm px-2.5 py-1 font-medium cursor-pointer", paid === v ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
                >
                  {l as string}
                </button>
              ))}
            </div>
            <Input type="date" dir="ltr" aria-label="תאריך" className="h-8 w-auto text-end" value={date} max={israelToday()} onChange={(e) => setDate(e.target.value)} required />
            {!more && (
              <button type="button" className="text-xs font-semibold text-brand hover:underline cursor-pointer" onClick={() => setMore(true)}>
                + הערה
              </button>
            )}
          </div>
          {more && <Textarea dir="auto" rows={2} placeholder="הערה (לא חובה)" value={notes} onChange={(e) => setNotes(e.target.value)} />}
          <DialogFooter className="pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              ביטול
            </Button>
            <Button type="submit" variant="brand" disabled={pending || !amount}>
              {pending && <CircleNotch className="animate-spin" />}
              שמור {t.sale}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function nextRoundHour() {
  const n = israelNow();
  const h = Math.min(n.getHours() + 1, 23);
  return `${String(h).padStart(2, "0")}:00`;
}

export function QuickAppointmentDialog({
  open,
  onOpenChange,
  customer,
  date: initialDate,
  time: initialTime,
  service: initialService,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer?: CustomerPrefill;
  date?: string | null;
  time?: string | null;
  service?: string | null;
}) {
  const router = useRouter();
  const t = useTerms();
  const chips = useServiceChips(open);
  const [cust, setCust] = useState<CustomerValue>(() => fromPrefill(customer));
  const [date, setDate] = useState(() => initialDate ?? israelToday());
  const [time, setTime] = useState(() => initialTime ?? nextRoundHour());
  const [service, setService] = useState(initialService ?? "");
  const [notes, setNotes] = useState("");
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = customerPayload(cust);
    if (!payload) return void toast.error(`בחר ${t.customer} מהרשימה או כתוב שם`);
    const at = new Date(`${date}T${time}`);
    if (Number.isNaN(at.getTime())) return void toast.error("בחר תאריך ושעה");
    start(async () => {
      const res = await quickAppointment({ customer: payload, at: at.toISOString(), service, notes });
      if (!res.ok) return void toast.error(res.error);
      toast.success(`נשמר ביומן${res.data.customerCreated ? ` · נוצר כרטיס ${t.customer}` : ""}`);
      onOpenChange(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="size-4 text-brand" />
            קביעת {t.appointment}
          </DialogTitle>
          <DialogDescription>מי, מתי ומה. הכל נשמר ביומן ובכרטיס ה{t.customer}.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <CustomerField value={cust} onChange={setCust} />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="qa-date">תאריך</Label>
              <Input id="qa-date" type="date" dir="ltr" className="text-end" required value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qa-time">שעה</Label>
              <Input id="qa-time" type="time" dir="ltr" step={300} className="text-end" required value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <ServiceChips chips={chips} value={service} onPick={(_, name) => setService(name)} />
          <Textarea dir="auto" rows={2} placeholder="הערה (לא חובה)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <DialogFooter className="pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              ביטול
            </Button>
            <Button type="submit" variant="brand" disabled={pending}>
              {pending && <CircleNotch className="animate-spin" />}
              קבע {t.appointment}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
