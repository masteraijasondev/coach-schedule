import Link from "next/link";
import { logoutAction } from "@/actions/auth";

type NavItem = { href: string; label: string };

type Props = {
  title: string;
  name: string;
  items: NavItem[];
};

export function AppShell({
  title,
  name,
  items,
  children,
}: Props & { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-lg font-semibold tracking-tight">{title}</p>
            <p className="text-sm text-stone-500">{name}</p>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-md border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100"
            >
              登出
            </button>
          </form>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-3">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
