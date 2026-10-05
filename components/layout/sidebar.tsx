"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Blocks,
  CheckSquare,
  Database,
  Handshake,
  Home,
  LogOut,
  Receipt,
  Settings,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { signOut } from "@/lib/actions/org";
import { Ltr } from "@/components/ui/ltr";
import { Logo } from "./logo";
import { useWorkspace } from "./workspace-provider";

export const NAV = [
  {
    label: "ראשי",
    items: [
      { href: "/home", label: "בית", icon: Home },
      { href: "/customers", label: "לקוחות", icon: Users },
      { href: "/deals", label: "עסקאות", icon: Handshake },
      { href: "/tasks", label: "משימות", icon: CheckSquare },
      { href: "/transactions", label: "כסף ומכירות", icon: Receipt },
      { href: "/ai", label: "היועץ החכם", icon: Sparkles },
    ],
  },
  {
    label: "עוד",
    items: [
      { href: "/leads", label: "פניות", icon: UserPlus },
      { href: "/activities", label: "יומן פעילות", icon: Activity },
      { href: "/components", label: "ספריית הכלים", icon: Blocks },
      { href: "/data", label: "הנתונים שלי", icon: Database },
    ],
  },
];

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] transition-all",
        active
          ? "bg-surface font-semibold text-foreground shadow-xs ring-1 ring-black/[0.04]"
          : "text-zinc-600 hover:bg-black/[0.035] hover:text-foreground",
      )}
    >
      <Icon className={cn("size-[18px] shrink-0", active ? "text-brand" : "text-zinc-400")} />
      {label}
    </Link>
  );
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { org, user } = useWorkspace();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-4">
        <Link href="/home" onClick={onNavigate} className="flex min-w-0 items-center gap-2.5">
          <Logo withText={false} />
          <span className="min-w-0">
            <span className="block truncate text-[14px] leading-tight font-semibold tracking-tight">{org.name}</span>
            <span className="block text-[11px] leading-tight text-muted-foreground">Business OS</span>
          </span>
        </Link>
      </div>
      <nav aria-label="ניווט ראשי" className="flex-1 space-y-6 overflow-y-auto px-3 py-3">
        {NAV.map((group) => (
          <div key={group.label}>
            <p className="px-2.5 pb-1.5 text-xs font-medium text-muted-foreground">{group.label}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <NavLink {...item} active={isActive(item.href)} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="space-y-2 border-t px-3 py-3">
        <NavLink href="/settings" label="הגדרות" icon={Settings} active={isActive("/settings")} onNavigate={onNavigate} />
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand">
            {initials(user.name || user.email)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium">{user.name}</span>
            <Ltr className="block truncate text-end text-[11px] text-muted-foreground">{user.email}</Ltr>
          </span>
          <form action={signOut}>
            <button
              type="submit"
              aria-label="יציאה"
              title="יציאה"
              className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-black/[0.05] hover:text-foreground cursor-pointer"
            >
              <LogOut className="size-4 rtl:-scale-x-100" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
