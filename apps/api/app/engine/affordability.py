"""Turn a Nessie snapshot into an affordability result.

PLACEHOLDER: simple monthly averages. Replace with the real model.
"""

from app.models.schemas import AffordabilityResult


def _monthly_avg(items: list[dict]) -> float:
    if not items:
        return 0.0
    months = {i["transaction_date"][:7] for i in items}
    return sum(i["amount"] for i in items) / max(len(months), 1)


def compute(snapshot: dict, buffer: float = 300.0) -> AffordabilityResult:
    income = _monthly_avg(snapshot["deposits"])
    spend = _monthly_avg(snapshot["purchases"])
    savings = sum(
        a["balance"] for a in snapshot["accounts"] if a["type"].lower() == "savings"
    )
    surplus = income - spend
    runway = savings / spend if spend else 0.0
    max_payment = max(surplus - buffer, 0.0)
    return AffordabilityResult(
        monthly_income=round(income, 2),
        monthly_spend=round(spend, 2),
        savings_balance=round(savings, 2),
        monthly_surplus=round(surplus, 2),
        runway_months=round(runway, 1),
        can_afford_payment=max_payment > 0,
        max_comfortable_payment=round(max_payment, 2),
    )
