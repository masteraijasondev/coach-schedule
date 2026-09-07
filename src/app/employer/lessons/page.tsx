import { employerCalendarHref } from "@/lib/employer-href";
import { redirect } from "next/navigation";

type Props = {
  searchParams: Promise<{ coach?: string; week?: string; listWeek?: string }>;
};

export default async function LessonsRedirectPage({ searchParams }: Props) {
  const params = await searchParams;
  redirect(
    employerCalendarHref({
      coach: params.coach,
      week: params.week,
      listWeek: params.listWeek,
    }),
  );
}
