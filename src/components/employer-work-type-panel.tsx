import { saveStaffWorkTypesAction } from "@/actions/lesson-types";
import { ActionForm } from "@/components/action-form";
import { Panel, SubmitButton } from "@/components/ui";

export function EmployerWorkTypePanel({
  coaches,
  types,
  assigned,
}: {
  coaches: { id: string; full_name: string }[];
  types: { id: string; name: string }[];
  assigned: { coachId: string; id: string }[];
}) {
  const assignedKeys = new Set(assigned.map((row) => `${row.coachId}:${row.id}`));

  return (
    <Panel title="派工作類型">
      <p className="mb-3 text-sm text-stone-500">
        勾選每位同事可以做嘅工作，例如 Admin、PT、MIIT。員工簽到時只可以報這裡勾選的類型。
      </p>
      {types.length === 0 ? (
        <p className="text-sm text-stone-500">
          尚未有工作類型。請先到設定的「課堂類型」新增 Admin、PT、MIIT。
        </p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {coaches.map((coach) => (
            <li key={coach.id} className="py-3">
              <ActionForm action={saveStaffWorkTypesAction} className="space-y-2">
                <input type="hidden" name="coach_id" value={coach.id} />
                <p className="text-sm font-semibold text-stone-900">{coach.full_name}</p>
                <div className="flex flex-wrap gap-2">
                  {types.map((type) => (
                    <label
                      key={type.id}
                      className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-800 shadow-sm"
                    >
                      <input
                        type="checkbox"
                        name="lesson_type_id"
                        value={type.id}
                        defaultChecked={assignedKeys.has(`${coach.id}:${type.id}`)}
                        className="size-4 rounded border-stone-300"
                      />
                      {type.name}
                    </label>
                  ))}
                </div>
                <SubmitButton variant="secondary">儲存</SubmitButton>
              </ActionForm>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
