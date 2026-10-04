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
  Receipt,
  Settings,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { useWorkspace } from "./workspace-provider";

const NAV = [
  {
    label: "Workspace",
    items: [
      { href: "/home", label: "Home", icon: Home },
      { href: "/components", label: "Components", icon: Blocks },
    ],
  },
  {
    label: "Data",
    items: [
      { href: "/customers", label: "Customers", icon: Users },
      { href: "/leads", label: "Leads", icon: UserPlus },
      { href: "/deals", label: "Deals", icon: Handshake },
      { href: "/transactions", label: "Transactions", icon: Receipt },
      { href: "/activities", label: "Activities", icon: Activity },
      { href: "/tasks", label: "Tasks", icon: CheckSquare },
      { href: "/data", label: "Import & sources", icon: Database },
    ],
  },
  { label: "AI", items: [{ href: "/ai", label: "Ask AI", icon: Sparkles }] },
];

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { org } = useWorkspace();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center px-4">
        <Link href="/home" onClick={onNavigate} className="flex min-w-0 items-center gap-2">
          <Logo withText={false} />
          <span className="truncate text-sm font-semibold tracking-tight">{org.name}</span>
        </Link>
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-2.5 py-3">
        {NAV.map((group) => (
          <div key={group.label}>
            <p className="px-2 pb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{group.label}</p>
            <ul className="space-y-px">
              {group.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13.5px] transition-colors",
                        active ? "bg-surface font-medium text-foreground shadow-[0_0_0_1px_var(--border)]" : "text-zinc-600 hover:bg-black/[0.035] hover:text-foreground",
                      )}
                    >
                      <item.icon className={cn("size-4", active ? "text-foreground" : "text-zinc-400")} />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t px-2.5 py-2.5">
        <Link
          href="/settings"
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13.5px] transition-colors",
            pathname.startsWith("/settings") ? "bg-surface font-medium shadow-[0_0_0_1px_var(--border)]" : "text-zinc-600 hover:bg-black/[0.035] hover:text-foreground",
          )}
        >
          <Settings className="size-4 text-zinc-400" />
          Settings
        </Link>
      </div>
    </div>
  );
}
