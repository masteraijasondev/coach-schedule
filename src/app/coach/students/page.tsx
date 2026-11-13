import { NewStudentForm } from "@/components/new-student-form";
import { Panel } from "@/components/ui";
import { requireCoach } from "@/lib/auth";

export default async function CoachStudentsPage() {
  await requireCoach();

  return (
    <Panel title="新增學生">
      <p className="text-sm text-[#525252]">
        學生資料會先寫入 Acuity，再同步到 Airtable。姓名及電話為必填。電郵、性別及其他資料可於稍後填寫。
      </p>
      <NewStudentForm />
    </Panel>
  );
}
