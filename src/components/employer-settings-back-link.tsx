import Link from "next/link";

export function EmployerSettingsBackLink() {
  return (
    <p className="text-sm">
      <Link href="/employer/settings" className="text-stone-600 underline">
        ← 設定
      </Link>
    </p>
  );
}
