"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import {
  AddressBook,
  CalendarPlus,
  CheckSquare,
  Cube,
  Database,
  DotsThree,
  GearSix,
  Handshake,
  House,
  ListChecks,
  Plus,
  Receipt,
  Sparkle,
  SquaresFour,
  Tray,
  UploadSimple,
  UserPlus,
  Users,
} from "@phosphor-icons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useCreate } from "./create-provider";

export const OPEN_DRAWER_EVENT = "bos:open-drawer";

const MAIN = [
  { href: "/home", label: "בית", icon: House },
  { href: "/customers", label: "לקוחות", icon: Users },
  { href: "/transactions", label: "כסף", icon: Receipt },
] as const;
const AFTER = [
  { href: "/tasks", label: "משימות", icon: CheckSquare },
  { href: "/ai", label: "יועץ", icon: Sparkle },
] as const;
export const MORE = [
  { href: "/deals", label: "עסקאות", icon: Handshake },
  { href: "/leads", label: "פניות", icon: Tray },
  { href: "/activities", label: "יומן פעילות", icon: ListChecks },
  { href: "/components", label: "ספריית המודולים", icon: Cube },
  { href: "/data", label: "הנתונים שלי", icon: Database },
  { href: "/settings", label: "הגדרות", icon: GearSix },
] as const;

function DockLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: React.ElementType; active: boolean }) {
  const reduce = useReducedMotion();
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-14 w-14 flex-col items-center justify-center gap-1 text-[10.5px] transition-colors active:translate-y-px sm:w-16",
        active ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {active && (
        <motion.span
          layoutId="dock-active"
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 38 }}
          className="absolute inset-x-3 top-0 h-[2px] bg-brand"
        />
      )}
      <Icon className={cn("size-[22px]", active && "text-brand")} weight={active ? "fill" : "regular"} />
      {label}
    </Link>
  );
}

/** Floating dock: the whole app's navigation, the same on desktop and phone. */
export function Dock() {
  const pathname = usePathname();
  const create = useCreate();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const moreActive = MORE.some((m) => isActive(m.href));
  const onHome = pathname === "/home";

  return (
    <nav
      aria-label="ניווט ראשי"
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-2 pb-[max(env(safe-area-inset-bottom),0.75rem)] pointer-events-none"
    >
      <div className="pointer-events-auto flex items-center border border-border bg-module/92 px-1 shadow-xl backdrop-blur-md supports-[backdrop-filter]:bg-module/80">
        {MAIN.map((i) => (
          <DockLink key={i.href} {...i} active={isActive(i.href)} />
        ))}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="הוסף חדש"
              className="mx-1 grid size-11 place-items-center bg-brand text-white shadow-[0_1px_0_rgb(255_255_255/0.15)_inset,0_6px_16px_-6px_rgb(79_70_229/0.7)] transition-transform hover:bg-brand/90 active:translate-y-px cursor-pointer"
            >
              <Plus className="size-5" weight="bold" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="center" sideOffset={12} className="w-60">
            <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">מה תרצה להוסיף?</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => create({ kind: "sale" })} className="py-2 font-semibold">
              <Receipt className="text-brand" />
              מכירה מהירה
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => create({ kind: "appointment" })} className="py-2 font-semibold">
              <CalendarPlus className="text-brand" />
              תור חדש
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => create({ kind: "record", entity: "customers" })} className="py-2">
              <UserPlus />
              לקוח חדש
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => create({ kind: "record", entity: "tasks" })} className="py-2">
              <CheckSquare />
              משימה חדשה
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => create({ kind: "record", entity: "leads" })} className="py-2">
              <AddressBook />
              פנייה חדשה
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => create({ kind: "record", entity: "deals" })} className="py-2">
              <Handshake />
              עסקה חדשה
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {onHome && (
              <DropdownMenuItem onSelect={() => window.dispatchEvent(new Event(OPEN_DRAWER_EVENT))} className="py-2">
                <SquaresFour />
                מודול למסך העבודה
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild className="py-2">
              <Link href="/data/import">
                <UploadSimple />
                העלאת קובץ אקסל
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {AFTER.map((i) => (
          <DockLink key={i.href} {...i} active={isActive(i.href)} />
        ))}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "relative flex h-14 w-14 flex-col items-center justify-center gap-1 text-[10.5px] transition-colors cursor-pointer sm:w-16",
                moreActive ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {moreActive && <span className="absolute inset-x-3 top-0 h-[2px] bg-brand" />}
              <DotsThree className={cn("size-[22px]", moreActive && "text-brand")} weight="bold" />
              עוד
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" sideOffset={12} className="w-56">
            {MORE.map((m) => (
              <DropdownMenuItem key={m.href} asChild className="py-2">
                <Link href={m.href} aria-current={isActive(m.href) ? "page" : undefined}>
                  <m.icon className={cn(isActive(m.href) && "text-brand")} />
                  {m.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
