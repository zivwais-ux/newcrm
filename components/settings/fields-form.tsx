"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CircleNotch, DotsSixVertical, Plus, Trash, X } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTerms } from "@/components/layout/workspace-provider";
import { saveFields } from "@/lib/actions/fields";
import { FIELD_TYPES, FIELD_TYPE_LABELS, VALUE_ENTITIES, type FieldDef, type FieldEntity, type FieldType } from "@/lib/fields";
import type { Terms } from "@/lib/terms";
import { cn } from "@/lib/utils";

interface Row {
  /** Stable list id (the field key, or a temporary id for a new field). */
  id: string;
  /** Saved key, or null for a field that isn't saved yet. */
  key: string | null;
  label: string;
  type: FieldType;
  options: string[];
  show_in_list: boolean;
}

const MAX_FIELDS = 40;
/** Entities whose lists can show extra columns today. */
const LIST_ENTITIES: FieldEntity[] = ["customers", "transactions"];
const hasOptions = (t: FieldType) => t === "select" || t === "multiselect";

function entityLabel(entity: FieldEntity, t: Terms) {
  switch (entity) {
    case "customers":
      return t.customers;
    case "transactions":
      return t.sales;
    case "deals":
      return t.deals;
    case "activities":
      return t.appointments;
    case "leads":
      return "פניות";
    case "tasks":
      return "משימות";
  }
}

const toRows = (defs: FieldDef[], entity: FieldEntity): Row[] =>
  defs
    .filter((d) => d.entity === entity)
    .sort((a, b) => a.position - b.position)
    .map((d) => ({ id: d.key, key: d.key, label: d.label, type: d.type, options: [...(d.options ?? [])], show_in_list: d.show_in_list }));

const signature = (rows: Row[]) => JSON.stringify(rows.map((r) => [r.key, r.label.trim(), r.type, hasOptions(r.type) ? r.options : [], r.show_in_list]));

/** "השדות שלי": fields the business adds to its records — name, type, options, list column, order. */
export function FieldsForm({ initial, canManage }: { initial: FieldDef[]; canManage: boolean }) {
  const router = useRouter();
  const terms = useTerms();
  const [entity, setEntity] = useState<FieldEntity>("customers");
  const [saved, setSaved] = useState(() => Object.fromEntries(VALUE_ENTITIES.map((e) => [e, toRows(initial, e)])) as Record<FieldEntity, Row[]>);
  const [draft, setDraft] = useState(saved);
  const [pending, start] = useTransition();
  const nextId = useRef(0);
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const rows = draft[entity] ?? [];
  const isDirty = (e: FieldEntity) => signature(draft[e] ?? []) !== signature(saved[e] ?? []);
  const dirty = isDirty(entity);
  const showListToggle = LIST_ENTITIES.includes(entity);

  const setRows = (fn: (list: Row[]) => Row[]) => setDraft((d) => ({ ...d, [entity]: fn(d[entity] ?? []) }));
  const update = (id: string, patch: Partial<Row>) => setRows((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  function add() {
    const id = `new-${nextId.current++}`;
    setRows((list) => [...list, { id, key: null, label: "", type: "text", options: [], show_in_list: false }]);
    requestAnimationFrame(() => document.getElementById(`field-${id}`)?.focus());
  }

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    setRows((list) => {
      const from = list.findIndex((r) => r.id === e.active.id);
      const to = list.findIndex((r) => r.id === e.over!.id);
      return from < 0 || to < 0 ? list : arrayMove(list, from, to);
    });
  }

  function save() {
    const target = entity;
    const list = draft[target] ?? [];
    if (list.some((r) => !r.label.trim())) return void toast.error("לכל שדה צריך שם");
    const missing = list.find((r) => hasOptions(r.type) && !r.options.length);
    if (missing) return void toast.error(`ל"${missing.label.trim()}" צריך לפחות אפשרות אחת`);
    start(async () => {
      const res = await saveFields({
        entity: target,
        fields: list.map((r) => ({
          key: r.key,
          label: r.label.trim(),
          type: r.type,
          options: hasOptions(r.type) ? r.options : [],
          show_in_list: r.show_in_list,
        })),
      });
      if (!res.ok) return void toast.error(res.error);
      // New fields get their keys from the server, in the same order.
      const next = list.map((r, i) => ({ ...r, id: res.data.keys[i] ?? r.id, key: res.data.keys[i] ?? r.key, label: r.label.trim() }));
      setSaved((s) => ({ ...s, [target]: next }));
      setDraft((d) => ({ ...d, [target]: next }));
      toast.success("השדות נשמרו");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 border border-border bg-muted/50 p-1 text-[13px]" role="tablist" aria-label="סוג הרשומה">
        {VALUE_ENTITIES.map((e) => {
          const active = e === entity;
          return (
            <button
              key={e}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setEntity(e)}
              className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 rounded-sm px-3 py-1.5 font-medium transition-colors active:translate-y-px",
                active ? "bg-module text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {entityLabel(e, terms)}
              {(draft[e]?.length ?? 0) > 0 && <span className="num text-[11px] text-muted-foreground">{draft[e].length}</span>}
              {isDirty(e) && <span className="size-1.5 rounded-full bg-brand" aria-label="יש שינויים שלא נשמרו" />}
            </button>
          );
        })}
      </div>

      {rows.length ? (
        <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            <ol className="divide-y divide-border border-y border-border">
              {rows.map((r, i) => (
                <FieldRow
                  key={r.id}
                  row={r}
                  index={i}
                  canManage={canManage}
                  showListToggle={showListToggle}
                  onChange={(patch) => update(r.id, patch)}
                  onRemove={() => setRows((list) => list.filter((x) => x.id !== r.id))}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="border border-dashed border-border px-4 py-6 text-center">
          <p className="text-sm font-medium">עוד אין שדות משלך ל{entityLabel(entity, terms)}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">למשל יום הולדת, מספר רכב או איך הגיע אליך. השדות יופיעו בטופס ובכרטיס.</p>
        </div>
      )}

      {canManage ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={add} disabled={rows.length >= MAX_FIELDS}>
            <Plus />
            הוסף שדה
          </Button>
          <div className="flex items-center gap-2">
            {dirty && (
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => setDraft((d) => ({ ...d, [entity]: saved[entity] }))}>
                בטל שינויים
              </Button>
            )}
            <Button size="sm" onClick={save} disabled={pending || !dirty}>
              {pending && <CircleNotch className="animate-spin" />}
              שמור שדות
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">רק בעלים ומנהלים יכולים לשנות את השדות.</p>
      )}
      {canManage && rows.length > 0 && (
        <p className="text-xs leading-relaxed text-muted-foreground">שדה שהוסר נעלם מהטפסים, אבל הערכים שכבר נשמרו בו לא נמחקים.</p>
      )}
    </div>
  );
}

function FieldRow({
  row,
  index,
  canManage,
  showListToggle,
  onChange,
  onRemove,
}: {
  row: Row;
  index: number;
  canManage: boolean;
  showListToggle: boolean;
  onChange: (patch: Partial<Row>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: row.id, disabled: !canManage });
  const name = row.label.trim() || "שדה חדש";
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative space-y-2 bg-module py-2.5", isDragging && "z-10 shadow-md")}
    >
      <div className="flex flex-wrap items-center gap-2">
        {canManage && (
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`גרור כדי לשנות את המקום של "${name}"`}
            className="grid size-7 shrink-0 cursor-grab place-items-center text-muted-foreground hover:text-foreground active:cursor-grabbing"
          >
            <DotsSixVertical className="size-4" />
          </button>
        )}
        <span className="num w-5 shrink-0 text-[11px] text-muted-foreground" aria-hidden>
          {String(index + 1).padStart(2, "0")}
        </span>
        <Input
          id={`field-${row.id}`}
          dir="auto"
          value={row.label}
          maxLength={60}
          disabled={!canManage}
          placeholder="שם השדה"
          aria-label={`שם השדה ${index + 1}`}
          aria-invalid={!row.label.trim() || undefined}
          onChange={(e) => onChange({ label: e.target.value })}
          className="h-8 min-w-32 flex-1 text-[13px]"
        />
        <Select value={row.type} onValueChange={(v) => onChange({ type: v as FieldType })} disabled={!canManage}>
          <SelectTrigger size="sm" className="w-32" aria-label={`סוג השדה "${name}"`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FIELD_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {FIELD_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {showListToggle && (
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <Checkbox checked={row.show_in_list} disabled={!canManage} onCheckedChange={(v) => onChange({ show_in_list: v === true })} />
            הצג בטבלה
          </label>
        )}
        {!row.key && <Badge variant="brand">חדש</Badge>}
        {canManage && (
          <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`הסר את השדה "${name}"`}>
            <Trash className="text-muted-foreground" />
          </Button>
        )}
      </div>
      {hasOptions(row.type) && <OptionsEditor options={row.options} canManage={canManage} fieldName={name} onChange={(options) => onChange({ options })} />}
    </li>
  );
}

function OptionsEditor({ options, canManage, fieldName, onChange }: { options: string[]; canManage: boolean; fieldName: string; onChange: (o: string[]) => void }) {
  const [text, setText] = useState("");
  function add() {
    const v = text.trim().slice(0, 100);
    if (!v) return;
    if (!options.includes(v) && options.length < 50) onChange([...options, v]);
    setText("");
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 ps-14">
      {options.map((o) => (
        <span key={o} className="inline-flex h-7 items-center gap-1 rounded-sm border border-border bg-muted/40 ps-2 pe-1 text-xs">
          <span dir="auto">{o}</span>
          {canManage && (
            <button
              type="button"
              onClick={() => onChange(options.filter((x) => x !== o))}
              aria-label={`הסר את האפשרות "${o}"`}
              className="grid size-5 cursor-pointer place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          )}
        </span>
      ))}
      {canManage && (
        <Input
          dir="auto"
          value={text}
          maxLength={100}
          placeholder={options.length ? "עוד אפשרות" : "הוסף אפשרות ולחץ Enter"}
          aria-label={`אפשרות חדשה לשדה "${fieldName}"`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            }
          }}
          onBlur={add}
          className="h-7 w-40 text-xs"
        />
      )}
      {!options.length && !canManage && <span className="text-xs text-muted-foreground">אין אפשרויות</span>}
    </div>
  );
}
