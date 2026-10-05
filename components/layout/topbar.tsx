"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarPlus, CheckSquare, Home, LogOut, Menu, MoreHorizontal, Plus, Receipt, Settings, Upload, UserPlus, Users } from "lucide-react";
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
import { Ltr } from "@/components/ui/ltr";
import { RecordFormDialog, RECORD_FORMS } from "@/components/business/record-form";
import { GlobalSearch } from "./global-search";
import { SidebarNav } from "./sidebar";
import { useWorkspace } from "./workspace-provider";
import { signOut } from "@/lib/actions/org";
import { cn, initials } from "@/lib/utils";
import type { RecordEntity } from "@/lib/actions/records";

const NEW_ITEMS: { entity: RecordEntity; icon: React.ElementType }[] = [
  { entity: "customers", icon: UserPlus },
  { entity: "tasks", icon: CheckSquare },
  { entity: "transactions", icon: Receipt },
  { entity: "activities", icon: CalendarPlus },
];

function NewMenuItems({ onCreate }: { onCreate: (e: RecordEntity) => void }) {
  return (
    <>
      <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">מה תרצה להוסיף?</DropdownMenuLabel>
      {NEW_ITEMS.map(({ entity, icon: Icon }) => (
        <DropdownMenuItem key={entity} onSelect={() => onCreate(entity)} className="py-2">
          <Icon />
          {RECORD_FORMS[entity].newLabel}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild className="py-2">
        <Link href="/data/import">
          <Upload />
          העלאת קובץ אקסל
        </Link>
      </DropdownMenuItem>
    </>
  );
}

export function Topbar() {
  const { user, org } = useWorkspace();
  const pathname = usePathname();
  const [creating, setCreating] = useState<RecordEntity | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur-md sm:px-6">
        <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={() => setMobileNav(true)} aria-label="פתח תפריט">
          <Menu />
        </Button>
        <div className="flex min-w-0 flex-1 items-center">
          <GlobalSearch />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="hidden sm:inline-flex" aria-label="הוסף חדש">
              <Plus />
              חדש
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <NewMenuItems onCreate={setCreating} />
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="grid size-9 shrink-0 place-items-center rounded-full bg-zinc-800 text-[11px] font-medium text-white shadow-xs ring-2 ring-background cursor-pointer"
              aria-label="החשבון שלי"
            >
              {initials(user.name || user.email)}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="font-normal">
              <span className="block text-sm font-medium text-foreground">{user.name}</span>
              <Ltr className="block truncate text-end text-xs">{user.email}</Ltr>
              <span className="mt-1 block truncate text-xs">{org.name}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Settings />
                הגדרות
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => signOut()}>
              <LogOut className="rtl:-scale-x-100" />
              יציאה
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Mobile bottom navigation (rendered outside the blurred header so `fixed` anchors to the viewport). */}
      <nav
        aria-label="ניווט מהיר"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgb(24_24_27/0.06)] backdrop-blur lg:hidden"
      >
        <ul className="mx-auto grid h-16 max-w-md grid-cols-5 items-center px-2">
          <BottomLink href="/home" label="בית" icon={Home} active={isActive("/home")} />
          <BottomLink href="/customers" label="לקוחות" icon={Users} active={isActive("/customers")} />
          <li className="flex justify-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="הוסף חדש"
                  className="-mt-6 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background transition-transform active:scale-95 cursor-pointer"
                >
                  <Plus className="size-6" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="center" sideOffset={10} className="w-56">
                <NewMenuItems onCreate={setCreating} />
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
          <BottomLink href="/tasks" label="משימות" icon={CheckSquare} active={isActive("/tasks")} />
          <li>
            <button
              type="button"
              onClick={() => setMobileNav(true)}
              className="flex w-full flex-col items-center gap-0.5 py-1 text-[11px] text-muted-foreground cursor-pointer"
            >
              <MoreHorizontal className="size-5" />
              עוד
            </button>
          </li>
        </ul>
      </nav>

      {creating && <RecordFormDialog entity={creating} open onOpenChange={(o) => !o && setCreating(null)} />}

      <Sheet open={mobileNav} onOpenChange={setMobileNav}>
        <SheetContent side="left" className="w-72 bg-sidebar p-0">
          <SheetTitle className="sr-only">תפריט ניווט</SheetTitle>
          <SidebarNav onNavigate={() => setMobileNav(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}

function BottomLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: React.ElementType; active: boolean }) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn("flex flex-col items-center gap-0.5 py-1 text-[11px]", active ? "font-semibold text-brand" : "text-muted-foreground")}
      >
        <Icon className="size-5" />
        {label}
      </Link>
    </li>
  );
}
