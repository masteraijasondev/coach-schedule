import { AppHeader, type NavItem } from "@/components/app-nav";
import { APP_VERSION } from "@/lib/constants";

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
      <AppHeader title={title} name={name} items={items} />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      <p className="px-4 pb-4 text-center text-xs text-stone-400">v{APP_VERSION}</p>
    </div>
  );
}
