"use client";

import { useEffect, useRef } from "react";

/**
 * Runs `fn` now, then every `ms` while the tab is visible, and again whenever the tab regains focus, so
 * lists stay current without a manual reload.
 */
export function usePolling(fn: () => void | Promise<void>, ms = 8000, enabled = true) {
  const latest = useRef(fn);
  useEffect(() => {
    latest.current = fn;
  });

  useEffect(() => {
    if (!enabled) return;
    const run = () => {
      if (document.visibilityState === "visible") void latest.current();
    };
    run();
    const timer = setInterval(run, ms);
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", run);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", run);
    };
  }, [ms, enabled]);
}
