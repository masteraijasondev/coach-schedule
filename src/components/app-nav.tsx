"use client";

import { logoutAction } from "@/actions/auth";
import { buttonTone } from "@/components/button-styles";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export type NavItem = { href: string; label: string; activeWhen?: string[] };

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
  const ops = tone === "ops";

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header
      className={
        ops
          ? "sticky top-0 z-20 border-b-4 border-[#FF6B00] bg-white text-[#2C2C2C]"
          : "sticky top-0 z-20 border-b border-stone-200 bg-white"
      }
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p
            className={
              ops
                ? "text-sm font-semibold tracking-wide text-[#525252] sm:text-lg"
                : "text-sm font-medium text-stone-700 sm:text-lg sm:font-semibold sm:tracking-tight sm:text-stone-900"
            }
          >
            {title}
          </p>
          <p className="truncate text-lg font-bold sm:text-2xl">{name}</p>
        </div>
        <nav
          id="app-nav-menu"
          className={`${
            open ? "flex" : "hidden"
          } min-w-0 flex-1 flex-wrap items-center justify-end gap-1 md:flex md:gap-5`}
        >
          {items.map((item) => {
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={[
                  "flex min-h-11 items-center rounded-md px-3 py-2.5 text-lg font-semibold",
                  active
                    ? ops
                      ? "bg-[#2C2C2C] font-bold text-white"
                      : "bg-stone-900 font-bold text-white"
                    : ops
                      ? "text-[#2C2C2C] hover:bg-stone-100"
                      : "text-stone-700 hover:bg-stone-100",
                ].join(" ")}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className={`${buttonTone.secondary} min-w-11 md:hidden`}
            aria-expanded={open}
            aria-controls="app-nav-menu"
            onClick={() => setOpen((current) => !current)}
          >
            {open ? "關閉" : "選單"}
          </button>
          <form action={logoutAction}>
            <button
              type="submit"
              className={buttonTone.secondary}
            >
              登出
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
