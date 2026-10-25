"use client";

import { useState } from "react";
import type { DemoShop } from "@/lib/demo/shops";
import { ring } from "./AdvisorPanel";

// Nearby repair shops: a stylized map (no map API or key needed, so it works offline at the demo)
// next to a ranked list. Selecting a shop highlights its pin.
export default function ShopFinder({ shops }: { shops: DemoShop[] }) {
  const [active, setActive] = useState(0);

  return (
    <div className="grid grid-cols-[190px_1fr] gap-3">
      <div className="relative h-[196px] overflow-hidden rounded-xl bg-[#eef1ee]" aria-hidden>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <path d="M-5 78 C 20 70, 35 88, 55 74 S 85 60, 105 66" fill="none" stroke="#c9dceb" strokeWidth="7" />
          <path d="M0 20 L100 26 M0 50 L100 46 M30 0 L26 100 M62 0 L70 100" stroke="#fff" strokeWidth="3.2" />
          <path d="M0 35 L100 38 M14 0 L10 100 M84 0 L88 100 M45 0 L48 100" stroke="#fff" strokeWidth="1.6" />
          <path d="M-5 92 L 105 8" stroke="#f3dca6" strokeWidth="3.6" />
        </svg>
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <span className="absolute -inset-2 animate-ping rounded-full bg-sky-400/40" />
          <span className="relative block h-3.5 w-3.5 rounded-full border-2 border-white bg-sky-500 shadow" />
        </span>
        {shops.map((s, i) => (
          <span key={s.name} className="absolute -translate-x-1/2 -translate-y-full transition-transform" style={{ left: `${s.x}%`, top: `${s.y}%`, transform: `translate(-50%, -100%) scale(${i === active ? 1.18 : 1})` }}>
            <svg viewBox="0 0 24 30" className="h-8 w-[26px] drop-shadow">
              <path d="M12 29s10-9.3 10-17A10 10 0 0 0 2 12c0 7.7 10 17 10 17z" fill={s.kind === "dealer" ? "#EB0A1E" : i === active ? "#111" : "#3f3f46"} />
              <text x="12" y="15.5" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">{i + 1}</text>
            </svg>
          </span>
        ))}
        <span className="absolute bottom-1.5 left-2 rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-500">Sample locations</span>
      </div>

      <ol className="space-y-1.5">
        {shops.map((s, i) => (
          <li key={s.name}>
            <button onClick={() => setActive(i)} onMouseEnter={() => setActive(i)}
              className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2 text-left transition ${i === active ? "border-neutral-900 bg-white shadow-sm" : "border-neutral-200 hover:border-neutral-400"} ${ring}`}>
              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${s.kind === "dealer" ? "bg-[#EB0A1E]" : "bg-neutral-800"}`}>{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[14px] font-bold">{s.name}</span>
                  {s.kind === "dealer" && <span className="shrink-0 rounded-full bg-red-50 px-1.5 py-px text-[10px] font-bold text-[#c8091a]">TOYOTA</span>}
                </span>
                <span className="block text-[12px] text-neutral-600">
                  {s.distanceMi} mi · <span className="text-amber-500">★</span> {s.rating} ({s.reviews.toLocaleString()}) · {s.hours}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
