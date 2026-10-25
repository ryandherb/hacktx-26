import type { GuideContext, GuideStep } from "@/lib/api";

// The guide chat's deterministic fallback: used when the backend is unreachable (the offline
// Vercel demo) or has no LLM key. Keyword match against a short FAQ about the process.

type Entry = { words: string[]; answer: (c: GuideContext) => string };

const DISCLAIMER = "These are estimates, not financial advice.";
const REC_NAMES = { keep: "keep and repair", trade: "trade in", refinance: "keep and refinance" } as const;

const FAQ: Entry[] = [
  {
    words: ["recommend", "why", "trade", "keep", "decision", "result", "pick", "chose"],
    answer: (c) =>
      c.recommendation
        ? `${c.summary || `The lowest affordable monthly cost was to ${REC_NAMES[c.recommendation]}.`} The full breakdown is on your options page.`
        : `Step 3 compares the all-in monthly cost of keeping, trading in, and refinancing over about three years, and picks the lowest one you can afford. ${DISCLAIMER}`,
  },
  {
    words: ["refinanc"],
    answer: () => `Refinancing means you keep your car and replace your current loan with one at a lower payment. It only shows up if you still have a car loan. ${DISCLAIMER}`,
  },
  {
    words: ["50%", "half", "worth", "value"],
    answer: () => "We compare the repair to what your car is worth. If a repair costs at least half the car's value, the car has 30% or less of its life left, and a newer Toyota fits your budget, we recommend trading in.",
  },
  {
    words: ["credit", "score"],
    answer: () => "Your credit range only sets the loan rate we assume. We never check your credit, so it won't affect your score.",
  },
  {
    words: ["bank", "connect", "safe", "secure", "nessie", "capital"],
    answer: () => "Connecting your bank is optional and read-only. It fills in your income, spending, and savings so you don't have to. This demo uses Capital One's Nessie sandbox with sample data.",
  },
  {
    words: ["down payment", "cash", "put toward", "savings"],
    answer: () => "That's the cash you could use for a repair or a down payment without touching your emergency savings. Rough numbers are fine.",
  },
  {
    words: ["estimate", "cost", "price", "how much", "repair", "calculat"],
    answer: () => "We match your problem to a known repair and price it from typical parts and labor costs, adjusted for your model, year, and area. If you have a mechanic's quote, we use that instead.",
  },
  {
    words: ["quote", "mechanic", "shop", "upload", "pdf"],
    answer: () => "A mechanic's quote isn't required. If you have one, attach it in step 1 and confirm the total, and we'll use it instead of our estimate.",
  },
  {
    words: ["describe", "problem", "what should i", "type", "issue", "symptom"],
    answer: () => "Just describe what you notice in your own words, like \"the A/C blows warm air\" or \"it shakes when I accelerate.\" If it's too vague to price, we'll suggest getting it checked at a Toyota dealer first.",
  },
  {
    words: ["situation", "finances", "why do you ask", "personal", "question"],
    answer: () => "Step 2 asks about things that change what you can afford: big life changes, how long you want the car, cash on hand, a rough credit range, and how much you drive. It takes about a minute.",
  },
  {
    words: ["car fund", "fund", "save"],
    answer: () => "If you keep your car, a Car Fund lets you set aside a little each month toward your next one, so you're ready when it's time.",
  },
  {
    words: ["model", "toyota", "new car", "camry", "corolla", "rav4", "which car"],
    answer: () => "We only suggest Toyotas whose estimated payment fits what you can comfortably afford, counting insurance and fuel changes too.",
  },
  {
    words: ["how", "work", "start", "steps", "process", "help"],
    answer: () => "It takes three short steps: tell us what's wrong with your car, answer a few questions about your situation, and we compare keeping it, trading it in, and refinancing by monthly cost.",
  },
];

export function faqAnswer(question: string, context: GuideContext): string {
  const q = question.toLowerCase();
  let best: Entry | null = null;
  let bestHits = 0;
  for (const e of FAQ) {
    const hits = e.words.filter((w) => q.includes(w)).length;
    if (hits > bestHits) [best, bestHits] = [e, hits];
  }
  return best
    ? best.answer(context)
    : "I can help with how Next Move works: the repair estimate, the questions about your situation, or how we compare your options. What would you like to know?";
}

// Starter questions shown as chips, matched to where the customer is.
export function suggestionsFor(step: GuideStep | null | undefined, hasResult: boolean): string[] {
  if (hasResult || step === "options" || step === "options_page" || step === "plan_page")
    return ["Why this recommendation?", "What does refinancing mean?", "What's a Car Fund?"];
  if (step === "situation") return ["Will this check my credit?", "Is connecting my bank safe?", "What counts as cash I could put toward this?"];
  if (step === "estimate") return ["How is the repair estimated?", "What if I have a mechanic's quote?", "What happens next?"];
  return ["How does this work?", "What should I describe?", "Do I need a mechanic's quote?"];
}
