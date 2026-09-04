import { AppShell } from "@/components/app-shell";
import { requireEmployer } from "@/lib/auth";

const items = [
  { href: "/employer", label: "日曆" },
  { href: "/employer/lessons", label: "派更" },
  { href: "/employer/salary", label: "薪資" },
  { href: "/employer/coaches", label: "教練" },
  { href: "/employer/students", label: "學生" },
  { href: "/employer/lesson-types", label: "課堂類型" },
  { href: "/employer/rates", label: "薪資規則" },
];

export default async function EmployerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireEmployer();

  return (
    <AppShell title="僱主管理" name={profile.full_name} items={items}>
      {children}
    </AppShell>
  );
}
