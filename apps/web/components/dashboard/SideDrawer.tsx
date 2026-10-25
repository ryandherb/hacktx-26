"use client";

import { useEffect, useRef } from "react";

type Props = { open: boolean; onClose: () => void; title: string; closeLabel: string; children: React.ReactNode };

// Accessible right-side modal drawer: focus moves in on open, Esc closes, Tab is trapped, focus returns to trigger.
export default function SideDrawer({ open, onClose, title, closeLabel, children }: Props) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(panel.current?.querySelectorAll<HTMLElement>("button, [href], [tabindex]:not([tabindex='-1'])") ?? []);
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      if (e.key !== "Tab") return;
      const f = focusables();
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); prev?.focus(); };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="drawer-title" className="h-full w-full max-w-md overflow-y-auto overscroll-contain bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between">
          <h2 id="drawer-title" className="text-2xl font-extrabold tracking-tight text-black">{title}</h2>
          <button onClick={onClose} className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded text-neutral-600 hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#eb0a1e]" aria-label={closeLabel}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
