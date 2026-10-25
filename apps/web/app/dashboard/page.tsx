"use client";

import { useCallback, useEffect, useState } from "react";
import AdvisorIntro from "@/components/advisor/AdvisorIntro";
import AdvisorPanel from "@/components/advisor/AdvisorPanel";
import BankConnectModal from "@/components/advisor/BankConnectModal";
import EstimateStep from "@/components/advisor/EstimateStep";
import MinimizedPill from "@/components/advisor/MinimizedPill";
import OptionsStep from "@/components/advisor/OptionsStep";
import ProblemStep from "@/components/advisor/ProblemStep";
import OptionsPage from "@/components/options/OptionsPage";
import SituationStep from "@/components/advisor/SituationStep";
import CarImage from "@/components/dashboard/CarImage";
import IssuesDrawer from "@/components/dashboard/IssuesDrawer";
import SiteFooter from "@/components/dashboard/SiteFooter";
import ToyotaLogo from "@/components/dashboard/ToyotaLogo";
import VehicleDrawer from "@/components/dashboard/VehicleDrawer";
import { useAdvisorState } from "@/lib/advisor/state";
import { getProfiles, type Profile } from "@/lib/api";
import { DEMO_PROFILE_IDS, MOCK_PROFILES, displayFor } from "@/lib/demo/profiles";
import { clearAssessment, loadSession, saveSession } from "@/lib/demo/session";

const ring = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#EB0A1E]";

const Chevron = () => (
  <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
);

export default function Dashboard() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const advisor = useAdvisorState();

  useEffect(() => {
    let live = true;
    const onlyDemo = (ps: Profile[]) => ps.filter((p) => DEMO_PROFILE_IDS.includes(p.id));
    getProfiles()
      .then((p) => live && setProfiles(onlyDemo(p)))
      .catch(() => { if (live) setProfiles(MOCK_PROFILES); });
    setProfileId(loadSession().profileId);
    return () => { live = false; };
  }, []);

  const profile = profiles.find((p) => p.id === profileId) ?? profiles[0];
  const closeDrawer = useCallback(() => setDrawer(false), []);
  const closeIssues = useCallback(() => setIssuesOpen(false), []);
  const { update: updateAdvisor } = advisor;
  const openAdvisor = () => updateAdvisor({ view: "open" });
  const minimizeAdvisor = useCallback(() => updateAdvisor({ view: "minimized" }), [updateAdvisor]);
  const closeAdvisor = useCallback(() => updateAdvisor({ view: "closed" }), [updateAdvisor]);

  const choose = (id: string) => {
    if (id === profile?.id) return;
    clearAssessment(); // switching people must never mix answers
    advisor.reset();
    setProfileId(id);
    saveSession({ profileId: id });
    setNotice("Switched profile. Assessment progress cleared.");
  };
  const restart = () => { clearAssessment(); advisor.reset(); setNotice("Scenario restarted."); };

  if (!profile) return <main className="p-10 text-neutral-500">Loading…</main>;

  const d = displayFor(profile);
  const title = `${profile.vehicle_year} ${profile.vehicle_model}`;
  const label = `${profile.vehicle_year} Toyota ${profile.vehicle_model}`;
  const advisorStep = { intro: 0, problem: 1, estimate: 1, situation: 2, options: 3 }[advisor.state.step];
  const split = advisor.state.view === "open";
  const optionsPage = advisor.state.optionsPage && !!advisor.state.options;

  return (
    <div className="bg-white text-black">
      {/* First screen: header + dashboard sized to exactly one viewport; the footer sits below it. */}
      <div className="flex h-screen min-h-[640px] flex-col">
      <header className="border-b border-neutral-200">
        <div className="mx-auto flex h-[72px] max-w-[1440px] items-center px-6 md:px-14">
          <ToyotaLogo />
          <nav aria-label="Main" className="ml-auto hidden items-center gap-12 text-[17px] font-semibold text-neutral-700 md:flex lg:ml-0 lg:flex-1 lg:justify-center">
            {["Vehicles", "Shop", "Support & Service"].map((n) => (
              <span key={n} className="flex items-center gap-1.5">{n} <Chevron /></span>
            ))}
          </nav>
          <span className="ml-auto flex items-center gap-2 text-[17px] font-semibold text-neutral-800 md:ml-12 lg:ml-0">
            <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
            {d.firstName} <Chevron />
          </span>
        </div>
      </header>

      <div className="border-b border-neutral-200">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-10 px-6 md:px-14">
          <nav aria-label="Owner" className="flex gap-10 text-[15px]">
            <span aria-current="page" className="border-b-[3px] border-[#EB0A1E] py-3 font-bold">My Vehicle</span>
            <button onClick={openAdvisor} className={`border-b-[3px] border-transparent py-3 text-neutral-600 hover:text-black ${ring}`}>Lifecycle Advisor</button>
            <span className="border-b-[3px] border-transparent py-3 text-neutral-600">Service &amp; Maintenance</span>
          </nav>
          <div className="ml-auto flex items-center gap-3 py-2">
            <label className="relative">
              <span className="sr-only">Demo profile</span>
              <select value={profile.id} onChange={(e) => choose(e.target.value)}
                className={`appearance-none rounded-md border border-neutral-300 bg-white py-2 pl-4 pr-10 text-[15px] ${ring}`}>
                {profiles.map((p) => <option key={p.id} value={p.id}>Demo profile: {displayFor(p).firstName}</option>)}
              </select>
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2"><Chevron /></span>
            </label>
            <button onClick={restart} className={`rounded-md px-3 py-2.5 text-sm text-neutral-600 underline-offset-2 hover:underline ${ring}`}>Restart scenario</button>
          </div>
        </div>
      </div>

      <main className="mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col px-6 pb-6 pt-5 md:px-14">
        {/* Two-slide track: the dashboard (car + advisor panel) and the full-width options page.
            "View your options" slides the dashboard out to the left; header and footer stay put. */}
        <div className="relative -mx-6 min-h-0 flex-1 overflow-hidden md:-mx-14">
          <div className="flex h-full w-[200%] transition-transform duration-700 ease-[cubic-bezier(0.22,0.8,0.2,1)]"
            style={{ transform: optionsPage ? "translateX(-50%)" : "translateX(0)" }}>
          <div className="flex h-full min-h-0 w-1/2 flex-col px-6 md:px-14" inert={optionsPage}>
        {/* Opening the advisor slides the car into the left column and reveals the panel on the right. */}
        <div className="grid min-h-0 flex-1 transition-[grid-template-columns] duration-500 ease-out"
          style={{ gridTemplateColumns: split ? "minmax(0,1.08fr) 1px minmax(0,1fr)" : "minmax(0,1fr) 0px minmax(0,0fr)" }}>
          <section aria-label="Your vehicle" className={`relative flex min-h-0 flex-col ${split ? "pr-12 text-left" : "text-center"}`}>
            <div className={split ? "mb-4" : "text-left lg:absolute lg:left-0 lg:top-0"}>
              <h1 className="text-[28px] font-bold tracking-tight">Welcome back, {d.firstName}.</h1>
              <p role="status" className="max-w-[260px] text-xs text-neutral-500">
                {notice}
              </p>
            </div>
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-neutral-500">Your Toyota</p>
            <h2 className={`font-extrabold leading-tight tracking-tight ${split ? "text-[44px]" : "text-[44px] md:text-[52px]"}`}>{title}</h2>
            {(d.trim || d.color) && (
              <p className="text-lg text-neutral-600">{[d.trim, d.color].filter(Boolean).join("  |  ")}</p>
            )}

            <button onClick={() => setDrawer(true)} className={`relative mt-2 block min-h-[140px] w-full flex-1 rounded-xl ${ring}`} aria-label={`Open vehicle details for ${label}`}>
              <CarImage src={d.imageSrc} label={label} />
            </button>

            <div className="mt-1 flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
              <button onClick={() => setIssuesOpen(true)} className={`inline-flex items-center gap-2 text-sm underline underline-offset-2 ${ring}`}>
                <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" aria-hidden><path d="M10 2.5 18 17H2L10 2.5Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M10 8v4M10 14.3v.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                Current issues
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold no-underline ${advisor.state.reportedIssue ? "bg-[#EB0A1E] text-white" : "bg-neutral-200 text-neutral-600"}`}>
                  {advisor.state.reportedIssue ? 1 : 0}
                </span>
              </button>
            </div>

            <dl className={`mx-auto mt-3 grid w-full max-w-3xl grid-cols-3 divide-x divide-neutral-300 text-center ${split ? "border-b border-neutral-200 pb-4" : ""}`}>
              {([["Mileage", `${profile.mileage.toLocaleString()} mi`], ["Ownership", d.ownership], ["Location", d.location]] as const).map(([k, v]) => (
                <div key={k} className="px-4">
                  <dt className="text-[15px] text-neutral-600">{k}</dt>
                  <dd className="text-xl font-bold">{v}</dd>
                </div>
              ))}
            </dl>

            {/* Hidden while the advisor panel is open, so the left side stays uncluttered. */}
            {!split && (
              <>
                <h2 className="mt-5 text-[32px] font-extrabold leading-tight tracking-tight">Your car. Your next move.</h2>
                <p className="text-[17px] text-neutral-600">Explore repair and replacement options that fit your life.</p>
                <div className="mt-16 flex flex-wrap justify-center gap-6">
                  <button onClick={() => setDrawer(true)} className={`rounded-full border-2 border-black px-12 py-3.5 text-lg font-bold hover:bg-neutral-50 ${ring}`}>
                    View Vehicle Details
                  </button>
                  <button onClick={openAdvisor} className={`relative inline-flex items-center gap-3 rounded-full bg-[#EB0A1E] px-12 py-3.5 text-lg font-bold text-white hover:bg-[#c8091a] ${ring}`}>
                    {/* AI guide peeking over the button; placeholder art cropped from the design mockup. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/advisor/guide-peek.png" alt="" aria-hidden draggable={false}
                      className="pointer-events-none absolute right-[6%] w-[96px] select-none" style={{ bottom: "calc(100% - 7.5px)" }} />
                    Find My Next Move <span aria-hidden>→</span>
                  </button>
                </div>
              </>
            )}
          </section>

          <div aria-hidden className="my-2 bg-neutral-200" />

          <div className="min-h-0 overflow-hidden">
            {split && (
              <div className="h-full min-w-[480px] pl-12">
                <AdvisorPanel step={advisorStep} onMinimize={minimizeAdvisor} onClose={closeAdvisor}>
                  {advisor.state.step === "intro" && (
                    <AdvisorIntro firstName={d.firstName} inProgress={!!advisor.state.reportedIssue}
                      onStart={() => advisor.update({ step: advisor.state.reportedIssue ? "situation" : "problem" })} />
                  )}
                  {advisor.state.step === "problem" && <ProblemStep profile={profile} state={advisor.state} update={advisor.update} />}
                  {advisor.state.step === "estimate" && <EstimateStep profile={profile} state={advisor.state} update={advisor.update} />}
                  {advisor.state.step === "situation" && <SituationStep profileId={profile.id} state={advisor.state} update={advisor.update} />}
                  {advisor.state.step === "options" && (
                    <OptionsStep profileId={profile.id} onBack={() => advisor.update({ step: "situation" })}
                      onStartOver={() => { restart(); advisor.update({ view: "open" }); }}
                      onResult={(options, optionsMocked) => advisor.update({ options, optionsMocked })}
                      onView={() => advisor.update({ optionsPage: true })} />
                  )}
                </AdvisorPanel>
              </div>
            )}
          </div>
        </div>
          </div>
          <div className="h-full w-1/2 overflow-y-auto px-6 md:px-14" inert={!optionsPage}>
            <OptionsPage open={optionsPage} vehicleLabel={label} result={advisor.state.options} mocked={advisor.state.optionsMocked}
              onBack={() => advisor.update({ optionsPage: false })} />
          </div>
          </div>
        </div>
      </main>
      </div>

      <SiteFooter />

      <VehicleDrawer open={drawer} onClose={closeDrawer} profile={profile} display={d} label={label} />
      <IssuesDrawer open={issuesOpen} onClose={closeIssues} label={label} issue={advisor.state.reportedIssue}
        optionsReady={advisor.state.step === "options"} quote={advisor.state.quote} onOpenAdvisor={openAdvisor} />
      {advisor.state.bankModal && (
        <BankConnectModal profileId={profile.id} firstName={d.firstName}
          onClose={() => advisor.update({ bankModal: false })}
          onConnected={(bank) => advisor.update({ bank, bankModal: false, bankSkipped: false, situation: { ...advisor.state.situation, down_payment: bank.availableCash } })} />
      )}
      {advisor.state.view === "minimized" && (
        <MinimizedPill stepLabel={advisorStep ? `Step ${advisorStep} of 3` : "Ready to start"} onResume={openAdvisor} />
      )}
    </div>
  );
}
