"""Step 4 of the Cost Agent: Personal Finance Onboarding (PFO), the front layer of KRT.

Six fixed questions about things Nessie can't show. Stateless: the client sends the
answers collected so far (plus an optional free-text reply) every turn. Free text is
parsed by deterministic rules first; Muse is only asked to extract a value when the rules
can't, and its output is validated against the same closed schema. Answers are mapped onto
issue #3's PFOFactors with fixed tables (credit band -> APR), never by the LLM.
"""

import re

from pydantic import ValidationError

from .clients import llm, muse
from .engine.cost_tables import CREDIT_BANDS, INCOME_STABILITY, PFO_DEFAULTS, normalize_text
from .models.schemas import (
    OnboardingRequest,
    OnboardingResult,
    PFOFactors,
    PfoAnswers,
    PfoOption,
    PfoQuestion,
)

CREDIT_OPTIONS = [
    PfoOption(value="excellent", label="Excellent (740+)"),
    PfoOption(value="good", label="Good (670-739)"),
    PfoOption(value="fair", label="Fair (580-669)"),
    PfoOption(value="poor", label="Poor (below 580)"),
    PfoOption(value="unknown", label="Not sure"),
]
DEBT_OPTIONS = [
    PfoOption(value="none", label="None"),
    PfoOption(value="light", label="A little (a card balance or small loan)"),
    PfoOption(value="heavy", label="A lot (student loans, several cards, other big loans)"),
]
YES_NO_OPTIONS = [PfoOption(value="yes", label="Yes"), PfoOption(value="no", label="No")]
INCOME_OPTIONS = [
    PfoOption(value="growing", label="Secure, and likely to grow"),
    PfoOption(value="steady", label="Secure and steady"),
    PfoOption(value="at_risk", label="It might drop, or my job is at risk"),
    PfoOption(value="unsure", label="Not sure"),
]
USAGE_OPTIONS = [
    PfoOption(value="high", label="I need it to earn money (rideshare, deliveries, job sites)"),
    PfoOption(value="medium", label="I drive it to work or school every day"),
    PfoOption(value="low", label="Errands and weekends only"),
]

QUESTIONS = (
    PfoQuestion(field="down_payment", input_type="number", unit="dollars",
                prompt="If you replaced the car, how much could you put down without straining your savings?"),
    PfoQuestion(field="credit_band", input_type="choice", options=CREDIT_OPTIONS,
                prompt="Roughly where is your credit score?"),
    PfoQuestion(field="other_debt_load", input_type="choice", options=DEBT_OPTIONS,
                prompt="Besides this car, how much other debt are you paying off?"),
    PfoQuestion(field="upcoming_major_expense", input_type="choice", options=YES_NO_OPTIONS,
                prompt="Do you have a large expense coming up in the next 12 months (tuition, medical, moving)?"),
    PfoQuestion(field="income_stability", input_type="choice", options=INCOME_OPTIONS,
                prompt="How secure is your income over the next year or two?"),
    PfoQuestion(field="car_usage", input_type="choice", options=USAGE_OPTIONS,
                prompt="How much do you rely on this car?"),
)
QUESTION_BY_FIELD = {q.field: q for q in QUESTIONS}

NONE_WORDS = {"none", "no", "nothing", "nope", "zero", "n a", "na", "not really"}
YES_WORDS = {"yes", "y", "yeah", "yep", "yup", "true"}
NO_WORDS = {"no", "n", "nope", "nah", "none", "nothing", "false", "not really"}
MONEY_RE = re.compile(r"^(?:about |around |roughly |maybe )?\$?\s*(\d+(?:\.\d+)?)\s*(k|thousand)?\s*(?:dollars|bucks)?$")
CREDIT_SCORE_BANDS = ((740, "excellent"), (670, "good"), (580, "fair"), (300, "poor"))


def _parse_money(text: str) -> float | None:
    if normalize_text(text) in NONE_WORDS:
        return 0.0
    match = MONEY_RE.match(text.strip().lower().replace(",", ""))
    if not match:  # ranges and sentences go to Muse
        return None
    amount, thousand = match.groups()
    return float(amount) * (1000 if thousand else 1)


def _parse_choice(text: str, options: list[PfoOption]) -> str | None:
    norm = normalize_text(text)
    for option in options:
        if norm in {normalize_text(option.value), normalize_text(option.label)}:
            return option.value
    return None


def _parse_credit(text: str) -> str | None:
    choice = _parse_choice(text, CREDIT_OPTIONS)
    if choice:
        return choice
    norm = normalize_text(text)
    if norm in {"not sure", "don t know", "dont know", "unsure", "no idea", "idk"}:
        return "unknown"
    if norm.isdigit() and 300 <= int(norm) <= 850:
        return next(band for floor, band in CREDIT_SCORE_BANDS if int(norm) >= floor)
    return None


def _parse_yes_no(text: str) -> bool | None:
    norm = normalize_text(text)
    return True if norm in YES_WORDS else False if norm in NO_WORDS else None


def parse_with_rules(field: str, text: str):
    if field == "down_payment":
        return _parse_money(text)
    if field == "credit_band":
        return _parse_credit(text)
    if field == "upcoming_major_expense":
        return _parse_yes_no(text)
    if field == "other_debt_load" and normalize_text(text) in NONE_WORDS:
        return "none"
    return _parse_choice(text, QUESTION_BY_FIELD[field].options)


SYSTEM_PROMPT = (
    "You read one answer from a car owner and extract a single structured value. "
    "Reply with only a JSON object and no other text. Do not invent information."
)


def _extract_prompt(field: str, text: str) -> str:
    question = QUESTION_BY_FIELD[field]
    if question.unit == "dollars":
        shape = ('{"amount": <dollar amount as a plain number, or null>} '
                 "where 3k means 3000, none means 0, and a range uses the lower bound")
    elif field == "upcoming_major_expense":
        shape = '{"value": true, false, or null}'
    else:
        ids = ", ".join(f'"{o.value}" ({o.label})' for o in question.options)
        shape = f'{{"value": <one of {ids}, or null>}}'
    return f"Question: {question.prompt}\nAnswer: {text!r}\nReturn {shape}. Use null if the answer is unclear."


def parse_with_llm(field: str, text: str):
    raw = muse.complete_json(SYSTEM_PROMPT, _extract_prompt(field, text))
    if not raw:
        return None
    if QUESTION_BY_FIELD[field].unit == "dollars":
        amount = raw.get("amount")
        return float(amount) if isinstance(amount, (int, float)) and not isinstance(amount, bool) else None
    value = raw.get("value")
    if field == "upcoming_major_expense":
        return value if isinstance(value, bool) else None
    return value if value in {o.value for o in QUESTION_BY_FIELD[field].options} else None


def _valid(field: str, value) -> bool:
    try:
        PfoAnswers(**{field: value})
    except ValidationError:
        return False
    return value is not None


def to_factors(answers: PfoAnswers) -> PFOFactors:
    """Deterministic mapping of complete answers onto issue #3's PFOFactors."""
    apr, credit_confidence = CREDIT_BANDS[answers.credit_band]
    income_outlook, job_stability = INCOME_STABILITY[answers.income_stability]
    return PFOFactors(
        apr=apr,
        down_payment=answers.down_payment,
        income_outlook=income_outlook,
        job_stability=job_stability,
        upcoming_major_expense=answers.upcoming_major_expense,
        other_debt_load=answers.other_debt_load,
        car_usage=answers.car_usage,
        credit_confidence=credit_confidence,
        **PFO_DEFAULTS,
    )


def run_onboarding(req: OnboardingRequest) -> OnboardingResult:
    values = req.answers.model_dump()
    retry_field, message = None, None

    if req.reply is not None:
        field, text = req.reply.field, req.reply.text
        value = parse_with_rules(field, text)
        if not _valid(field, value):
            value = parse_with_llm(field, text)
        if _valid(field, value):
            values[field] = value
        else:
            retry_field = field
            question = QUESTION_BY_FIELD[field]
            hint = (
                "Pick one of the options." if question.options
                else f"Please answer with a number in {question.unit}."
            )
            message = f"Sorry, I couldn't understand that answer. {hint}"

    answers = PfoAnswers(**values)
    missing = [q for q in QUESTIONS if getattr(answers, q.field) is None]
    question = QUESTION_BY_FIELD[retry_field] if retry_field else (missing[0] if missing else None)
    return OnboardingResult(
        answers=answers,
        question=question,
        retry=retry_field is not None,
        message=message,
        answered=len(QUESTIONS) - len(missing),
        total=len(QUESTIONS),
        accepts_free_text=llm.llm_configured(),
        complete=not missing,
        factors=to_factors(answers) if not missing else None,
    )
