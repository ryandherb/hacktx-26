"use client";

import { useEffect, useState } from "react";
import {
  CUSTOM_MODEL, EMPTY_FORM, MAX_YEAR, MIN_YEAR, SAMPLE_FORM, toCustomProfile, toForm,
  type CustomProfile, type CustomProfileForm, type FormErrors,
} from "@/lib/demo/customProfile";
import SideDrawer from "./SideDrawer";

const ring = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#EB0A1E]";
const inputCls = "mt-1.5 w-full rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-base outline-none placeholder:text-neutral-500 focus:border-neutral-800 focus:ring-1 focus:ring-neutral-800 sm:text-[15px]";

type Props = { open: boolean; onClose: () => void; existing: CustomProfile | null; onSave: (c: CustomProfile) => void };

// "Create your own profile": the judge enters their Camry and rough finances; saved to localStorage.
export default function ProfileDrawer({ open, onClose, existing, onSave }: Props) {
  const [form, setForm] = useState<CustomProfileForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});

  useEffect(() => {
    if (!open) return;
    setForm(existing ? toForm(existing) : EMPTY_FORM);
    setErrors({});
  }, [open, existing]);

  const set = (k: keyof CustomProfileForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: undefined }));
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const r = toCustomProfile(form);
    if (r.ok) return onSave(r.value);
    setErrors(r.errors);
    document.getElementById(`cp-${Object.keys(r.errors)[0]}`)?.focus();
  };

  const field = (k: keyof CustomProfileForm, label: string, opts: { placeholder?: string; money?: boolean; numeric?: boolean; optional?: boolean; maxLength?: number } = {}) => (
    <label className="block">
      <span className="text-[14px] font-bold">{label}{opts.optional && <span className="font-normal text-neutral-500"> (optional)</span>}</span>
      <span className="relative block">
        {opts.money && <span className="pointer-events-none absolute left-4 top-1/2 mt-[3px] -translate-y-1/2 text-neutral-500">$</span>}
        <input id={`cp-${k}`} value={form[k]} onChange={set(k)} placeholder={opts.placeholder} maxLength={opts.maxLength ?? 40}
          inputMode={opts.money || opts.numeric ? "numeric" : undefined} aria-invalid={!!errors[k]} aria-describedby={errors[k] ? `cp-${k}-err` : undefined}
          className={`${inputCls} ${opts.money ? "pl-8" : ""} ${errors[k] ? "border-[#c8091a]" : ""}`} />
      </span>
      {errors[k] && <span id={`cp-${k}-err`} className="mt-1 block text-[13px] text-[#c8091a]">{errors[k]}</span>}
    </label>
  );

  const heading = (t: string, sub?: string) => (
    <div className="pt-2">
      <h3 className="text-[13px] font-bold uppercase tracking-[0.14em] text-neutral-600">{t}</h3>
      {sub && <p className="text-[13px] text-neutral-500">{sub}</p>}
    </div>
  );

  return (
    <SideDrawer open={open} onClose={onClose} title={existing ? "Edit your profile" : "Create your own profile"} closeLabel="Close profile form">
      <p className="mt-1 text-sm text-neutral-600">Try the advisor with your own numbers on a Toyota Camry. Saved only in this browser.</p>
      <button type="button" onClick={() => { setForm(SAMPLE_FORM); setErrors({}); }}
        className={`mt-3 inline-flex min-h-11 items-center gap-1.5 text-[15px] text-neutral-800 hover:text-[#EB0A1E] ${ring}`}>
        <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-neutral-500">Demo</span>
        <span className="underline underline-offset-4">Fill with sample values</span>
      </button>

      <form onSubmit={save} noValidate className="mt-2 space-y-4">
        {heading("About you")}
        {field("firstName", "First name", { placeholder: "Alex", maxLength: 30 })}

        {heading("Your Toyota")}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="text-[14px] font-bold">Model</span>
            <p className={`${inputCls} bg-neutral-100 text-neutral-700`}>Toyota {CUSTOM_MODEL}</p>
          </div>
          {field("vehicleYear", "Year", { placeholder: `${MIN_YEAR}–${MAX_YEAR}`, numeric: true, maxLength: 4 })}
          {field("trim", "Trim", { placeholder: "LE", optional: true })}
          {field("color", "Color", { placeholder: "Silver", optional: true })}
          {field("mileage", "Mileage", { placeholder: "120000", numeric: true, maxLength: 7 })}
          {field("zipCode", "Home ZIP", { placeholder: "78705", numeric: true, maxLength: 5 })}
        </div>
        {field("city", "City", { placeholder: "Austin, TX", optional: true })}
        <div className="grid grid-cols-2 gap-3">
          {field("loanBalance", "Loan balance", { placeholder: "0", money: true, optional: true, maxLength: 7 })}
          {field("monthlyPayment", "Car payment / mo", { placeholder: "0", money: true, optional: true, maxLength: 5 })}
        </div>
        <label className="block">
          <span className="text-[14px] font-bold">What&rsquo;s wrong with it?<span className="font-normal text-neutral-500"> (optional)</span></span>
          <textarea id="cp-openIssue" value={form.openIssue} onChange={set("openIssue")} rows={2} maxLength={200}
            placeholder="For example: A/C blows warm air" className={`${inputCls} resize-none`} />
        </label>

        {heading("Your finances", "Used by the demo bank connection. Rough numbers are fine.")}
        <div className="grid grid-cols-2 gap-3">
          {field("monthlyIncome", "Take-home pay / mo", { placeholder: "4000", money: true, maxLength: 7 })}
          {field("monthlySpending", "Spending / mo", { placeholder: "3000", money: true, maxLength: 7 })}
          {field("checking", "Checking", { placeholder: "0", money: true, optional: true, maxLength: 8 })}
          {field("savings", "Savings", { placeholder: "0", money: true, optional: true, maxLength: 8 })}
          {field("carInsurance", "Car insurance / mo", { placeholder: "120", money: true, optional: true, maxLength: 5 })}
        </div>

        <div className="flex justify-end border-t border-neutral-200 pt-4">
          <button type="submit" className={`rounded-full bg-[#EB0A1E] px-8 py-3 text-[17px] font-bold text-white hover:bg-[#c8091a] ${ring}`}>
            {existing ? "Save changes" : "Create profile"}
          </button>
        </div>
        <p className="text-xs text-neutral-500">Demo only. Estimates, not financial advice.</p>
      </form>
    </SideDrawer>
  );
}
