"use client";
import { useEffect, useRef, type RefObject, type ReactNode } from "react";
const focusable =
  'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]';
/** One focus owner for sheets/popovers, with balanced scroll and focus cleanup. */
export function useFocusBoundary(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  close: () => void,
  returnTo?: HTMLElement | null,
) {
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);
  useEffect(() => {
    if (!open || !ref.current) return;
    const prior =
      returnTo ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const root = ref.current;
    (root.querySelector<HTMLElement>(focusable) ?? root).focus();
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== "Tab") return;
      const items = Array.from(
        root.querySelectorAll<HTMLElement>(focusable),
      ).filter((el) => !el.closest("[inert],[hidden]"));
      const first = items[0],
        last = items.at(-1);
      if (!first) {
        event.preventDefault();
        root.focus();
      } else if (
        event.shiftKey &&
        (document.activeElement === first ||
          !root.contains(document.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !root.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      prior?.focus();
    };
  }, [open, ref, returnTo]);
}
export function StudioDialog({
  title,
  close,
  children,
  kind = "modal",
  returnTo,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
  kind?: string;
  returnTo?: HTMLElement | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusBoundary(ref, true, close, returnTo);
  return (
    <div
      className={`studio-dialog-layer ${kind}`}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="studio-dialog"
      >
        <header>
          <h2>{title}</h2>
          <button aria-label={`Close ${title}`} onClick={close}>
            ×
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
