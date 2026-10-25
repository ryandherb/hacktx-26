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
import PlanPage from "@/components/options/PlanPage";
import SituationStep from "@/components/advisor/SituationStep";
import CarImage from "@/components/dashboard/CarImage";
import IssuesDrawer from "@/components/dashboard/IssuesDrawer";
import SiteFooter from "@/components/dashboard/SiteFooter";
import ToyotaLogo from "@/components/dashboard/ToyotaLogo";
import VehicleDrawer from "@/components/dashboard/VehicleDrawer";
import { backendReachable } from "@/lib/advisor/service";
import { useAdvisorState } from "@/lib/advisor/state";
import { getProfiles, type Profile } from "@/lib/api";
import { DEMO_PROFILE_IDS, MOCK_PROFILES, displayFor } from "@/lib/demo/profiles";
import { clearAssessment, loadSession, saveSession } from "@/lib/demo/session";

const ring = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#EB0A1E]";

const Chevron = () => (
  <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
);

export default function Dashboard() {
  // Start from the local copy of the demo profiles so the page never waits on the network.
  const [profiles, setProfiles] = useState<Profile[]>(MOCK_PROFILES);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const advisor = useAdvisorState();

  useEffect(() => {
    let live = true;
    const onlyDemo = (ps: Profile[]) => ps.filter((p) => DEMO_PROFILE_IDS.includes(p.id));
    if (backendReachable()) {
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000));
      Promise.race([getProfiles(), timeout])
        .then((p) => { const demo = onlyDemo(p); if (live && demo.length) setProfiles(demo); })
        .catch(() => {});
    }
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
  const planPage = optionsPage && advisor.state.planPage;

  return (
    <div className="bg-white text-black">
      {/* First screen: header + dashboard fill at least one viewport and grow (page scrolls) when the screen is short; the footer sits below it. */}
      <div className="flex min-h-screen flex-col">
      <header className="border-b border-neutral-200">
        <div className="mx-auto flex h-[72px] max-w-[1440px] items-center px-6 md:px-14">
          <ToyotaLogo />
          <nav aria-label="Main" className="ml-auto hidden items-center gap-8 text-[17px] font-semibold text-neutral-700 md:flex lg:ml-0 lg:flex-1 lg:justify-center lg:gap-12">
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
          <nav aria-label="Owner" className="flex w-full gap-6 overflow-x-auto whitespace-nowrap text-[15px] md:w-auto md:gap-10">
            <span aria-current="page" className="border-b-[3px] border-[#EB0A1E] py-3 font-bold">My Vehicle</span>
            <button onClick={openAdvisor} className={`border-b-[3px] border-transparent py-3 text-neutral-600 hover:text-black ${ring}`}>Lifecycle Advisor</button>
            <span className="border-b-[3px] border-transparent py-3 text-neutral-600">Service &amp; Maintenance</span>
          </nav>
          <div className="flex w-full items-center justify-between gap-3 py-2 md:ml-auto md:w-auto md:justify-start">
            <label className="relative">
              <span className="sr-only">Demo profile</span>
              <select value={profile.id} onChange={(e) => choose(e.target.value)}
                className={`appearance-none rounded-md max-md:min-h-11 border border-neutral-300 bg-white py-2 pl-4 pr-10 text-base md:text-[15px] ${ring}`}>
                {profiles.map((p) => <option key={p.id} value={p.id}>Demo profile: {displayFor(p).firstName}</option>)}
              </select>
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2"><Chevron /></span>
            </label>
            <button onClick={restart} className={`whitespace-nowrap rounded-md px-3 max-md:min-h-11 py-2.5 text-sm text-neutral-600 underline-offset-2 hover:underline ${ring}`}>Restart scenario</button>
          </div>
        </div>
      </div>

      <main className="mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col px-6 pb-6 pt-5 md:px-14">
        {/* Three-slide track: the dashboard (car + advisor panel), the full-width "Your options" page,
            and the plan for the recommended option. Each step slides the track one page left; header
            and footer stay put. At rest the track has no transform, so the phone advisor sheet
            (position: fixed) stays relative to the screen. */}
        <div className="relative -mx-6 flex flex-1 overflow-hidden md:-mx-14">
          <div className="flex w-[300%] shrink-0 transition-transform duration-700 max-md:transition-none ease-[cubic-bezier(0.22,0.8,0.2,1)]"
            style={{ transform: planPage ? `translateX(-${200 / 3}%)` : optionsPage ? `translateX(-${100 / 3}%)` : "none" }}>
          {/* On phones the hidden slides collapse so their height never stretches the visible one (no slide animation there). */}
          <div className={`flex w-1/3 flex-col px-6 md:px-14 ${optionsPage ? "max-md:h-0" : ""}`} inert={optionsPage}>
        {/* Opening the advisor slides the car into the left column and reveals the panel on the right. */}
        <div className="grid min-h-0 flex-1 transition-[grid-template-columns] duration-500 ease-out"
          style={{ gridTemplateColumns: split ? "minmax(0,1.08fr) 1px minmax(0,1fr)" : "minmax(0,1fr) 0px minmax(0,0fr)" }}>
          <section aria-label="Your vehicle" className={`relative flex min-h-0 flex-col ${split ? "pr-8 text-left xl:pr-12" : "text-center"}`}>
            <div className={split ? "mb-4" : "text-left lg:absolute lg:left-0 lg:top-0"}>
              <h1 className="text-[28px] font-bold tracking-tight">Welcome back, {d.firstName}.</h1>
              <p role="status" className="max-w-[260px] text-xs text-neutral-500">
                {notice}
              </p>
            </div>
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-neutral-500">Your Toyota</p>
            <h2 className={`font-extrabold leading-tight tracking-tight ${split ? "text-[clamp(32px,3.2vw,44px)]" : "text-[clamp(36px,3.6vw,52px)]"}`}>{title}</h2>
            {(d.trim || d.color) && (
              <p className="text-lg text-neutral-600">{[d.trim, d.color].filter(Boolean).join("  |  ")}</p>
            )}

            <button onClick={() => setDrawer(true)} className={`relative mt-2 block min-h-[max(160px,30vh)] w-full flex-1 rounded-xl ${ring}`} aria-label={`Open vehicle details for ${label}`}>
              <CarImage src={d.imageSrc} label={label} placeholder={d.imagePlaceholder} />
            </button>

            <div className="mt-1 flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
              <button onClick={() => setIssuesOpen(true)} className={`inline-flex items-center gap-2 text-sm underline max-md:min-h-11 underline-offset-2 ${ring}`}>
                <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" aria-hidden><path d="M10 2.5 18 17H2L10 2.5Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M10 8v4M10 14.3v.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                Current issues
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold no-underline ${advisor.state.reportedIssue ? "bg-[#EB0A1E] text-white" : "bg-neutral-200 text-neutral-600"}`}>
                  {advisor.state.reportedIssue ? 1 : 0}
                </span>
              </button>
            </div>

            <dl className={`mx-auto mt-3 grid w-full max-w-3xl grid-cols-3 divide-x divide-neutral-300 text-center ${split ? "border-b border-neutral-200 pb-4" : ""}`}>
              {([["Mileage", `${profile.mileage.toLocaleString()} mi`], ["Ownership", d.ownership], ["Location", d.location]] as const).map(([k, v]) => (
                <div key={k} className="px-2 sm:px-4">
                  <dt className="text-sm text-neutral-600 sm:text-[15px]">{k}</dt>
                  <dd className="text-base font-bold sm:text-xl">{v}</dd>
                </div>
              ))}
            </dl>

            {/* Hidden while the advisor panel is open, so the left side stays uncluttered. */}
            {!split && (
              <>
                <h2 className="mt-5 text-[clamp(24px,2.3vw,32px)] font-extrabold leading-tight tracking-tight">Your car. Your next move.</h2>
                <p className="text-[17px] text-neutral-600">Explore repair and replacement options that fit your life.</p>
                {/* mt-16 leaves room for the guide peeking over the red button (stacked first on phones so it never covers the other button). */}
                <div className="mt-16 flex flex-wrap justify-center gap-6">
                  <button onClick={() => setDrawer(true)} className={`rounded-full border-2 border-black px-8 py-3.5 text-lg font-bold hover:bg-neutral-50 max-sm:w-full sm:px-12 ${ring}`}>
                    View Vehicle Details
                  </button>
                  <button onClick={openAdvisor} className={`relative inline-flex items-center justify-center gap-3 rounded-full bg-[#EB0A1E] px-8 py-3.5 text-lg max-sm:order-first max-sm:w-full sm:px-12 font-bold text-white hover:bg-[#c8091a] ${ring}`}>
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
            {/* On phones the advisor opens as a full-screen sheet instead of the side-by-side split. */}
            {split && (
              <div className={`h-full max-h-[max(440px,calc(100dvh_-_176px))] md:pl-8 xl:min-w-[480px] xl:pl-12 max-md:fixed max-md:inset-0 max-md:z-40 max-md:max-h-none max-md:bg-white max-md:px-5 max-md:pb-[max(1rem,env(safe-area-inset-bottom))] max-md:pt-3 ${optionsPage ? "max-md:hidden" : ""}`}>
                <AdvisorPanel step={advisorStep} onMinimize={minimizeAdvisor} onClose={closeAdvisor}>
                  {advisor.state.step === "intro" && (
                    <AdvisorIntro firstName={d.firstName} inProgress={!!advisor.state.reportedIssue}
                      onStart={() => advisor.update({ step: advisor.state.reportedIssue ? "situation" : "problem" })} />
                  )}
                  {advisor.state.step === "problem" && <ProblemStep profile={profile} state={advisor.state} update={advisor.update} />}
                  {advisor.state.step === "estimate" && <EstimateStep profile={profile} state={advisor.state} update={advisor.update} />}
                  {advisor.state.step === "situation" && <SituationStep profileId={profile.id} state={advisor.state} update={advisor.update} />}
                  {advisor.state.step === "options" && (
                    <OptionsStep profileId={profile.id} situation={advisor.state.situation} quote={advisor.state.quote}
                      manualQuote={advisor.state.manualQuote} onBack={() => advisor.update({ step: "situation" })}
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
          <div className={`w-1/3 overflow-y-auto px-6 md:px-14 ${optionsPage && !planPage ? "" : "max-md:h-0"}`} inert={!optionsPage || planPage}>
            <OptionsPage open={optionsPage && !planPage} vehicleLabel={`${title} ${d.trim}`} car={profile.vehicle_model} result={advisor.state.options}
              mocked={advisor.state.optionsMocked} quote={advisor.state.quote} manualQuote={advisor.state.manualQuote}
              onBack={() => advisor.update({ optionsPage: false, planPage: false })} onViewPlan={() => advisor.update({ planPage: true })} />
          </div>
          <div className={`w-1/3 overflow-y-auto px-6 md:px-14 ${planPage ? "" : "max-md:h-0"}`} inert={!planPage}>
            <PlanPage open={planPage} result={advisor.state.options} onBack={() => advisor.update({ planPage: false })} />
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
