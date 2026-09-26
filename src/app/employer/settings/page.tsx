import { buttonTone } from "@/components/button-styles";
import { Panel } from "@/components/ui";
import { requireEmployer } from "@/lib/auth";
import Link from "next/link";

const LINKS = [
  { href: "/employer/coaches", label: "同事與工作類型", hint: "帳號、Admin / PT / MIIT；時薪或分成" },
  { href: "/employer/lesson-types", label: "課堂類型", hint: "PT / MIIT / PTA" },
];

export default async function EmployerSettingsPage() {
  await requireEmployer();

  return (
    <Panel title="設定">
      <p className="mb-4 text-sm text-stone-500">管理同事與課堂類型。</p>
      <ul className="flex flex-wrap gap-2">
        {LINKS.map((link) => (
          <li key={link.href}>
            <Link href={link.href} title={link.hint} className={buttonTone.secondary}>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
