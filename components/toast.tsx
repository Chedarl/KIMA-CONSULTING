"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * Toasts: confirmation that something actually happened.
 *
 * Mutations here are optimistic, so the toast is the receipt. It sits in an
 * aria-live region, because a change the interface makes on your behalf has to
 * be announced, not only drawn.
 */
type Tone = "success" | "error" | "info";
type Toast = { id: number; tone: Tone; text: string };

const ToastContext = createContext<(text: string, tone?: Tone) => void>(() => {});

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((text: string, tone: Tone = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, tone, text }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500);
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex w-[min(92vw,26rem)] -translate-x-1/2 flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rise-in pointer-events-auto flex items-start gap-2.5 rounded-card border px-4 py-3 text-sm shadow-raised backdrop-blur ${
              t.tone === "error"
                ? "border-danger-text/40 bg-danger-soft text-danger-text"
                : t.tone === "info"
                  ? "border-border-strong bg-surface/95 text-fg"
                  : "border-teal-text/40 bg-teal-soft text-teal-text"
            }`}
          >
            <svg
              viewBox="0 0 16 16"
              className="mt-0.5 h-4 w-4 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              {t.tone === "error" ? (
                <>
                  <circle cx="8" cy="8" r="6.4" />
                  <path d="M8 4.8v3.6" strokeLinecap="round" />
                  <circle cx="8" cy="11.3" r="0.6" fill="currentColor" stroke="none" />
                </>
              ) : (
                <>
                  <circle cx="8" cy="8" r="6.4" />
                  <path d="M5.2 8.2 7.2 10.2l3.6-4" strokeLinecap="round" strokeLinejoin="round" />
                </>
              )}
            </svg>
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
