import { AppShell } from "@/components/app-shell";
import { requireCoach } from "@/lib/auth";
import { COACH_TOUR } from "@/lib/tours";

const items = [
  { href: "/coach", label: "日曆", tour: "coach-nav-calendar" },
  { href: "/coach/salary", label: "薪資", tour: "coach-nav-salary" },
  { href: "/coach/students", label: "新增學生", tour: "coach-nav-students" },
];

export default async function CoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireCoach();

  return (
    <AppShell
      title="員工工作台"
      name={profile.full_name}
      items={items}
      tour={{ storageKey: "coach", steps: COACH_TOUR }}
    >
      {children}
    </AppShell>
  );
}
