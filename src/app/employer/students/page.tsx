import { createStudentAction, toggleStudentActiveAction } from "@/actions/students";
import { ActionForm } from "@/components/action-form";
import { EmployerSettingsBackLink } from "@/components/employer-settings-back-link";
import { Field, Panel, SubmitButton } from "@/components/ui";
import { lookupAirtableTuitions } from "@/lib/airtable-tuition";
import { requireEmployer } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export default async function StudentsPage() {
  await requireEmployer();
  const supabase = await createClient();
  const { data: students } = await supabase
    .from("students")
    .select("id, name, notes, active")
    .order("name");
  const { fees, error } = await lookupAirtableTuitions(
    (students ?? []).map((student) => student.name),
  );

  return (
    <div className="space-y-6">
      <EmployerSettingsBackLink />
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="新增學生">
        <ActionForm action={createStudentAction} className="space-y-3">
          <Field label="姓名" name="name" required />
          <Field label="備註" name="notes" />
          <SubmitButton>新增</SubmitButton>
        </ActionForm>
      </Panel>

      <Panel title="學生列表">
        {error ? (
          <p className="text-sm text-amber-700">{error}</p>
        ) : (
          <p className="text-sm text-stone-500">
            本身學費來自 Airtable 近半年 PT 原價（未套券的最常見金額）。
          </p>
        )}
        <ul className="divide-y divide-stone-100">
          {(students ?? []).map((student) => (
            <li
              key={student.id}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div>
                <p className="font-medium">{student.name}</p>
                <p className="text-sm text-stone-500">
                  本身學費：
                  {fees.get(student.name) != null
                    ? formatMoney(fees.get(student.name) ?? 0)
                    : "Airtable 未有"}
                </p>
                {student.notes ? (
                  <p className="text-sm text-stone-500">{student.notes}</p>
                ) : null}
              </div>
              <form
                action={async () => {
                  "use server";
                  await toggleStudentActiveAction(student.id, !student.active);
                }}
              >
                <button
                  type="submit"
                  className="text-sm text-stone-600 underline"
                >
                  {student.active ? "停用" : "啟用"}
                </button>
              </form>
            </li>
          ))}
          {(students ?? []).length === 0 ? (
            <li className="py-3 text-sm text-stone-500">尚未新增學生</li>
          ) : null}
        </ul>
      </Panel>
    </div>
    </div>
  );
}
