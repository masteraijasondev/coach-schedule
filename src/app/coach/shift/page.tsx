import { redirect } from "next/navigation";

type Props = {
  searchParams: Promise<{ week?: string }>;
};

export default async function CoachShiftPage({ searchParams }: Props) {
  const { week } = await searchParams;
  redirect(week ? `/coach?week=${week}#availability` : "/coach#availability");
}
