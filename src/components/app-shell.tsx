import { AppHeader, type NavItem } from "@/components/app-nav";
import { GuidedTour } from "@/components/guided-tour";
import { APP_VERSION } from "@/lib/constants";
type Props = {
  title: string;
  name: string;
  items: NavItem[];
  tone?: "default" | "ops";
  tourRole?: "employer" | "coach";
};

export function AppShell({
  title,
  name,
  items,
  tone = "default",
  tourRole,
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
      {tourRole ? <GuidedTour role={tourRole} /> : null}
      <main className="w-full px-3 py-4 sm:px-4">{children}</main>
      <p
        className={
          ops
            ? "px-3 pb-4 text-center text-xs text-[#525252] sm:px-4"
            : "px-3 pb-4 text-center text-xs text-stone-600 sm:px-4"
        }
      >
        v{APP_VERSION}
      </p>
    </div>
  );
}
