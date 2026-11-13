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
          學生資料將寫入 Acuity 客戶名單。姓名及電話為必填。電郵、性別及其他資料可於稍後填寫。
        </p>
        <NewStudentForm />
      </Panel>
    </div>
  );
}
