"use client";

import { serverNowAction } from "@/actions/clock";
import { useCallback, useEffect, useState } from "react";

const TICK_MS = 15_000;
const REFRESH_MS = 60_000;

type Anchor = {
  epochMs: number;
  receivedAt: number;
};

export function useServerNow(): {
  nowMs: number | null;
  error: string | null;
  retry: () => void;
} {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    serverNowAction()
      .then((epochMs) => {
        if (cancelled) {
          return;
        }
        setAnchor({ epochMs, receivedAt: performance.now() });
        setNowMs(epochMs);
        setError(null);
      })
      .catch((caught) => {
        console.error("[useServerNow] sync", { error: caught });
        if (!cancelled) {
          setError("未能核對公司時間");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    if (!anchor) {
      return;
    }
    const current = anchor;
    function tick() {
      setNowMs(current.epochMs + (performance.now() - current.receivedAt));
    }
    tick();
    const id = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(id);
  }, [anchor]);

  useEffect(() => {
    function refresh() {
      setAttempt((value) => value + 1);
    }
    function onVisible() {
      if (document.visibilityState === "visible") {
        refresh();
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    const id = window.setInterval(refresh, REFRESH_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(id);
    };
  }, []);

  return { nowMs, error, retry };
}
