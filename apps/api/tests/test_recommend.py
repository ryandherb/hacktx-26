import pytest

from app.engine import simulate
from app.models.schemas import KRTResult


def result(keep: float, refi: float, trade: float, affordable: bool) -> KRTResult:
    return KRTResult(
        keepResult=keep, refinanceResult=refi, tradeResult=trade,
        repair_ratio=0.2, pr_runway=1.0, remaining_life=0.3,
        new_payment=250, refi_payment=0, suggested_models=[], trade_affordable=affordable,
    )


@pytest.mark.parametrize(
    "keep,refi,trade,affordable,expected",
    [
        (150, 150, 480, True, "keep"),       # keep cheapest
        (380, 155, 590, True, "refinance"),  # refinance cheapest
        (600, 600, 430, True, "trade"),      # trade cheapest and affordable
        (600, 600, 430, False, "keep"),      # trade cheapest but not affordable
        (600, 500, 430, False, "refinance"),
        (600, 450, 430, True, "trade"),
        (300, 300, 300, True, "keep"),       # ties go to keep
    ],
)
def test_set_recommendation(keep, refi, trade, affordable, expected):
    assert simulate.set_recommendation(result(keep, refi, trade, affordable)) == expected


@pytest.mark.parametrize(
    "ratio,life,affordable,expected",
    [
        (1.01, 0.26, True, "trade"),   # repair worth more than the car, little life left
        (0.5, 0.3, True, "trade"),     # exactly at both thresholds
        (1.01, 0.26, False, "keep"),   # replacement not affordable: cost rule decides
        (0.49, 0.26, True, "keep"),    # repair under half the car's value
        (1.01, 0.31, True, "keep"),    # car still has plenty of life
    ],
)
def test_fifty_percent_rule(ratio, life, affordable, expected):
    r = result(209, 209, 458, affordable).model_copy(update={"repair_ratio": ratio, "remaining_life": life})
    assert simulate.set_recommendation(r) == expected
