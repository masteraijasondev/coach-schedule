import { AppHeader } from "@/components/app-nav";

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
      <AppHeader title={title} name={name} items={items} />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
