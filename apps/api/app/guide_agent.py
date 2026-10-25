"""Guide Agent: the floating AI guide that answers questions about the process at any time.

It explains how Next Move works and restates results the customer already has. It never
computes or invents numbers and never changes the recommendation. Stateless: the client sends
the whole conversation plus a small context (current step, car, results so far) every turn.
Returns None when no LLM is configured or the call fails; the client then answers from its
built-in FAQ (apps/web/lib/advisor/guideFaq.ts).
"""

import json
import logging

from .clients import llm
from .models.schemas import GuideChatRequest

logger = logging.getLogger(__name__)

# The chat panel shows a typing indicator; past this the client falls back to its FAQ.
GUIDE_TIMEOUT_SECONDS = 12.0
# Only the most recent turns are sent, so long chats stay fast and cheap.
MAX_HISTORY = 12

STEP_NAMES = {
    "intro": "the Lifecycle Advisor welcome screen (not started yet)",
    "problem": "step 1, Your car: describing the problem",
    "estimate": "step 1, Your car: reviewing the repair estimate",
    "situation": "step 2, Your situation: questions about their finances and plans",
    "options": "step 3, Your options: the results are ready",
    "options_page": "the full Your options page comparing keep, trade, and refinance",
    "plan_page": "the plan for the recommended option",
}

SYSTEM_PROMPT = f"""You are ToyotaAI, the friendly guide inside Next Move, a Toyota owner tool. \
It helps someone whose older Toyota needs a repair decide whether to keep it (repair it), \
trade it in for a newer Toyota, or keep it and refinance the car loan.

How the process works (the Lifecycle Advisor, three steps):
1. Your car. The customer describes what's wrong in their own words, or attaches a mechanic's \
written quote. The Cost Agent sorts the problem into a known repair (transmission, A/C \
compressor, brakes, oxygen sensor, and so on) and prices it from a table of typical parts and \
labor costs, adjusted for the model, year, and region. If the problem is too vague to price \
(for example "engine won't start"), it suggests getting it diagnosed at a Toyota dealer first. \
A shop quote, when given, is used instead of the table.
2. Your situation. A few short questions: big life changes coming up (new job, graduating, \
unpaid internship, moving), how long they want to keep the car, how much cash they could put \
toward this without touching emergency savings, a rough credit score range (it only sets the \
loan rate we assume; nobody checks their credit), and how much they rely on the car. They can \
also connect their bank (a Capital One Nessie sandbox with demo data, read-only) so income, \
spending, and savings are filled in automatically.
3. Your options. Deterministic math, not the AI, compares the all-in monthly cost of each \
option over about three years: keep (repair spread over three years plus expected upkeep), \
trade (loan payment, insurance and fuel changes, down payment), and refinance (keep the car and \
lower the loan payment). The lowest affordable monthly cost wins and ties go to keep. One \
exception, the "50% rule": trade wins when the repair costs at least half of what the car is \
worth, the car has 30% or less of its life left, and a replacement fits the budget. Suggested \
Toyota models are only shown when their payment fits what the customer can comfortably afford. \
If they keep the car, they can start a Car Fund savings account to save toward their next one.

How to answer:
- Be warm, plain, and brief: 1 to 3 short sentences, or up to 4 short bullet points when \
listing. No headings, tables, or bold text. Use the customer's first name only occasionally.
- Never compute, estimate, add, subtract, or invent any dollar amount, rate, or score. Only \
repeat numbers that appear in the context JSON exactly as given. If they ask for a number you \
don't have, say where in the steps they'll see it.
- Never change or second-guess the recommendation. Explain the one in the context.
- You can't see their screen or change their answers. Point them to the step where they can.
- When you talk about what they should do with money, remind them these are estimates, not \
financial advice.
- If a question has nothing to do with their car, this process, or Toyota, gently steer back.
- Reply in plain text only, never JSON.
"""


def _context_block(req: GuideChatRequest) -> str:
    ctx = req.context.model_dump(exclude_none=True) if req.context else {}
    step = ctx.pop("step", None)
    # Dollar amounts go in ready to say, so the guide repeats "$612 a month", never "612.4".
    if "monthly_costs" in ctx:
        ctx["monthly_costs"] = {k: f"{llm._money(v)} a month" for k, v in ctx["monthly_costs"].items()}
    lo, hi = ctx.pop("repair_cost_low", None), ctx.pop("repair_cost_high", None)
    if lo is not None and hi is not None:
        ctx["repair_estimate"] = llm._money(lo) if lo == hi else f"{llm._money(lo)} to {llm._money(hi)}"
    where = STEP_NAMES.get(step, "somewhere in the Next Move dashboard") if step else "the dashboard"
    return f"The customer is on {where}.\nContext (JSON):\n{json.dumps(ctx, default=str)}"


def reply(req: GuideChatRequest) -> str | None:
    """The guide's answer to the last user message, or None (client uses its FAQ)."""
    if not llm.llm_configured():
        return None
    history = [m.model_dump() for m in req.messages[-MAX_HISTORY:-1]]
    question = req.messages[-1].content
    try:
        text = llm._complete(
            question,
            system=SYSTEM_PROMPT + "\n" + _context_block(req),
            temperature=0.4,
            timeout=GUIDE_TIMEOUT_SECONDS,
            history=history,
        )
    except llm.LLMError as exc:
        logger.warning("Guide chat failed, client will use its FAQ: %s", exc)
        return None
    return text.strip() or None
