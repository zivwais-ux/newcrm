"use client";

import Link from "next/link";
import { GearSix, SignOut } from "@phosphor-icons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Ltr } from "@/components/ui/ltr";
import { signOut } from "@/lib/actions/org";
import type { NotificationRow } from "@/lib/actions/automations";
import { NotificationBell } from "@/components/automations/notification-bell";
import { initials } from "@/lib/utils";
import { CommandBar } from "./command-bar";
import { Logo } from "./logo";
import { useWorkspace } from "./workspace-provider";

const NO_NOTIFICATIONS: NotificationRow[] = [];

/** A thin strip: who you are on the right, the command bar in the middle, the bell and your account on the left. */
export function TopStrip() {
  const { user, org, notifications } = useWorkspace();
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto grid h-14 max-w-[1600px] grid-cols-[auto_1fr_auto] items-center gap-3 px-3 sm:px-5">
        <Link href="/home" className="flex min-w-0 items-center gap-2.5" aria-label="למסך העבודה">
          <Logo withText={false} />
          <span className="hidden min-w-0 md:block">
            <span className="block max-w-[180px] truncate text-[14px] leading-tight font-semibold tracking-tight">{org.name}</span>
            <span className="block text-[11px] leading-tight text-muted-foreground">Business OS</span>
          </span>
        </Link>
        <div className="flex justify-center">
          <CommandBar />
        </div>
        <div className="flex items-center gap-1.5">
          <NotificationBell initial={notifications ?? NO_NOTIFICATIONS} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="grid size-9 shrink-0 place-items-center bg-foreground text-[11px] font-semibold text-background transition-transform active:translate-y-px cursor-pointer"
                aria-label="החשבון שלי"
              >
                {initials(user.name || user.email)}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="font-normal">
                <span className="block text-sm font-semibold text-foreground">{user.name}</span>
                <Ltr className="block truncate text-end text-xs">{user.email}</Ltr>
                <span className="mt-1 block truncate text-xs">{org.name}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <GearSix />
                  הגדרות
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => signOut()}>
                <SignOut className="rtl:-scale-x-100" />
                יציאה
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
