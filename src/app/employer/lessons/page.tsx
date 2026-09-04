import { EmployerAssignPanel } from "@/components/employer-assign-panel";
import { EmployerCoachPicker } from "@/components/employer-coach-picker";
import { EmployerLessonList } from "@/components/employer-lesson-list";
import { LoadingSpinner } from "@/components/loading-spinner";
import { EnsureStudentDirectory } from "@/components/student-directory-provider";
import { Panel } from "@/components/ui";
import { requireEmployer } from "@/lib/auth";
import {
  availabilityWeekDays,
  availabilityWeekStart,
  hongKongToday,
  parseAvailabilityWeekParam,
  shiftAvailabilityWeek,
} from "@/lib/calendar";
import { createClient } from "@/lib/supabase/server";
import { Suspense } from "react";

type Props = {
  searchParams: Promise<{ coach?: string; week?: string; listWeek?: string }>;
};

function lessonsHref(
  coachId: string,
  opts: { week?: string; listWeek?: string },
) {
  const query = new URLSearchParams({ coach: coachId });
  if (opts.week) {
    query.set("week", opts.week);
  }
  if (opts.listWeek) {
    query.set("listWeek", opts.listWeek);
  }
  return `/employer/lessons?${query.toString()}`;
}

function LessonsPanelFallback({ title }: { title: string }) {
  return (
    <Panel title={title}>
      <div className="flex items-center gap-2 py-6 text-sm text-stone-500">
        <LoadingSpinner size="sm" />
        載入中…
      </div>
    </Panel>
  );
}

export default async function LessonsPage({ searchParams }: Props) {
  await requireEmployer();
  const params = await searchParams;
  const today = hongKongToday();
  const week = parseAvailabilityWeekParam(params.week);
  const listWeek = parseAvailabilityWeekParam(params.listWeek);
  const currentWeek = availabilityWeekStart();
  const days = availabilityWeekDays(week);
  const weekEnd = days[6];
  const prevWeek = shiftAvailabilityWeek(week, -1);
  const nextWeek = shiftAvailabilityWeek(week, 1);
  const listWeekDays = availabilityWeekDays(listWeek);
  const listWeekEnd = listWeekDays[6];
  const prevListWeek = shiftAvailabilityWeek(listWeek, -1);
  const nextListWeek = shiftAvailabilityWeek(listWeek, 1);
  const preservedWeek = params.week ? week : undefined;
  const preservedListWeek = params.listWeek ? listWeek : undefined;

  const supabase = await createClient();
  const [{ data: types }, { data: coaches }] = await Promise.all([
    supabase
      .from("lesson_types")
      .select("id, name, default_duration_minutes, pay_mode")
      .eq("active", true)
      .order("name"),
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("role", "coach")
      .order("full_name"),
  ]);

  const selectedCoach =
    (coaches ?? []).find((coach) => coach.id === params.coach) ?? null;
  const lessonTypes = (types ?? []).map((type) => ({
    id: type.id,
    name: type.name,
    pay_mode: type.pay_mode,
    default_duration_minutes: type.default_duration_minutes,
  }));

  return (
    <div className="space-y-6">
      <Panel title="派更">
        <p className="mb-3 text-sm text-stone-500">
          先選擇教練，再按其可返工時段派更。時段必須完全落在已報可返工範圍內；放假日不可派。派更後為「待員工確認」，員工確認後才計入薪資。金額可後補。
        </p>
        <EmployerCoachPicker
          coaches={coaches ?? []}
          selectedCoachId={selectedCoach?.id}
          week={preservedWeek}
          listWeek={preservedListWeek}
        />
      </Panel>

      {selectedCoach ? (
        <>
          <EnsureStudentDirectory />
          <Suspense
            key={`${selectedCoach.id}-avail-${week}`}
            fallback={
              <LessonsPanelFallback title={`${selectedCoach.full_name} 的可返工`} />
            }
          >
            <EmployerAssignPanel
              coachId={selectedCoach.id}
              coachName={selectedCoach.full_name}
              week={week}
              weekEnd={weekEnd}
              days={days}
              today={today}
              prevWeekHref={lessonsHref(selectedCoach.id, {
                week: prevWeek,
                listWeek: preservedListWeek,
              })}
              nextWeekHref={lessonsHref(selectedCoach.id, {
                week: nextWeek,
                listWeek: preservedListWeek,
              })}
              currentWeekHref={lessonsHref(selectedCoach.id, {
                week: currentWeek,
                listWeek: preservedListWeek,
              })}
              isCurrentWeek={week === currentWeek}
              types={lessonTypes}
            />
          </Suspense>

          <Suspense
            key={`${selectedCoach.id}-list-${listWeek}`}
            fallback={
              <LessonsPanelFallback
                title={`${selectedCoach.full_name} 的派更列表`}
              />
            }
          >
            <EmployerLessonList
              coachId={selectedCoach.id}
              coachName={selectedCoach.full_name}
              listWeek={listWeek}
              listWeekEnd={listWeekEnd}
              prevListWeekHref={lessonsHref(selectedCoach.id, {
                week: preservedWeek,
                listWeek: prevListWeek,
              })}
              nextListWeekHref={lessonsHref(selectedCoach.id, {
                week: preservedWeek,
                listWeek: nextListWeek,
              })}
              currentListWeekHref={lessonsHref(selectedCoach.id, {
                week: preservedWeek,
                listWeek: currentWeek,
              })}
              isCurrentListWeek={listWeek === currentWeek}
              types={lessonTypes}
            />
          </Suspense>
        </>
      ) : null}
    </div>
  );
}
