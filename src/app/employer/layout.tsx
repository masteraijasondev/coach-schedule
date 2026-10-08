import { AppShell } from "@/components/app-shell";
import { StudentDirectoryProvider } from "@/components/student-directory-provider";
import { requireEmployer } from "@/lib/auth";
import { EMPLOYER_TOUR } from "@/lib/tours";

const items = [
  { href: "/employer", label: "日曆", tour: "employer-nav-calendar" },
  { href: "/employer/salary", label: "薪資", tour: "employer-nav-salary" },
  {
    href: "/employer/settings",
    label: "設定",
    tour: "employer-nav-settings",
    activeWhen: [
      "/employer/settings",
      "/employer/coaches",
      "/employer/lesson-types",
      "/employer/students",
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
      <AppShell
        title="僱主管理"
        name={profile.full_name}
        items={items}
        tone="ops"
        tour={{ storageKey: "employer", steps: EMPLOYER_TOUR }}
      >
        {children}
      </AppShell>
    </StudentDirectoryProvider>
  );
}
