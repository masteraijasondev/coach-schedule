"use client";

import { Alert } from "@/components/alert";
import { buttonTone } from "@/components/button-styles";
import { LoadingSpinner } from "@/components/loading-spinner";
import { resyncAirtableLessonPayAction } from "@/actions/lesson-pay";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Props = {
  period: string;
  coachId?: string;
};

export function ResyncAirtablePayButton({ period, coachId }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [pending, startTransition] = useTransition();
  const scopeLabel = coachId ? "此同事" : "全部同事";

  function run() {
    setError(null);
    setSummary(null);
    setAsking(false);
    startTransition(async () => {
      try {
        const result = await resyncAirtableLessonPayAction({
          period,
          ...(coachId ? { coachId } : {}),
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        const { updated, unchanged, skipped } = result.data;
        setSummary(
          `已更新 ${updated} 堂 · 無需改 ${unchanged} · 略過 ${skipped}`,
        );
        router.refresh();
      } catch (err) {
        console.error("[ResyncAirtablePayButton]", { error: err });
        setError("跟 Airtable 重算失敗");
      }
    });
  }

  return (
    <div className="space-y-2">
      {asking ? (
        <div className="space-y-2">
          <Alert variant="filled" severity="warning">
            會用而家 Airtable 學費 × 分成，覆寫此結算期{scopeLabel}
            已簽到 PT／MIIT 課堂嘅學費同人工。確定要繼續？
          </Alert>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              className={buttonTone.primary}
              onClick={run}
            >
              {pending ? (
                <>
                  <LoadingSpinner size="sm" label="重算中…" />
                  <span>重算中…</span>
                </>
              ) : (
                "確定重算"
              )}
            </button>
            <button
              type="button"
              disabled={pending}
              className={buttonTone.secondary}
              onClick={() => setAsking(false)}
            >
              返回
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={pending}
          className={buttonTone.secondary}
          onClick={() => {
            setSummary(null);
            setError(null);
            setAsking(true);
          }}
        >
          跟 Airtable 重算 PT／MIIT
        </button>
      )}
      {summary ? (
        <Alert variant="filled" severity="success">
          {summary}
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="filled" severity="error">
          {error}
        </Alert>
      ) : null}
    </div>
  );
}
