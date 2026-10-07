"use client";

import Link from "next/link";
import { useRef } from "react";
import { BellRinging, CheckSquare, NotePencil, PencilSimpleLine, Plus, WhatsappLogo } from "@phosphor-icons/react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useFields, useStages, useTerms } from "@/components/layout/workspace-provider";
import { describeAction, describeCondition, describeTrigger } from "@/lib/automations/describe";
import type { Action, Condition, Subject, Trigger } from "@/lib/automations/schema";
import { cn } from "@/lib/utils";
import { Tokenized, fillEmpty } from "./flow-sentence";
import { ChoiceChip, DaysWords, Segmented, Sentence, Stepper, Word } from "./chips";
import {
  ACTION_TYPES,
  ANCHOR_OPTIONS,
  CUSTOMER_STATUS_OPTIONS,
  ENTITY_OPTIONS,
  LEAD_STATUS_OPTIONS,
  OP_LABELS,
  TRIGGER_TYPES,
  VALUELESS_OPS,
  changeActionType,
  conditionFields,
  conditionFor,
  defaultTrigger,
  opsFor,
  placeholderChips,
  setValueTargets,
  statusOptions,
  useDescribeContext,
  type Option,
} from "./flow-vocab";

// The editors inside the side panel: each part of the flow as a sentence you complete by tapping chips.

/** How the part reads right now — the same words the list and the canvas show. */
function ReadsAs({ text }: { text: string }) {
  return (
    <div className="border-s-2 border-brand bg-rail px-3.5 py-2.5 text-[13.5px] leading-relaxed text-foreground">
      <span className="text-muted-foreground">כך זה נקרא: </span>
      <Tokenized text={fillEmpty(text)} />
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] leading-relaxed text-muted-foreground">{children}</p>;
}

// ---------------------------------------------------------------------------
// כאשר

export function TriggerEditor({ trigger, onChange, readOnly }: { trigger: Trigger; onChange: (t: Trigger) => void; readOnly?: boolean }) {
  const terms = useTerms();
  const stages = useStages();
  const ctx = useDescribeContext();
  const dateFields = useFields("customers").filter((f) => f.type === "date");

  return (
    <div className="space-y-6">
      <Sentence>
        <Word>כאשר</Word>
        <ChoiceChip
          label="מה קורה"
          value={trigger.type}
          options={TRIGGER_TYPES(terms)}
          onChange={(v) => v !== trigger.type && onChange(defaultTrigger(v as Trigger["type"], stages, dateFields))}
          disabled={readOnly}
        />
      </Sentence>

      <div className="space-y-3">
        {trigger.type === "record_created" && (
          <Sentence>
            <Word>מה נוסף?</Word>
            <ChoiceChip
              label="מה נוסף"
              value={trigger.entity}
              options={ENTITY_OPTIONS(terms)}
              onChange={(v) => onChange({ ...trigger, entity: v as Subject })}
              disabled={readOnly}
            />
          </Sentence>
        )}

        {trigger.type === "deal_stage" && (
          <Sentence>
            <Word>{terms.deal} עוברת לשלב</Word>
            <ChoiceChip
              label="איזה שלב"
              value={trigger.stage}
              options={stages.map((s) => ({ value: s.key, label: s.label }))}
              onChange={(v) => onChange({ ...trigger, stage: v })}
              disabled={readOnly}
            />
          </Sentence>
        )}

        {trigger.type === "status_changed" && (
          <Sentence>
            <Word>הסטטוס של</Word>
            <ChoiceChip
              label="של מה"
              value={trigger.entity}
              options={ENTITY_OPTIONS(terms, ["leads", "transactions"])}
              onChange={(v) => {
                const entity = v as "leads" | "transactions";
                onChange({ ...trigger, entity, status: statusOptions(entity)[0].value });
              }}
              disabled={readOnly}
            />
            <Word>משתנה ל</Word>
            <ChoiceChip
              label="לאיזה סטטוס"
              value={trigger.status}
              options={statusOptions(trigger.entity)}
              onChange={(v) => onChange({ ...trigger, status: v })}
              disabled={readOnly}
            />
          </Sentence>
        )}

        {trigger.type === "days_from_date" && (
          <>
            <Sentence>
              <Stepper
                label="כמה ימים"
                value={trigger.days}
                onChange={(days) => onChange({ ...trigger, days })}
                render={(n) => <DaysWords n={n} zero="ביום עצמו" />}
                disabled={readOnly}
              />
              {trigger.days > 0 && (
                <Segmented
                  label="לפני או אחרי"
                  value={trigger.before ? "before" : "after"}
                  options={[
                    { value: "before", label: "לפני" },
                    { value: "after", label: "אחרי" },
                  ]}
                  onChange={(v) => onChange({ ...trigger, before: v === "before" })}
                  disabled={readOnly}
                />
              )}
              {trigger.days === 0 && <Word>של</Word>}
              <ChoiceChip
                label="איזה תאריך"
                value={trigger.anchor}
                options={ANCHOR_OPTIONS(terms)}
                onChange={(v) =>
                  onChange({
                    ...trigger,
                    anchor: v as "last_purchase" | "appointment" | "custom_date",
                    field: v === "custom_date" ? dateFields[0]?.key : undefined,
                    before: v === "last_purchase" ? false : trigger.before,
                  })
                }
                disabled={readOnly}
              />
              {trigger.anchor === "custom_date" && dateFields.length > 0 && (
                <ChoiceChip
                  label="איזה שדה"
                  value={trigger.field}
                  options={dateFields.map((f) => ({ value: f.key, label: f.label }))}
                  onChange={(v) => onChange({ ...trigger, field: v })}
                  placeholder="בחר שדה"
                  disabled={readOnly}
                />
              )}
            </Sentence>
            {trigger.anchor === "custom_date" && dateFields.length === 0 && (
              <div className="border border-dashed border-border-strong bg-rail px-3.5 py-3 text-[13px] leading-relaxed">
                עוד אין ל{terms.customers} שדה תאריך (כמו יום הולדת).{" "}
                <Link href="/settings" className="font-medium text-brand underline-offset-4 hover:underline">
                  הוסף שדה בהגדרות
                </Link>
              </div>
            )}
            <Hint>הזרימה בודקת פעם ביום על מי זה חל היום.</Hint>
          </>
        )}

        {trigger.type === "no_activity" && (
          <>
            <Sentence>
              <Word>אצל</Word>
              <ChoiceChip
                label="אצל מי"
                value={trigger.entity}
                options={ENTITY_OPTIONS(terms, ["customers", "deals"])}
                onChange={(v) => onChange({ ...trigger, entity: v as "customers" | "deals" })}
                disabled={readOnly}
              />
              <Word>במשך</Word>
              <Stepper label="כמה ימים" value={trigger.days} min={1} onChange={(days) => onChange({ ...trigger, days })} render={(n) => <DaysWords n={n} />} disabled={readOnly} />
            </Sentence>
            <Hint>הזרימה בודקת פעם ביום.</Hint>
          </>
        )}
      </div>

      <ReadsAs text={describeTrigger(trigger, ctx)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ואם

export function ConditionEditor({
  condition,
  subject,
  onChange,
  readOnly,
}: {
  condition: Condition;
  subject: Subject;
  onChange: (c: Condition) => void;
  readOnly?: boolean;
}) {
  const terms = useTerms();
  const stages = useStages();
  const own = useFields(subject);
  const ctx = useDescribeContext();
  const fields = conditionFields(subject, terms, stages, own);
  const choice = fields.find((f) => f.value === condition.field);
  const kind = choice?.valueKind ?? { kind: "text" as const };
  const ops = opsFor(kind);
  const toOpt = (f: (typeof fields)[number]): Option => ({ value: f.value, label: f.label });

  return (
    <div className="space-y-6">
      <Sentence>
        <Word>ואם</Word>
        <ChoiceChip
          label="מה לבדוק"
          value={condition.field}
          options={fields.filter((f) => !f.own).map(toOpt)}
          groups={[{ heading: "השדות שלך", options: fields.filter((f) => f.own).map(toOpt) }]}
          onChange={(v) => {
            const next = fields.find((f) => f.value === v);
            if (next) onChange(conditionFor(next));
          }}
          disabled={readOnly}
        />
        {kind.kind === "bool" ? (
          <Segmented
            label="כן או לא"
            value={condition.op === "neq" || condition.value === "false" ? "false" : "true"}
            options={[
              { value: "true", label: "כן" },
              { value: "false", label: "לא" },
            ]}
            onChange={(v) => onChange({ ...condition, op: "eq", value: v })}
            disabled={readOnly}
          />
        ) : (
          <>
            <ChoiceChip
              label="איך להשוות"
              value={condition.op}
              options={ops.map((o) => ({ value: o, label: OP_LABELS[o] }))}
              onChange={(v) => onChange({ ...condition, op: v as Condition["op"], value: VALUELESS_OPS.includes(v as Condition["op"]) ? "" : condition.value })}
              disabled={readOnly}
            />
            {!VALUELESS_OPS.includes(condition.op) &&
              (kind.kind === "enum" ? (
                <ChoiceChip
                  label="ערך"
                  value={condition.value || undefined}
                  options={kind.options}
                  onChange={(v) => onChange({ ...condition, value: v })}
                  placeholder="בחר ערך"
                  disabled={readOnly}
                />
              ) : (
                <Input
                  aria-label="ערך"
                  value={condition.value}
                  onChange={(e) => onChange({ ...condition, value: e.target.value.slice(0, 100) })}
                  inputMode={kind.kind === "number" ? "decimal" : undefined}
                  dir={kind.kind === "number" ? "ltr" : "auto"}
                  placeholder={kind.kind === "number" ? "0" : "מה לחפש"}
                  className={cn("h-8 border-brand/25", kind.kind === "number" ? "num w-24 text-center" : "w-44")}
                  disabled={readOnly}
                />
              ))}
          </>
        )}
      </Sentence>
      <Hint>הזרימה תמשיך רק אם זה נכון. אפשר להוסיף כמה תנאים, וכולם צריכים להתקיים.</Hint>
      <ReadsAs text={describeCondition(condition, ctx)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// חכה

export function WaitEditor({
  wait,
  onChange,
  readOnly,
}: {
  wait: { days: number; hours: number };
  onChange: (w: { days: number; hours: number }) => void;
  readOnly?: boolean;
}) {
  const none = !wait.days && !wait.hours;
  return (
    <div className="space-y-6">
      <Sentence>
        <Word>חכה</Word>
        <Stepper label="ימים" value={wait.days} onChange={(days) => onChange({ ...wait, days })} render={(n) => <DaysWords n={n} zero="0 ימים" />} disabled={readOnly} />
        <Word>ו־</Word>
        <Stepper label="שעות" value={wait.hours} max={23} onChange={(hours) => onChange({ ...wait, hours })} render={(n) => <DaysWords n={n} unit="hours" zero="0 שעות" />} disabled={readOnly} />
        <Word>ואז המשך</Word>
      </Sentence>
      <Hint>
        {none ? "בלי המתנה: הפעולות יקרו מיד." : "אחרי ההמתנה התנאים נבדקים שוב, כדי לא לפעול על משהו שכבר השתנה."}
      </Hint>
    </div>
  );
}

// ---------------------------------------------------------------------------
// אז

const ACTION_ICONS: Record<Action["type"], React.ElementType> = {
  prepare_whatsapp: WhatsappLogo,
  create_task: CheckSquare,
  notify: BellRinging,
  add_note: NotePencil,
  set_value: PencilSimpleLine,
};
export { ACTION_ICONS };

/** Text with {שם}-style chips that insert at the cursor. */
function TextWithPlaceholders({
  value,
  onChange,
  multiline,
  placeholder,
  label,
  max,
  readOnly,
}: {
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  placeholder: string;
  label: string;
  max: number;
  readOnly?: boolean;
}) {
  const terms = useTerms();
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);

  function insert(token: string) {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = (value.slice(0, start) + token + value.slice(end)).slice(0, max);
    onChange(next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const at = Math.min(start + token.length, next.length);
      el.setSelectionRange(at, at);
    });
  }

  const common = {
    ref,
    value,
    "aria-label": label,
    placeholder,
    dir: "auto" as const,
    disabled: readOnly,
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => onChange(e.target.value.slice(0, max)),
  };

  return (
    <div className="space-y-2">
      {multiline ? <Textarea {...common} rows={4} className="min-h-28 text-[14px] leading-relaxed" /> : <Input {...common} className="text-[14px]" />}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">הכנס:</span>
          {placeholderChips(terms).map((p) => (
            <button
              key={p.token}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insert(p.token)}
              className="inline-flex h-6 cursor-pointer items-center gap-0.5 rounded-sm border border-border bg-rail px-1.5 text-xs text-foreground transition-colors hover:border-brand/40 hover:text-brand active:translate-y-px"
            >
              <Plus className="size-3 text-muted-foreground" />
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The message as it will look in WhatsApp, with the fill-ins marked. */
function MessagePreview({ body }: { body: string }) {
  const terms = useTerms();
  const words = Object.fromEntries(placeholderChips(terms).map((p) => [p.token, p.label]));
  const parts = body.split(/(\{[^}]+\})/g);
  return (
    <div className="bg-table p-3 dot-grid">
      <div className="ms-auto max-w-[85%] rounded-sm border border-border bg-module px-3 py-2 text-[13.5px] leading-relaxed whitespace-pre-wrap shadow-xs" dir="auto">
        {body.trim() ? (
          parts.map((p, i) =>
            words[p] ? (
              <span key={i} className="rounded-sm bg-brand-soft px-1 text-brand">
                {words[p]}
              </span>
            ) : (
              <span key={i}>{p}</span>
            ),
          )
        ) : (
          <span className="text-muted-foreground">כאן תופיע ההודעה</span>
        )}
      </div>
    </div>
  );
}

export function ActionEditor({
  action,
  subject,
  onChange,
  readOnly,
}: {
  action: Action;
  subject: Subject;
  onChange: (a: Action) => void;
  readOnly?: boolean;
}) {
  const terms = useTerms();
  const stages = useStages();
  const own = useFields(subject);
  const ctx = useDescribeContext();
  const targets = setValueTargets(subject, terms, own.length > 0);

  return (
    <div className="space-y-6">
      <div role="radiogroup" aria-label="מה לעשות" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ACTION_TYPES(terms).map((o) => {
          const Icon = ACTION_ICONS[o.value as Action["type"]];
          const on = action.type === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={readOnly}
              onClick={() => !on && onChange(changeActionType(action, o.value as Action["type"], subject, stages))}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-sm border p-3 text-start transition-[border-color,background-color,transform] duration-150 active:translate-y-px disabled:cursor-default",
                on ? "border-brand bg-brand-soft" : "border-border bg-module hover:border-border-strong",
              )}
            >
              <Icon className={cn("mt-0.5 size-[18px] shrink-0", on ? "text-brand" : "text-muted-foreground")} weight={on ? "fill" : "regular"} />
              <span className="min-w-0">
                <span className={cn("block text-[13.5px] font-medium", on && "text-brand")}>{o.label}</span>
                <span className="block text-xs leading-snug text-muted-foreground">{o.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      {action.type === "prepare_whatsapp" && (
        <div className="space-y-3">
          <TextWithPlaceholders
            label="ההודעה"
            multiline
            max={1000}
            value={action.body}
            onChange={(body) => onChange({ ...action, body })}
            placeholder={`היי {שם}, …`}
            readOnly={readOnly}
          />
          <MessagePreview body={action.body} />
          <Hint>ההודעה לא נשלחת לבד. היא מחכה ב&quot;הודעות לשליחה&quot;, ושולחים אותה בלחיצה אחת.</Hint>
        </div>
      )}

      {action.type === "create_task" && (
        <div className="space-y-4">
          <TextWithPlaceholders
            label="מה המשימה"
            max={200}
            value={action.title}
            onChange={(title) => onChange({ ...action, title })}
            placeholder="למשל: לחזור ל{שם}"
            readOnly={readOnly}
          />
          <Sentence>
            <Word>לבצע</Word>
            <Stepper
              label="מתי לבצע"
              value={action.due_in_days}
              onChange={(due_in_days) => onChange({ ...action, due_in_days })}
              render={(n) => (n === 0 ? <>היום</> : n === 1 ? <>מחר</> : <>בעוד <span className="num">{n}</span>&nbsp;ימים</>)}
              disabled={readOnly}
            />
          </Sentence>
        </div>
      )}

      {action.type === "notify" && (
        <TextWithPlaceholders
          label="מה תגיד ההתראה"
          max={200}
          value={action.title}
          onChange={(title) => onChange({ ...action, title })}
          placeholder="למשל: נכנסה פנייה מ{שם}"
          readOnly={readOnly}
        />
      )}

      {action.type === "add_note" && (
        <TextWithPlaceholders
          label="ההערה"
          multiline
          max={1000}
          value={action.text}
          onChange={(text) => onChange({ ...action, text })}
          placeholder={`למשל: קיבל הודעת תודה על {שירות}`}
          readOnly={readOnly}
        />
      )}

      {action.type === "set_value" && (
        <SetValueEditor action={action} targets={targets} subject={subject} onChange={onChange} readOnly={readOnly} />
      )}

      <ReadsAs text={describeAction(action, ctx)} />
    </div>
  );
}

function SetValueEditor({
  action,
  targets,
  subject,
  onChange,
  readOnly,
}: {
  action: Extract<Action, { type: "set_value" }>;
  targets: Option[];
  subject: Subject;
  onChange: (a: Action) => void;
  readOnly?: boolean;
}) {
  const stages = useStages();
  const own = useFields(subject).filter((f) => f.type !== "multiselect");
  const field = own.find((f) => f.key === action.field);

  const valueOptions: Option[] | null =
    action.target === "customer_status"
      ? CUSTOMER_STATUS_OPTIONS
      : action.target === "lead_status"
        ? LEAD_STATUS_OPTIONS
        : action.target === "deal_stage"
          ? stages.map((s) => ({ value: s.key, label: s.label }))
          : field?.type === "select"
            ? field.options.map((o) => ({ value: o, label: o }))
            : null;

  return (
    <Sentence>
      <Word>עדכן את</Word>
      <ChoiceChip
        label="מה לעדכן"
        value={action.target}
        options={targets}
        onChange={(v) => {
          const target = v as typeof action.target;
          const first =
            target === "customer_status" ? "active" : target === "lead_status" ? "contacted" : target === "deal_stage" ? (stages[0]?.key ?? "") : "";
          const f = target === "custom_field" ? own[0] : undefined;
          onChange({ type: "set_value", target, field: f?.key, value: f?.type === "checkbox" ? "true" : first });
        }}
        disabled={readOnly}
      />
      {action.target === "custom_field" && (
        <ChoiceChip
          label="איזה שדה"
          value={action.field}
          options={own.map((f) => ({ value: f.key, label: f.label }))}
          onChange={(v) => onChange({ ...action, field: v, value: own.find((f) => f.key === v)?.type === "checkbox" ? "true" : "" })}
          placeholder="בחר שדה"
          disabled={readOnly}
        />
      )}
      <Word>ל</Word>
      {valueOptions ? (
        <ChoiceChip label="לאיזה ערך" value={action.value || undefined} options={valueOptions} onChange={(value) => onChange({ ...action, value })} placeholder="בחר ערך" disabled={readOnly} />
      ) : field?.type === "checkbox" ? (
        <Segmented
          label="כן או לא"
          value={action.value === "false" ? "false" : "true"}
          options={[
            { value: "true", label: "כן" },
            { value: "false", label: "לא" },
          ]}
          onChange={(value) => onChange({ ...action, value })}
          disabled={readOnly}
        />
      ) : (
        <Input
          aria-label="ערך חדש"
          value={action.value}
          onChange={(e) => onChange({ ...action, value: e.target.value.slice(0, 100) })}
          dir={field?.type === "number" || field?.type === "money" ? "ltr" : "auto"}
          placeholder="ערך חדש"
          className="h-8 w-44 border-brand/25"
          disabled={readOnly}
        />
      )}
    </Sentence>
  );
}
