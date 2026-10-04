"use client";

import { useState } from "react";
import { LogOut, Menu, Plus, Settings, Upload } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { RecordFormDialog, RECORD_FORMS } from "@/components/business/record-form";
import { GlobalSearch } from "./global-search";
import { SidebarNav } from "./sidebar";
import { useWorkspace } from "./workspace-provider";
import { signOut } from "@/lib/actions/org";
import { initials } from "@/lib/utils";
import type { RecordEntity } from "@/lib/actions/records";

const NEW_ITEMS: RecordEntity[] = ["customers", "leads", "deals", "transactions", "activities", "tasks"];

export function Topbar() {
  const { user, org } = useWorkspace();
  const [creating, setCreating] = useState<RecordEntity | null>(null);
  const [mobileNav, setMobileNav] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur sm:px-6">
      <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={() => setMobileNav(true)} aria-label="Open navigation">
        <Menu />
      </Button>
      <div className="flex flex-1 items-center">
        <GlobalSearch />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline">
            <Plus />
            <span className="hidden sm:inline">New</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {NEW_ITEMS.map((e) => (
            <DropdownMenuItem key={e} onSelect={() => setCreating(e)} className="capitalize">
              {RECORD_FORMS[e].singular}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/data/import">
              <Upload />
              Import data
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="grid size-8 place-items-center rounded-full bg-zinc-800 text-[11px] font-medium text-white cursor-pointer"
            aria-label="Account"
          >
            {initials(user.name || user.email)}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <span className="block text-sm font-medium text-foreground">{user.name}</span>
            <span className="block truncate text-xs">{user.email}</span>
            <span className="mt-1 block truncate text-xs">{org.name}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <Settings />
              Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => signOut()}>
            <LogOut />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {creating && <RecordFormDialog entity={creating} open onOpenChange={(o) => !o && setCreating(null)} />}

      <Sheet open={mobileNav} onOpenChange={setMobileNav}>
        <SheetContent side="left" className="w-64 bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarNav onNavigate={() => setMobileNav(false)} />
        </SheetContent>
      </Sheet>
    </header>
  );
}
