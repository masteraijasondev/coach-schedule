import { AppShell } from "@/components/app-shell";
import { requireCoach } from "@/lib/auth";

const items = [
  { href: "/coach", label: "日曆" },
  { href: "/coach/salary", label: "薪資" },
];

export default async function CoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireCoach();

  return (
    <AppShell title="教練工作台" name={profile.full_name} items={items}>
      {children}
    </AppShell>
  );
}
