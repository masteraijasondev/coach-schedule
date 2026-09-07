import { AppShell } from "@/components/app-shell";
import { StudentDirectoryProvider } from "@/components/student-directory-provider";
import { requireEmployer } from "@/lib/auth";

const items = [
  { href: "/employer", label: "日曆" },
  { href: "/employer/salary", label: "薪資" },
  {
    href: "/employer/settings",
    label: "設定",
    activeWhen: [
      "/employer/settings",
      "/employer/coaches",
      "/employer/students",
      "/employer/lesson-types",
      "/employer/rates",
    ],
  },
];

export default async function EmployerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireEmployer();

  return (
    <StudentDirectoryProvider>
      <AppShell title="僱主管理" name={profile.full_name} items={items}>
        {children}
      </AppShell>
    </StudentDirectoryProvider>
  );
}
