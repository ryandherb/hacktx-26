"""Short pros and cons for each option (keep / trade / refinance), so customers understand the
options we didn't recommend too.

Plain rules over the same facts the Explanation Agent gets: no LLM, instant, and every number
is one the engine produced (formatted, never computed beyond comparisons).
"""

from typing import Any

from app.clients.llm import _build_facts, _money, _num
from app.models.schemas import OptionNotes

MAX_ITEMS = 3


def _cap(items: list[str]) -> list[str]:
    return items[:MAX_ITEMS]


def build(context: dict) -> dict[str, OptionNotes]:
    """Pros/cons per option from the same context dict passed to llm.explain()."""
    facts = _build_facts(context)
    krt: dict[str, Any] = facts.get("krt") if isinstance(facts.get("krt"), dict) else {}
    keep, trade, refi = krt.get("keepResult"), krt.get("tradeResult"), krt.get("refinanceResult")
    if not (_num(keep) and _num(trade) and _num(refi)):
        return {}

    # No loan means no refinance payment. (Comparing refi with keep isn't enough: the PFO risk
    # margin makes them differ slightly even with no loan.)
    refi_payment = krt.get("refi_payment")
    has_loan = refi_payment > 0 if _num(refi_payment) else refi != keep
    costs = {"keep": keep, "trade": trade, **({"refinance": refi} if has_loan else {})}
    cheapest = min(costs, key=costs.get)
    repair = facts.get("repair_cost") if _num(facts.get("repair_cost")) else None
    pct = krt.get("repair_pct_of_car_value")
    runway = krt.get("savings_months_after_repair")
    life = krt.get("remaining_life_pct")
    picks = krt.get("suggested_models") or []
    best = picks[0] if picks and isinstance(picks[0], dict) else {}

    # ---- keep -----------------------------------------------------------------------
    keep_pros = [f"Lowest monthly cost: about {_money(keep)}/mo"] if cheapest == "keep" else []
    keep_pros.append("No new loan or down payment")
    if _num(life) and life >= 40:
        keep_pros.append(f"Car has about {life:g}% of its expected life left")
    keep_cons = [] if cheapest == "keep" else [f"Costs about {_money(keep)}/mo"]
    if repair is not None:
        keep_cons.append(f"{_money(repair)} repair bill up front")
    if _num(runway) and runway < 0:
        keep_cons.append("Repair costs more than your current savings")
    if _num(pct) and pct >= 100:
        keep_cons.append(f"Repair is about {pct:g}% of what the car is worth")
    elif _num(life) and life < 30:
        keep_cons.append(f"Car has only about {life:g}% of its expected life left")

    # ---- trade ----------------------------------------------------------------------
    trade_pros = []
    if best.get("name"):
        trade_pros.append(f"Newer car: {best['name']}")
    if repair is not None:
        trade_pros.append(f"Skip the {_money(repair)} repair")
    if _num(best.get("fuel_delta")) and best["fuel_delta"] < 0:
        trade_pros.append(f"Saves about {_money(-best['fuel_delta'])}/mo on gas")
    elif best.get("kind") == "cpo":
        trade_pros.append("Certified pre-owned with Toyota warranty")
    if cheapest == "trade":
        trade_pros.insert(0, f"Lowest monthly cost: about {_money(trade)}/mo")
        trade_cons = []
    else:
        trade_cons = [f"Costs about {_money(trade)}/mo all-in"]
    if _num(best.get("down_payment")) and best["down_payment"] > 0:
        trade_cons.append(f"{_money(best['down_payment'])} down payment")
    if krt.get("trade_affordable") is False:
        trade_cons.append("Over your comfortable monthly payment")
    elif _num(best.get("insurance_delta")) and best["insurance_delta"] > 0:
        trade_cons.append(f"Insurance goes up about {_money(best['insurance_delta'])}/mo")

    # ---- refinance --------------------------------------------------------------------
    if not has_loan:
        refinance = OptionNotes(available=False, pros=[], cons=["You don't have a car loan to refinance"])
    else:
        refi_pros = []
        if cheapest == "refinance":
            refi_pros.append(f"Lowest monthly cost: about {_money(refi)}/mo")
        if _num(krt.get("refi_payment")):
            refi_pros.append(f"Loan payment drops to about {_money(krt['refi_payment'])}/mo")
        refi_pros.append("Keep your car, no new purchase")
        refi_cons = []
        if repair is not None:
            refi_cons.append(f"Still pay the {_money(repair)} repair")
        refi_cons += ["A longer loan can mean more interest overall", "Needs a credit check"]
        refinance = OptionNotes(pros=_cap(refi_pros), cons=_cap(refi_cons))

    return {
        "keep": OptionNotes(pros=_cap(keep_pros), cons=_cap(keep_cons)),
        "trade": OptionNotes(pros=_cap(trade_pros), cons=_cap(trade_cons)),
        "refinance": refinance,
    }
