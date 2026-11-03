import { PERSONAS, type PersonaKey } from "@/lib/agents/personas";
import { cn } from "@/lib/utils";

/**
 * An agent's face: a soft rounded tile with one calm, looping drawing of its job.
 * Pure SVG + CSS (keyframes in globals.css, `.av-*`), so it costs almost nothing and
 * stops under reduced motion. `working` speeds the loop up while the agent runs.
 */
export function AgentAvatar({
  agent,
  working = false,
  size = "md",
  className,
}: {
  agent: PersonaKey;
  working?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const Drawing = DRAWINGS[agent];
  return (
    <span
      className={cn(
        "av relative grid shrink-0 place-items-center overflow-hidden border border-brand/15 bg-gradient-to-br from-brand-soft via-brand-soft to-module text-brand shadow-[0_6px_16px_-8px_rgb(79_70_229/0.45)] transition-shadow duration-300",
        size === "sm" && "size-8 rounded-[10px]",
        size === "md" && "size-11 rounded-[13px]",
        size === "lg" && "size-14 rounded-[16px]",
        working && "shadow-[0_0_0_3px_rgb(79_70_229/0.12),0_8px_20px_-8px_rgb(79_70_229/0.6)]",
        className,
      )}
      data-working={working || undefined}
      role="img"
      aria-label={PERSONAS[agent].name}
    >
      <svg viewBox="0 0 40 40" className="size-[82%]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <Drawing />
      </svg>
    </span>
  );
}

/** נועה, revenue: bars rising, a coin landing on top of the stack. */
function Revenue() {
  return (
    <>
      <path d="M7 32.5h26" strokeOpacity={0.3} />
      <rect className="av-bar" x="9" y="22" width="5.5" height="9" rx="1.6" fill="currentColor" fillOpacity={0.35} stroke="none" />
      <rect className="av-bar av-d1" x="17.25" y="17" width="5.5" height="14" rx="1.6" fill="currentColor" fillOpacity={0.6} stroke="none" />
      <rect className="av-bar av-d2" x="25.5" y="12" width="5.5" height="19" rx="1.6" fill="currentColor" stroke="none" />
      <circle className="av-coin" cx="28.25" cy="7.5" r="3" fill="var(--module)" strokeWidth={1.75} />
    </>
  );
}

/** אורי, customers: a shield breathing, a heartbeat running across it. */
function Customers() {
  return (
    <>
      <path className="av-breathe" d="M20 6.5l10.5 3.8v8.4c0 6.6-4.4 11.6-10.5 14.3C13.9 30.3 9.5 25.3 9.5 18.7v-8.4z" fill="currentColor" fillOpacity={0.1} />
      <polyline className="av-pulse" points="11.5,20.5 16,20.5 18,16 21,25 23.2,18.5 24.8,20.5 28.5,20.5" strokeWidth={2.1} />
    </>
  );
}

/** תום, sales: a dot travels the pipeline into the target; the rings answer when it lands. */
function Sales() {
  return (
    <>
      <circle className="av-ring" cx="25" cy="20" r="11" strokeOpacity={0.4} />
      <circle className="av-ring av-d1" cx="25" cy="20" r="6.5" strokeOpacity={0.7} />
      <circle cx="25" cy="20" r="2.2" fill="currentColor" stroke="none" />
      <path d="M4 20h6" strokeOpacity={0.35} strokeDasharray="1.5 3" />
      <circle className="av-shot" cx="8" cy="20" r="2" fill="currentColor" stroke="none" />
    </>
  );
}

/** שירה, chief of staff: the day's checklist ticking itself off, line after line. */
function Chief() {
  const rows = [11, 20, 29];
  return (
    <>
      {rows.map((y, i) => (
        <g key={y}>
          <rect x="7.5" y={y - 3.5} width="7" height="7" rx="2" strokeWidth={1.6} strokeOpacity={0.55} />
          <path className={`av-tick av-tick-${i + 1}`} d={`M9 ${y + 0.2}l1.9 1.9 3.3-3.8`} strokeWidth={1.9} />
          <path d={`M18.5 ${y}h${i === 1 ? 10 : 14}`} strokeOpacity={0.3} strokeWidth={2.2} />
        </g>
      ))}
    </>
  );
}

/** נובה, the business brain: neurons lighting up, signals flowing between them. */
function Brain() {
  const nodes: [number, number][] = [
    [20, 8],
    [9, 16],
    [31, 16],
    [12, 30],
    [28, 30],
  ];
  return (
    <>
      <circle className="av-halo" cx="20" cy="20.5" r="8" fill="currentColor" stroke="none" />
      {nodes.map(([x, y], i) => (
        <path key={`l${i}`} className={`av-link av-d${i % 4}`} d={`M20 20.5L${x} ${y}`} strokeWidth={1.3} strokeOpacity={0.5} />
      ))}
      <path className="av-link av-d2" d="M9 16L12 30M31 16L28 30M12 30h16" strokeWidth={1.1} strokeOpacity={0.3} />
      {nodes.map(([x, y], i) => (
        <circle key={`n${i}`} className={`av-node av-d${(i % 4) + 1}`} cx={x} cy={y} r="2.4" fill="currentColor" stroke="none" />
      ))}
      <circle cx="20" cy="20.5" r="3.4" fill="currentColor" stroke="var(--module)" strokeWidth={1.4} />
    </>
  );
}

const DRAWINGS: Record<PersonaKey, () => React.ReactElement> = {
  revenue: Revenue,
  customers: Customers,
  sales: Sales,
  chief: Chief,
  brain: Brain,
};
