import { EmployerSettingsBackLink } from "@/components/employer-settings-back-link";
import { NewStudentForm } from "@/components/new-student-form";
import { Panel } from "@/components/ui";
import { requireEmployer } from "@/lib/auth";

export default async function EmployerStudentsPage() {
  await requireEmployer();

  return (
    <div className="space-y-6">
      <EmployerSettingsBackLink />
      <Panel title="新增學生">
        <p className="text-sm text-[#525252]">
          學生資料會先寫入 Acuity，再同步到 Airtable。姓名及電話為必填。電郵可於稍後填寫。
        </p>
        <NewStudentForm />
      </Panel>
    </div>
  );
}
