import Link from "next/link";
import { Panel } from "@/components/ui";
import { requireEmployer } from "@/lib/auth";

const LINKS = [
  { href: "/employer/coaches", label: "教練", hint: "帳號、PT 費率" },
  { href: "/employer/students", label: "學生", hint: "學生名單" },
  { href: "/employer/lesson-types", label: "課堂類型", hint: "PT / MIIT / PTA" },
  { href: "/employer/rates", label: "薪資規則", hint: "各類型計薪" },
];

export default async function EmployerSettingsPage() {
  await requireEmployer();

  return (
    <Panel title="設定">
      <p className="mb-4 text-sm text-stone-500">管理教練、學生、課堂類型與薪資規則。</p>
      <ul className="divide-y divide-stone-100">
        {LINKS.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="flex min-h-11 items-center justify-between gap-3 py-3"
            >
              <span className="font-medium">{link.label}</span>
              <span className="text-sm text-stone-500">{link.hint}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
