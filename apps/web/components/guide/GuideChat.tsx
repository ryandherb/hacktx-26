"use client";

import { useEffect, useRef, useState } from "react";
import { ring } from "@/components/advisor/AdvisorPanel";
import { askGuide } from "@/lib/advisor/service";
import { suggestionsFor } from "@/lib/advisor/guideFaq";
import type { GuideContext, GuideMessage } from "@/lib/api";

const AVATAR = "/advisor/guide-avatar.png";
const EASE = "ease-[cubic-bezier(0.22,0.8,0.2,1)]";
const HINT_KEY = "nextmove:v1:guide-hint-seen";

// Plain-text reply -> paragraphs and "- " bullet lists. Stray **bold** markers are dropped.
function Formatted({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) blocks.push(<ul key={blocks.length} className="list-disc space-y-1 pl-4">{bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>);
    bullets = [];
  };
  for (const raw of text.replace(/\*\*/g, "").split("\n")) {
    const line = raw.trim();
    const bullet = line.match(/^[-•*]\s+(.*)/);
    if (bullet) { bullets.push(bullet[1]); continue; }
    flush();
    if (line) blocks.push(<p key={blocks.length}>{line}</p>);
  }
  flush();
  return <div className="space-y-2">{blocks}</div>;
}

function Avatar({ className }: { className: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={AVATAR} alt="" aria-hidden draggable={false} className={`select-none rounded-full ${className}`} />;
}

// Floating AI guide, bottom-right on every screen of the dashboard. Click the character to open
// the chat; minimize from the header, with Esc, or by clicking the character again. Answers come
// from Muse via POST /guide/chat, or from the built-in FAQ when there's no backend.
export default function GuideChat({ context }: { context: GuideContext }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<GuideMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [usedMuse, setUsedMuse] = useState(false);
  const [hint, setHint] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const list = useRef<HTMLDivElement>(null);

  // A one-time "ask me" nudge per browser session, so people know the character is clickable.
  useEffect(() => {
    try { if (window.sessionStorage.getItem(HINT_KEY)) return; window.sessionStorage.setItem(HINT_KEY, "1"); } catch {}
    const show = setTimeout(() => setHint(true), 1200);
    const hide = setTimeout(() => setHint(false), 7000);
    return () => { clearTimeout(show); clearTimeout(hide); };
  }, []);

  useEffect(() => {
    if (!open) return;
    setHint(false);
    // Skip autofocus on touch screens so the keyboard doesn't jump up on open.
    if (window.matchMedia("(pointer: fine)").matches) field.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  const minimize = () => { setOpen(false); launcher.current?.focus({ preventScroll: true }); };

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || pending) return;
    const next: GuideMessage[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setInput("");
    setPending(true);
    const { data, mocked } = await askGuide(next, context);
    if (!mocked) setUsedMuse(true);
    setMessages((m) => [...m, { role: "assistant", content: data }]);
    setPending(false);
  };

  const greeting = `Hi${context.first_name ? ` ${context.first_name}` : ""}! I'm ToyotaAI. Ask me anything about finding your next move, at any step.`;
  const suggestions = suggestionsFor(context.step, !!context.recommendation);

  return (
    <div className="fixed bottom-4 right-4 z-50 sm:bottom-6 sm:right-6">
      <section id="guide-chat" role="dialog" aria-label="Chat with ToyotaAI" inert={!open}
        onKeyDown={(e) => { if (e.key === "Escape") minimize(); }}
        className={`absolute bottom-full right-0 mb-3 flex h-[min(580px,calc(100dvh-7rem))] w-[min(384px,calc(100vw-2rem))] origin-bottom-right flex-col overflow-hidden rounded-[22px] border border-neutral-200 bg-white text-black shadow-[0_28px_64px_-16px_rgba(0,0,0,0.32),0_8px_20px_-8px_rgba(0,0,0,0.12)] transition-[opacity,transform] duration-200 motion-reduce:transform-none ${EASE} ${open ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none translate-y-2 scale-[0.96] opacity-0"}`}>
        <header className="flex items-center gap-3 border-b border-neutral-100 py-3 pl-4 pr-2">
          <Avatar className="h-10 w-10 ring-2 ring-[#EB0A1E] ring-offset-1" />
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-extrabold leading-tight tracking-tight">ToyotaAI</p>
            <p className="truncate text-[13px] text-neutral-500">Your guide · ask about any step</p>
          </div>
          <button onClick={minimize} aria-label="Minimize chat" title="Minimize"
            className={`flex h-11 w-11 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100 ${ring}`}>
            <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden><path d="M3 12h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </header>

        <div ref={list} aria-live="polite" className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4">
          <div className="flex items-end gap-2">
            <Avatar className="h-7 w-7 shrink-0" />
            <div className="max-w-[85%] rounded-[18px] rounded-bl-md bg-neutral-100 px-3.5 py-2.5 text-[15px] leading-[1.45]">{greeting}</div>
          </div>
          {messages.length === 0 && (
            <div className="flex flex-wrap gap-2 pl-9">
              {suggestions.map((s) => (
                <button key={s} onClick={() => send(s)}
                  className={`rounded-full border border-neutral-300 bg-white px-3.5 py-2 text-left text-[14px] font-semibold leading-snug text-neutral-800 transition-colors hover:border-black ${ring}`}>
                  {s}
                </button>
              ))}
            </div>
          )}
          {messages.map((m, i) => m.role === "user" ? (
            <div key={i} className="flex justify-end motion-safe:animate-[guide-in_220ms_cubic-bezier(0.22,0.8,0.2,1)]">
              <div className="max-w-[85%] whitespace-pre-wrap rounded-[18px] rounded-br-md bg-black px-3.5 py-2.5 text-[15px] leading-[1.45] text-white">{m.content}</div>
            </div>
          ) : (
            <div key={i} className="flex items-end gap-2 motion-safe:animate-[guide-in_220ms_cubic-bezier(0.22,0.8,0.2,1)]">
              <Avatar className="h-7 w-7 shrink-0" />
              <div className="max-w-[85%] rounded-[18px] rounded-bl-md bg-neutral-100 px-3.5 py-2.5 text-[15px] leading-[1.45]"><Formatted text={m.content} /></div>
            </div>
          ))}
          {pending && (
            <div className="flex items-end gap-2" role="status" aria-label="ToyotaAI is typing">
              <Avatar className="h-7 w-7 shrink-0" />
              <div className="flex gap-1 rounded-[18px] rounded-bl-md bg-neutral-100 px-4 py-3.5">
                {[0, 160, 320].map((d) => (
                  <span key={d} className="h-1.5 w-1.5 rounded-full bg-neutral-500 motion-safe:animate-[guide-dot_1.1s_ease-in-out_infinite]" style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
            </div>
          )}
        </div>

        <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="border-t border-neutral-100 px-3 pb-2.5 pt-3">
          <div className="flex items-end gap-2 rounded-[22px] border border-neutral-300 py-1.5 pl-4 pr-1.5 transition-colors focus-within:border-neutral-800 focus-within:ring-1 focus-within:ring-neutral-800">
            <label htmlFor="guide-input" className="sr-only">Ask ToyotaAI a question</label>
            <textarea id="guide-input" ref={field} rows={1} value={input} placeholder="Ask a question…" maxLength={2000}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
              className="max-h-28 min-h-[36px] flex-1 resize-none bg-transparent py-1.5 text-base leading-6 outline-none [field-sizing:content] placeholder:text-neutral-400" />
            <button type="submit" aria-label="Send" disabled={!input.trim() || pending}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EB0A1E] text-white transition-[background-color,transform] duration-150 hover:bg-[#c8091a] active:scale-95 disabled:bg-neutral-200 disabled:text-neutral-400 ${ring}`}>
              <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden><path d="M8 13V3m0 0L3.5 7.5M8 3l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
          <p className="mt-2 text-center text-[12px] text-neutral-500">
            Estimates, not financial advice.{usedMuse && " Answers by Muse."}
          </p>
        </form>
      </section>

      <span aria-hidden className={`pointer-events-none absolute right-full top-1/2 mr-3 -translate-y-1/2 whitespace-nowrap rounded-full bg-black px-4 py-2 text-[14px] font-bold text-white shadow-[0_10px_24px_-8px_rgba(0,0,0,0.4)] transition-[opacity,transform] duration-300 motion-reduce:transform-none ${EASE} ${hint && !open ? "translate-x-0 opacity-100" : "translate-x-2 opacity-0"}`}>
        Questions? Ask me
      </span>
      <button ref={launcher} onClick={() => setOpen((o) => !o)} onMouseEnter={() => !open && setHint(true)} onMouseLeave={() => setHint(false)}
        aria-expanded={open} aria-controls="guide-chat" aria-label={open ? "Minimize chat" : "Ask ToyotaAI a question"}
        className={`relative block h-14 w-14 rounded-full bg-white ring-2 ring-[#EB0A1E] shadow-[0_12px_28px_-6px_rgba(0,0,0,0.35),0_2px_6px_rgba(0,0,0,0.12)] transition-transform duration-200 hover:-translate-y-0.5 active:scale-95 motion-reduce:transform-none sm:h-16 sm:w-16 ${EASE} ${ring}`}>
        <Avatar className="h-full w-full" />
        <span aria-hidden className={`absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black text-white ring-2 ring-white transition-[opacity,transform] duration-200 ${open ? "scale-100 opacity-100" : "scale-50 opacity-0"}`}>
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5"><path d="M3 4.5 6 7.5l3-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
      </button>
    </div>
  );
}
