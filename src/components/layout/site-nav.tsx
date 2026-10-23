"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { PageContainer } from "@/components/layout/page-container";
import { CloseIcon, MenuIcon } from "@/components/ui/icons";
import { primaryNavigation } from "@/config/navigation";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

type NavListProps = {
  /** null while the URL is not known yet (dynamic routes stream it in): nothing is highlighted. */
  pathname: string | null;
  orientation: "horizontal" | "vertical";
  onNavigate?: () => void;
};

/** The single list of primary links, shared by the desktop and mobile layouts. */
function NavList({ pathname, orientation, onNavigate }: NavListProps) {
  const vertical = orientation === "vertical";

  return (
    <ul className={cn("flex", vertical ? "flex-col gap-1" : "items-center gap-1")}>
      {primaryNavigation.map((item) => {
        const active = pathname !== null && isActive(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center type-button transition-colors",
                vertical ? "h-12 rounded-control px-3" : "h-9 rounded-button px-3.5",
                active ? "bg-secondary text-secondary-foreground" : "text-muted hover:bg-foreground/5 hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Reads the URL for the active-link highlight; rendered inside <Suspense>. */
function ActiveNavList(props: Omit<NavListProps, "pathname">) {
  return <NavList {...props} pathname={usePathname()} />;
}

/** Calls `onChange` after any route change (including browser back/forward); rendered inside <Suspense>. */
function RouteChangeListener({ onChange }: { onChange: () => void }) {
  const pathname = usePathname();
  const previous = useRef(pathname);
  useEffect(() => {
    if (pathname !== previous.current) {
      previous.current = pathname;
      onChange();
    }
  }, [pathname, onChange]);
  return null;
}

type SiteNavProps = {
  /** Account controls (rendered on the server and streamed in) for each layout. */
  desktopAccount: ReactNode;
  mobileAccount: ReactNode;
};

/**
 * Header navigation. Desktop shows the links inline; below the md breakpoint
 * a disclosure button reveals the same links in a panel. Only this component
 * is a Client Component; the rest of the header renders on the server.
 * The parts that read the URL sit in <Suspense>, so pages with dynamic URLs
 * (e.g. /student/tasks/[taskId]) can still prerender the header.
 */
export function SiteNav({ desktopAccount, mobileAccount }: SiteNavProps) {
  const [open, setOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    }
    function onPointerDown(event: PointerEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <nav
      ref={navRef}
      aria-label="Main"
      // Close when keyboard focus moves out of the navigation.
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && !event.currentTarget.contains(next)) close();
      }}
    >
      <Suspense fallback={null}>
        <RouteChangeListener onChange={close} />
      </Suspense>

      <div className="hidden items-center gap-4 md:flex">
        <Suspense fallback={<NavList pathname={null} orientation="horizontal" />}>
          <ActiveNavList orientation="horizontal" />
        </Suspense>
        {desktopAccount}
      </div>

      <button
        ref={toggleRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="relative inline-flex size-11 items-center justify-center rounded-control text-foreground transition-colors hover:bg-foreground/5 active:bg-foreground/10 md:hidden"
      >
        {/* The two icons cross-fade and turn, so the toggle reads as one control changing state. */}
        <MenuIcon
          className={cn("absolute size-6 transition-[opacity,rotate] duration-300 ease-out-soft", open && "rotate-90 opacity-0")}
        />
        <CloseIcon
          className={cn("absolute size-6 transition-[opacity,rotate] duration-300 ease-out-soft", !open && "-rotate-90 opacity-0")}
        />
        <span className="sr-only">Menu</span>
      </button>

      {/*
       * Closed: `invisible` removes the panel from the tab order and the
       * accessibility tree; the visibility change waits for the fade-out.
       */}
      <div
        id={panelId}
        className={cn(
          "absolute inset-x-0 top-full border-b border-border bg-background shadow-raised transition-[opacity,translate,visibility] duration-250 ease-out-soft md:hidden",
          open ? "visible translate-y-0 opacity-100" : "pointer-events-none invisible -translate-y-2 opacity-0",
        )}
      >
        <PageContainer className="py-3">
          <Suspense fallback={<NavList pathname={null} orientation="vertical" onNavigate={close} />}>
            <ActiveNavList orientation="vertical" onNavigate={close} />
          </Suspense>
          {/* Account links navigate away, and the menu closes on any route change. */}
          <div className="mt-3 border-t border-border pt-3">{mobileAccount}</div>
        </PageContainer>
      </div>
    </nav>
  );
}
