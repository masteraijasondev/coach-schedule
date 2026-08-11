import { createStudentAction, toggleStudentActiveAction } from "@/actions/students";
import { ActionForm } from "@/components/action-form";
import { Field, Panel, SubmitButton } from "@/components/ui";
import { requireEmployer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function StudentsPage() {
  await requireEmployer();
  const supabase = await createClient();
  const { data: students } = await supabase
    .from("students")
    .select("*")
    .order("name");

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="新增學生">
        <ActionForm action={createStudentAction} className="space-y-3">
          <Field label="姓名" name="name" required />
          <Field label="備註" name="notes" />
          <SubmitButton>新增</SubmitButton>
        </ActionForm>
      </Panel>

      <Panel title="學生列表">
        <ul className="divide-y divide-stone-100">
          {(students ?? []).map((student) => (
            <li
              key={student.id}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div>
                <p className="font-medium">{student.name}</p>
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
  );
}
