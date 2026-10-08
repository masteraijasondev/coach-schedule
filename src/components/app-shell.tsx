import { AppHeader, type NavItem } from "@/components/app-nav";
import { GuidedTour } from "@/components/guided-tour";
import { APP_VERSION } from "@/lib/constants";
import type { TourStep } from "@/lib/tours";

type Props = {
  title: string;
  name: string;
  items: NavItem[];
  tone?: "default" | "ops";
  tour?: { storageKey: string; steps: TourStep[] };
};

export function AppShell({
  title,
  name,
  items,
  tone = "default",
  tour,
  children,
}: Props & { children: React.ReactNode }) {
  const ops = tone === "ops";
  return (
    <div
      className={
        ops
          ? "min-h-full bg-white text-[#2C2C2C] [font-family:var(--font-barlow),var(--font-noto-sans-tc),sans-serif]"
          : "min-h-full bg-stone-50 text-stone-900"
      }
    >
      <AppHeader title={title} name={name} items={items} tone={tone} />
      {tour ? (
        <GuidedTour storageKey={tour.storageKey} steps={tour.steps} />
      ) : null}
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      <p
        className={
          ops
            ? "px-4 pb-4 text-center text-xs text-[#525252]"
            : "px-4 pb-4 text-center text-xs text-stone-600"
        }
      >
        v{APP_VERSION}
      </p>
    </div>
  );
}
