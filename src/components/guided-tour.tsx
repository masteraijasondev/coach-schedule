"use client";

import type { TourStep } from "@/lib/tours";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

const HELP_SLOT_ID = "tour-help-slot";

function seenKey(storageKey: string): string {
  return `sik-tour:${storageKey}`;
}

function readSeen(storageKey: string): boolean {
  try {
    return window.localStorage.getItem(seenKey(storageKey)) === "1";
  } catch {
    return false;
  }
}

function markSeen(storageKey: string) {
  try {
    window.localStorage.setItem(seenKey(storageKey), "1");
  } catch {
    // Closing still ends the tour for this visit.
  }
}

function visibleTarget(id: string): HTMLElement | null {
  const nodes = document.querySelectorAll(`[data-tour="${id}"]`);
  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) {
      continue;
    }
    const rect = node.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return node;
    }
  }
  return null;
}

export function GuidedTour({
  storageKey,
  steps,
}: {
  storageKey: string;
  steps: TourStep[];
}) {
  const titleId = useId();
  const nextRef = useRef<HTMLButtonElement>(null);
  const focusedStep = useRef<string | null>(null);
  const scrolledStep = useRef<string | null>(null);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [index, setIndex] = useState(0);
  const [helpSlot, setHelpSlot] = useState<HTMLElement | null>(null);
  const [box, setBox] = useState<DOMRect | null>(null);
  const [nextReady, setNextReady] = useState(false);
  const [noteHeight, setNoteHeight] = useState(180);
  const noteRef = useRef<HTMLDivElement>(null);

  const step = steps[index];

  useEffect(() => {
    setHelpSlot(document.getElementById(HELP_SLOT_ID));
    if (!readSeen(storageKey)) {
      setOpen(true);
    }
    setReady(true);
  }, [storageKey]);

  useEffect(() => {
    function reopen() {
      setIndex(0);
      setBox(null);
      focusedStep.current = null;
      scrolledStep.current = null;
      setOpen(true);
    }
    window.addEventListener("sik-tour-open", reopen);
    return () => window.removeEventListener("sik-tour-open", reopen);
  }, []);

  useEffect(() => {
    if (!open || !step) {
      return;
    }
    function place() {
      const current = visibleTarget(step.id);
      setBox(current ? current.getBoundingClientRect() : null);
      const next = steps[index + 1];
      setNextReady(next == null || visibleTarget(next.id) != null);
      if (current && scrolledStep.current !== step.id) {
        scrolledStep.current = step.id;
        current.scrollIntoView({ block: "nearest" });
      }
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, step, index, steps]);

  const last = index === steps.length - 1;

  useEffect(() => {
    if (!open || !step || !box) {
      return;
    }
    if (focusedStep.current === step.id) {
      return;
    }
    focusedStep.current = step.id;
    if (last || nextReady) {
      nextRef.current?.focus();
    }
  }, [open, step, box, last, nextReady]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        markSeen(storageKey);
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, storageKey]);

  useEffect(() => {
    const note = noteRef.current;
    if (!note) {
      return;
    }
    setNoteHeight((current) =>
      current === note.offsetHeight ? current : note.offsetHeight,
    );
  }, [open, index, box, nextReady]);

  function close() {
    markSeen(storageKey);
    setOpen(false);
  }

  const helpButton = helpSlot
    ? createPortal(
        <button
          type="button"
          className="inline-flex min-h-11 items-center rounded-md border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-800 hover:bg-stone-50"
          onClick={() => {
            window.dispatchEvent(new Event("sik-tour-open"));
          }}
        >
          使用說明
        </button>,
        helpSlot,
      )
    : null;

  if (!ready) {
    return helpButton;
  }

  const noteWidth = Math.min(320, typeof window === "undefined" ? 320 : window.innerWidth - 16);
  let noteTop = 16;
  let noteLeft = 8;
  if (box && typeof window !== "undefined") {
    const margin = 12;
    noteLeft = Math.min(Math.max(8, box.left), window.innerWidth - noteWidth - 8);
    const below = box.bottom + margin;
    const above = box.top - margin - noteHeight;
    const fillsScreen = box.height > window.innerHeight * 0.7;
    if (fillsScreen || below + noteHeight > window.innerHeight - 8) {
      noteTop = above >= 8 ? above : window.innerHeight - noteHeight - 8;
    } else {
      noteTop = below;
    }
  } else if (typeof window !== "undefined") {
    noteTop = window.innerHeight - noteHeight - 8;
    noteLeft = 8;
  }

  return (
    <>
      {helpButton}
      {open && step
        ? createPortal(
            <div className="pointer-events-none fixed inset-0 z-40">
              {box ? (
                <div
                  aria-hidden
                  className="pointer-events-none fixed rounded-lg ring-2 ring-white"
                  style={{
                    top: box.top - 4,
                    left: box.left - 4,
                    width: box.width + 8,
                    height: box.height + 8,
                    boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.45)",
                  }}
                />
              ) : null}
              <div
                ref={noteRef}
                role="dialog"
                aria-modal="false"
                aria-labelledby={titleId}
                className="pointer-events-auto fixed z-10 rounded-lg border border-stone-200 bg-white p-4 text-stone-900 shadow-sm"
                style={{ top: noteTop, left: noteLeft, width: noteWidth }}
              >
                <p id={titleId} className="text-base font-semibold">
                  {step.title}
                </p>
                <p className="mt-1 text-sm text-stone-600">{step.body}</p>
                <p className="mt-2 text-xs text-stone-500">
                  {index + 1} / {steps.length}
                </p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="min-h-11 rounded-md px-3 text-sm font-semibold text-stone-600 hover:bg-stone-100"
                    onClick={close}
                  >
                    略過
                  </button>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="min-h-11 rounded-md border border-stone-300 px-3 text-sm font-semibold disabled:opacity-40"
                      disabled={index === 0}
                      onClick={() => {
                        focusedStep.current = null;
                        scrolledStep.current = null;
                        setBox(null);
                        setIndex((current) => Math.max(0, current - 1));
                      }}
                    >
                      返回
                    </button>
                    <button
                      ref={nextRef}
                      type="button"
                      className="min-h-11 rounded-md bg-stone-900 px-3 text-sm font-semibold text-white disabled:opacity-40"
                      disabled={!last && (box == null || !nextReady)}
                      onClick={() => {
                        if (last) {
                          close();
                          return;
                        }
                        focusedStep.current = null;
                        scrolledStep.current = null;
                        setBox(null);
                        setIndex((current) => current + 1);
                      }}
                    >
                      {last ? "完成" : "下一步"}
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
