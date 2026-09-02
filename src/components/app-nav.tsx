"use client";

import { logoutAction } from "@/actions/auth";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type NavItem = { href: string; label: string };

function isActive(pathname: string, href: string): boolean {
  if (href === "/employer" || href === "/coach") {
    return pathname === href || pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppHeader({
  title,
  name,
  items,
}: {
  title: string;
  name: string;
  items: NavItem[];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-20 border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-stone-500 sm:text-lg sm:font-semibold sm:tracking-tight sm:text-stone-900">
            {title}
          </p>
          <p className="truncate text-lg font-bold sm:text-2xl">{name}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-stone-300 px-3 text-sm font-medium hover:bg-stone-100 md:hidden"
            aria-expanded={open}
            aria-controls="app-nav-menu"
            onClick={() => setOpen((current) => !current)}
          >
            {open ? "關閉" : "選單"}
          </button>
          <form action={logoutAction}>
            <button
              type="submit"
              className="min-h-11 rounded-md border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100"
            >
              登出
            </button>
          </form>
        </div>
      </div>
      <nav
        id="app-nav-menu"
        className={`${
          open ? "flex" : "hidden"
        } mx-auto max-w-6xl flex-col gap-1 border-t border-stone-100 px-4 py-2 md:flex md:flex-row md:flex-wrap md:border-t-0 md:pb-3 md:pt-0`}
      >
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "flex min-h-11 w-full items-center rounded-md px-3 py-2.5 text-base md:min-h-0 md:w-auto md:py-1.5 md:text-sm",
                active
                  ? "bg-stone-900 font-medium text-white"
                  : "text-stone-700 hover:bg-stone-100",
              ].join(" ")}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
