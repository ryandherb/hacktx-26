"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { bankAccountsFor, connectBank, type BankSnapshot } from "@/lib/advisor/service";

// Demo bank-connection window in the style of consumer account-linking flows.
// It is SIMULATED (Capital One Nessie sandbox data from lib/demo/bank.ts) and deliberately has
// no username/password fields: a realistic login form that accepts credentials is a phishing pattern.

type Screen = "consent" | "select" | "authorize" | "connecting" | "accounts" | "success";
type Props = { profileId: string; firstName: string; onClose: () => void; onConnected: (s: BankSnapshot) => void };

const ring = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#EB0A1E]";
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

const BANKS = [
  { id: "capone", name: "Capital One", sub: "capitalone.com", color: "#004879", available: true },
  { id: "lonestar", name: "Lone Star Federal Credit Union", sub: "Demo institution", color: "#7a5c2e", available: false },
  { id: "hillcountry", name: "Hill Country Bank", sub: "Demo institution", color: "#2f6b4f", available: false },
  { id: "bayou", name: "Bayou Savings & Loan", sub: "Demo institution", color: "#5b3f8c", available: false },
];

const CONNECT_STEPS = ["Establishing secure connection", "Verifying your identity", "Retrieving accounts", "ToyotaAI is analyzing your finances"];

function BankMark({ color, name, size = 44 }: { color: string; name: string; size?: number }) {
  const initials = name.split(" ").filter((w) => /^[A-Z]/.test(w)).slice(0, 2).map((w) => w[0]).join("");
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full font-bold text-white" style={{ background: color, width: size, height: size, fontSize: size * 0.36 }}>
      {initials}
    </span>
  );
}

function ToyotaMark({ size = 56 }: { size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/toyota-emblem.png" alt="" aria-hidden width={size} height={size} className="rounded-2xl shadow-md" />;
}

function Lock({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden><rect x="3" y="7" width="10" height="7.5" rx="1.6" fill="currentColor" /><path d="M5.2 7V5.2a2.8 2.8 0 015.6 0V7" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
  );
}

function PrimaryButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`w-full rounded-xl bg-neutral-950 py-3.5 text-[16px] font-bold text-white transition hover:bg-neutral-800 disabled:bg-neutral-300 ${ring}`}>
      {children}
    </button>
  );
}

export default function BankConnectModal({ profileId, firstName, onClose, onConnected }: Props) {
  const [screen, setScreen] = useState<Screen>("consent");
  const [shown, setShown] = useState(false);
  const [query, setQuery] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [stage, setStage] = useState(0);
  const { customerMask, accounts } = useMemo(() => bankAccountsFor(profileId), [profileId]);
  const [picked, setPicked] = useState<string[]>(() => accounts.map((a) => a.id));
  const [snapshot, setSnapshot] = useState<BankSnapshot | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Enter animation, focus trap, Esc to close.
  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(true));
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return closeRef.current();
      if (e.key !== "Tab") return;
      const f = Array.from(panel.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input") ?? []);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { cancelAnimationFrame(t); document.removeEventListener("keydown", onKey); prev?.focus(); };
  }, []);

  useEffect(() => { panel.current?.querySelector<HTMLElement>("h2")?.focus(); }, [screen]);

  // Simulated connection progress.
  useEffect(() => {
    if (screen !== "connecting") return;
    setStage(0);
    const timers = CONNECT_STEPS.map((_, i) => setTimeout(() => setStage(i + 1), 750 * (i + 1)));
    const done = setTimeout(() => setScreen("accounts"), 750 * CONNECT_STEPS.length + 350);
    return () => { timers.forEach(clearTimeout); clearTimeout(done); };
  }, [screen]);

  const back: Partial<Record<Screen, Screen>> = { select: "consent", authorize: "select", accounts: "authorize" };
  const banks = BANKS.filter((b) => b.name.toLowerCase().includes(query.trim().toLowerCase()));

  const finishConnect = async () => {
    const r = await connectBank(profileId, picked);
    setSnapshot(r.data);
    setScreen("success");
  };

  return (
    <div className={`fixed inset-0 z-[60] flex items-center justify-center transition-colors sm:p-4 duration-300 ${shown ? "bg-neutral-950/55 backdrop-blur-[3px]" : "bg-transparent"}`}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="bank-title"
        className={`relative flex h-[100dvh] w-full flex-col overflow-hidden sm:h-[620px] sm:max-h-[calc(100dvh-32px)] sm:w-[400px] sm:max-w-full sm:rounded-[22px] bg-white shadow-[0_30px_90px_rgba(0,0,0,0.35)] transition duration-300 ease-out ${shown ? "translate-y-0 scale-100 opacity-100" : "translate-y-3 scale-[0.97] opacity-0"}`}>

        {/* Top bar */}
        <div className="flex h-14 shrink-0 items-center justify-between px-3">
          <button onClick={() => back[screen] && setScreen(back[screen]!)} aria-label="Back"
            className={`flex h-11 w-11 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100 ${back[screen] ? "" : "invisible"} ${ring}`}>
            <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <span className="flex items-center gap-1.5 text-[12px] font-semibold text-neutral-500"><Lock /> Secure connection</span>
          <button onClick={onClose} aria-label="Close bank connection" className={`flex h-11 w-11 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100 ${ring}`}>
            <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-7 pb-6">
          {screen === "consent" && (
            <>
              <div className="mt-4 flex items-center justify-center gap-3">
                <ToyotaMark />
                <span aria-hidden className="relative h-1 w-16 overflow-hidden">
                  <span className="absolute inset-0 animate-[pulse_1.6s_ease-in-out_infinite] bg-[radial-gradient(circle,#a3a3a3_1.5px,transparent_2px)] bg-[length:8px_4px] bg-repeat-x" />
                </span>
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-800 shadow-md">
                  <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden><path d="M3 9.5 12 4l9 5.5M5 10v8m4.7-8v8m4.6-8v8M19 10v8M3.5 20.5h17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
              </div>
              <h2 id="bank-title" tabIndex={-1} className="mt-7 text-center text-[24px] font-extrabold leading-tight tracking-tight outline-none">
                Let ToyotaAI connect to your finances
              </h2>
              <ul className="mt-7 space-y-5">
                {[
                  ["Secure", "Your connection is encrypted end to end.", "M12 3l7 3v5c0 4.4-3 8.3-7 9.5C8 19.3 5 15.4 5 11V6l7-3z"],
                  ["Private", "Read-only access. ToyotaAI never sees your bank login.", "M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 14.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"],
                  ["In your control", "Disconnect any time from your Toyota account.", "M12 4v8m5.7-5.7a8 8 0 11-11.4 0"],
                ].map(([t, d, path]) => (
                  <li key={t} className="flex gap-3.5">
                    <svg viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0 text-neutral-800" aria-hidden><path d={path} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    <p className="text-[14px] leading-snug text-neutral-600"><span className="font-bold text-neutral-900">{t}</span><br />{d}</p>
                  </li>
                ))}
              </ul>
              <div className="mt-auto">
                <p className="mb-3 text-center text-[11px] leading-snug text-neutral-500">
                  By selecting &ldquo;Continue&rdquo; you agree to share read-only account data with ToyotaAI.
                </p>
                <PrimaryButton onClick={() => setScreen("select")}>Continue</PrimaryButton>
              </div>
            </>
          )}

          {screen === "select" && (
            <>
              <h2 id="bank-title" tabIndex={-1} className="text-[22px] font-extrabold tracking-tight outline-none">Select your bank</h2>
              <label className="mt-4 flex items-center gap-2 rounded-xl bg-neutral-100 px-3.5 focus-within:ring-2 focus-within:ring-neutral-800">
                <svg viewBox="0 0 20 20" className="h-4 w-4 text-neutral-500" aria-hidden><circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="m13.5 13.5 3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                <span className="sr-only">Search banks</span>
                <input value={query} onChange={(e) => { setQuery(e.target.value); setNote(null); }} placeholder="Search"
                  className="w-full bg-transparent py-3 text-base outline-none sm:text-[15px] placeholder:text-neutral-500" />
              </label>
              <ul className="mt-3 min-h-0 flex-1 overflow-y-auto">
                {banks.map((b) => (
                  <li key={b.id}>
                    <button onClick={() => (b.available ? setScreen("authorize") : setNote(`${b.name} isn't available in this demo.`))}
                      className={`flex w-full items-center gap-3.5 rounded-xl px-2 py-3 text-left hover:bg-neutral-50 ${b.available ? "" : "opacity-55"} ${ring}`}>
                      <BankMark color={b.color} name={b.name} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-bold">{b.name}</span>
                        <span className="block text-[13px] text-neutral-500">{b.sub}</span>
                      </span>
                      {b.available && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">Sandbox</span>}
                    </button>
                  </li>
                ))}
                {!banks.length && <li className="px-2 py-6 text-center text-sm text-neutral-500">No banks match &ldquo;{query}&rdquo;.</li>}
              </ul>
              <p role="status" className="min-h-5 pt-2 text-center text-[13px] text-neutral-600">{note}</p>
            </>
          )}

          {screen === "authorize" && (
            <>
              <div className="mt-6 flex flex-col items-center">
                <BankMark color="#004879" name="Capital One" size={64} />
                <h2 id="bank-title" tabIndex={-1} className="mt-5 text-center text-[22px] font-extrabold leading-tight tracking-tight outline-none">
                  Authorize access to Capital One
                </h2>
                <p className="mt-2 text-center text-[14px] text-neutral-600">We found a sandbox account for {firstName}.</p>
              </div>
              <div className="mt-6 flex items-center gap-3.5 rounded-2xl border border-neutral-200 p-4">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-neutral-100 text-[16px] font-bold">{firstName[0]}</span>
                <span className="flex-1">
                  <span className="block text-[15px] font-bold">{firstName}</span>
                  <span className="block text-[13px] text-neutral-500">Customer ID •••• {customerMask}</span>
                </span>
                <svg viewBox="0 0 20 20" className="h-5 w-5 text-emerald-600" aria-hidden><circle cx="10" cy="10" r="9" fill="currentColor" /><path d="m6 10.2 2.6 2.6L14.2 7" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <p className="mt-4 text-[13px] leading-snug text-neutral-500">
                ToyotaAI will see balances and 90 days of transactions. It can&rsquo;t move money or make changes.
              </p>
              <div className="mt-auto">
                <p className="mb-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-neutral-500"><Lock className="h-3 w-3" /> Demo: no username or password needed</p>
                <PrimaryButton onClick={() => setScreen("connecting")}>Authorize read-only access</PrimaryButton>
              </div>
            </>
          )}

          {screen === "connecting" && (
            <div className="flex flex-1 flex-col items-center justify-center" aria-live="polite">
              <div className="relative h-20 w-20">
                <svg viewBox="0 0 80 80" className="absolute inset-0 h-full w-full animate-spin [animation-duration:1.1s]" aria-hidden>
                  <circle cx="40" cy="40" r="34" fill="none" stroke="#eee" strokeWidth="6" />
                  <path d="M40 6a34 34 0 0 1 34 34" fill="none" stroke="#111" strokeWidth="6" strokeLinecap="round" />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-neutral-800"><Lock className="h-6 w-6" /></span>
              </div>
              <h2 id="bank-title" tabIndex={-1} className="mt-7 text-[22px] font-extrabold tracking-tight outline-none">Connecting to Capital One</h2>
              <ul className="mt-6 w-full space-y-3">
                {CONNECT_STEPS.map((s, i) => (
                  <li key={s} className={`flex items-center gap-3 text-[14px] transition-colors ${i < stage ? "text-neutral-900" : i === stage ? "text-neutral-700" : "text-neutral-400"}`}>
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full ${i < stage ? "bg-emerald-600" : i === stage ? "border-2 border-neutral-800" : "border-2 border-neutral-300"}`}>
                      {i < stage && <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden><path d="m2.5 6.3 2.2 2.2 4.8-5" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {screen === "accounts" && (
            <>
              <h2 id="bank-title" tabIndex={-1} className="text-[22px] font-extrabold tracking-tight outline-none">Select accounts to share</h2>
              <p className="mt-1 text-[14px] text-neutral-600">Capital One · {accounts.length} accounts found</p>
              <ul className="mt-5 space-y-2.5">
                {accounts.map((a) => {
                  const on = picked.includes(a.id);
                  return (
                    <li key={a.id}>
                      <button role="checkbox" aria-checked={on}
                        onClick={() => setPicked((p) => (on ? p.filter((x) => x !== a.id) : [...p, a.id]))}
                        className={`flex w-full items-center gap-3.5 rounded-2xl border-2 p-4 text-left transition ${on ? "border-neutral-900" : "border-neutral-200"} ${ring}`}>
                        <span className={`flex h-5 w-5 items-center justify-center rounded-md border-2 ${on ? "border-neutral-900 bg-neutral-900" : "border-neutral-300"}`}>
                          {on && <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden><path d="m2.5 6.3 2.2 2.2 4.8-5" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                        </span>
                        <span className="flex-1">
                          <span className="block text-[15px] font-bold">{a.type}</span>
                          <span className="block text-[13px] text-neutral-500">•••• {a.mask}</span>
                        </span>
                        <span className="text-[15px] font-bold">{money(a.balance)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-auto">
                <PrimaryButton onClick={finishConnect} disabled={!picked.length}>Connect {picked.length === 1 ? "account" : "accounts"}</PrimaryButton>
              </div>
            </>
          )}

          {screen === "success" && snapshot && (
            <>
              <div className="flex flex-1 flex-col items-center justify-center text-center">
                <span className="flex h-20 w-20 animate-[bounce_0.6s_ease-out_1] items-center justify-center rounded-full bg-emerald-600 shadow-[0_10px_30px_rgba(5,150,105,0.35)]">
                  <svg viewBox="0 0 24 24" className="h-10 w-10" aria-hidden><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
                <h2 id="bank-title" tabIndex={-1} className="mt-7 text-[24px] font-extrabold tracking-tight outline-none">Success!</h2>
                <p className="mt-2 text-[15px] text-neutral-600">
                  ToyotaAI can now see your income, spending, and savings.<br />
                  {snapshot.transactionCount} recent transactions analyzed.
                </p>
              </div>
              <PrimaryButton onClick={() => onConnected(snapshot)}>Continue</PrimaryButton>
            </>
          )}

          <p className="mt-3 text-center text-[10px] uppercase tracking-[0.12em] text-neutral-400">Demo data · Capital One sandbox</p>
        </div>
      </div>
    </div>
  );
}
