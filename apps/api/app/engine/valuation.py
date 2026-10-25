"""Vehicle valuation helpers.

PLACEHOLDER: midpoint of the market range. Replace with real valuation logic.
"""

from app.models.schemas import MarketData


def current_value(market: MarketData) -> float:
    return (market.current_vehicle_value_low + market.current_vehicle_value_high) / 2


def default_replacement(market: MarketData) -> dict:
    """Pick the cheapest replacement option by default."""
    return min(market.replacement_options, key=lambda o: o["price"])
