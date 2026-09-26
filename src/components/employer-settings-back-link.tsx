import { buttonTone } from "@/components/button-styles";
import Link from "next/link";

export function EmployerSettingsBackLink() {
  return (
    <Link href="/employer/settings" className={buttonTone.secondary}>
      ← 設定
    </Link>
  );
}
