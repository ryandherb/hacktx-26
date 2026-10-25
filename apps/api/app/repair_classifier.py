"""Step 1 of the Cost Agent: is the repair quotable, and which catalog category is it?

Muse picks a category from a closed list when configured. Keyword matching against the
catalog is the deterministic fallback, so the agent works with LLM_PROVIDER=none.
"""

from pydantic import BaseModel, Field, ValidationError

from .clients import muse
from .models.schemas import RepairClassification
from .engine.cost_tables import REPAIR_CATEGORIES, SYMPTOMS, normalize_text

MIN_CONFIDENCE = 0.7
KEYWORD_CONFIDENCE = 0.9

REASONS = {
    "symptom": "This describes a symptom that could come from several different problems.",
    "multiple": "This lists more than one repair.",
    "unknown": "We couldn't match this to a repair we can estimate.",
    "low_confidence": "We aren't confident which repair this is.",
}
MANUAL_HINT = " A shop diagnosis will give you a real quote."


class _LlmClassification(BaseModel):
    category: str
    confidence: float = Field(ge=0, le=1)
    multiple_repairs: bool = False


SYSTEM_PROMPT = (
    "You classify car repair descriptions for a Toyota repair cost estimator. "
    "Reply with only a JSON object and no other text."
)


def _user_prompt(text: str) -> str:
    repairs = "\n".join(f"- {key}: {c['label']}" for key, c in REPAIR_CATEGORIES.items())
    symptoms = "\n".join(f"- {key}: {c['label']}" for key, c in SYMPTOMS.items())
    return (
        "Specific repairs (the customer knows what needs fixing):\n"
        f"{repairs}\n\n"
        "Symptoms (too vague to price without a shop diagnosis):\n"
        f"{symptoms}\n\n"
        "Pick the single best id from either list. If the description names a specific part or "
        "repair, prefer the repair id even if a symptom is also mentioned. Use \"unknown\" if "
        "nothing fits.\n"
        'Return {"category": "<id or unknown>", "confidence": <0 to 1>, '
        '"multiple_repairs": <true if it names more than one distinct repair>}\n\n'
        f"Description: {text!r}"
    )


def _result(category, kind, confidence, method, reason_key=None) -> RepairClassification:
    quotable = kind == "repair"
    if quotable:
        label = REPAIR_CATEGORIES[category]["label"]
        reason = f"Matched to {label}."
    else:
        label = SYMPTOMS[category]["label"] if kind == "symptom" else None
        reason = REASONS[reason_key or kind] + MANUAL_HINT
    return RepairClassification(
        category=category, label=label, kind=kind, quotable=quotable,
        confidence=round(confidence, 2), method=method, reason=reason,
    )


def classify_with_keywords(text: str) -> RepairClassification:
    padded = f" {normalize_text(text)} "

    def scores(table: dict) -> dict[str, int]:
        found = {}
        for key, entry in table.items():
            score = sum(len(kw) for kw in entry["keywords"] if f" {kw} " in padded)
            if score:
                found[key] = score
        return found

    # A named part or repair beats a symptom ("check engine light, oxygen sensor" -> o2_sensor).
    repairs = scores(REPAIR_CATEGORIES)
    if len(repairs) > 1:
        return _result(None, "multiple", 0.0, "keyword")
    if repairs:
        return _result(next(iter(repairs)), "repair", KEYWORD_CONFIDENCE, "keyword")
    symptoms = scores(SYMPTOMS)
    if symptoms:
        return _result(max(symptoms, key=symptoms.get), "symptom", KEYWORD_CONFIDENCE, "keyword")
    return _result(None, "unknown", 0.0, "keyword")


def classify_with_llm(text: str) -> RepairClassification | None:
    raw = muse.complete_json(SYSTEM_PROMPT, _user_prompt(text))
    if raw is None:
        return None
    try:
        parsed = _LlmClassification(**raw)
    except (ValidationError, TypeError):
        return None
    category = parsed.category.strip().lower()
    if parsed.multiple_repairs:
        return _result(None, "multiple", parsed.confidence, "llm")
    if category in REPAIR_CATEGORIES:
        if parsed.confidence < MIN_CONFIDENCE:
            return _result(None, "unknown", parsed.confidence, "llm", "low_confidence")
        return _result(category, "repair", parsed.confidence, "llm")
    if category in SYMPTOMS:
        return _result(category, "symptom", parsed.confidence, "llm")
    return _result(None, "unknown", parsed.confidence, "llm")  # "unknown" or an id outside the list


def classify_repair(text: str) -> RepairClassification:
    return classify_with_llm(text) or classify_with_keywords(text)
