"use client";

import { logoutAction } from "@/actions/auth";
import { buttonTone } from "@/components/button-styles";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export type NavItem = {
  href: string;
  label: string;
  activeWhen?: string[];
  tour?: string;
};

function isActive(pathname: string, item: NavItem): boolean {
  const hrefs = item.activeWhen ?? [item.href];
  return hrefs.some((href) => {
    if (href === "/employer" || href === "/coach") {
      return pathname === href || pathname === "/";
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  });
}

export function AppHeader({
  title,
  name,
  items,
  tone = "default",
}: {
  title: string;
  name: string;
  items: NavItem[];
  tone?: "default" | "ops";
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [menuPath, setMenuPath] = useState(pathname);
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setOpen(false);
  }
  const ops = tone === "ops";

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function links(stacked: boolean) {
    return items.map((item) => {
      const active = isActive(pathname, item);
      return (
        <Link
          key={item.href}
          href={item.href}
          data-tour={item.tour}
          onClick={() => setOpen(false)}
          className={[
            "flex min-h-11 items-center px-3 text-base font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2C2C2C]",
            stacked ? "border-b border-stone-200" : "rounded-md md:text-lg",
            active
              ? "bg-[#2C2C2C] font-bold text-white"
              : "text-[#2C2C2C] hover:bg-stone-100",
          ].join(" ")}
        >
          {item.label}
        </Link>
      );
    });
  }

  return (
    <header
      className={
        ops
          ? "sticky top-0 z-20 border-b-4 border-[#FF6B00] bg-white text-[#2C2C2C]"
          : "sticky top-0 z-20 border-b border-stone-200 bg-white"
      }
    >
      <div className="flex w-full items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4 sm:py-3">
        <div className="min-w-0 flex-1 md:max-w-xs md:flex-none">
          <p className="text-lg font-semibold tracking-tight text-[#2C2C2C]">
            {title}
          </p>
          <p className="truncate text-sm font-medium text-[#525252]">{name}</p>
        </div>
        <nav
          aria-label="頁面"
          className="hidden min-w-0 flex-1 flex-wrap items-center justify-end gap-1 md:flex"
        >
          {links(false)}
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          <div id="tour-help-slot" />
          <button
            type="button"
            className={`${buttonTone.secondary} min-h-11 min-w-11 md:hidden`}
            aria-expanded={open}
            aria-controls="app-nav-menu"
            onClick={() => setOpen((current) => !current)}
          >
            {open ? "關閉" : "選單"}
          </button>
          <form action={logoutAction}>
            <button type="submit" className={`${buttonTone.secondary} min-h-11`}>
              登出
            </button>
          </form>
        </div>
      </div>
      <nav
        id="app-nav-menu"
        aria-label="頁面"
        className={`${open ? "flex" : "hidden"} flex-col border-t border-stone-200 md:hidden`}
      >
        {links(true)}
      </nav>
    </header>
  );
}
