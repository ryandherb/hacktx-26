"""Synthetic lookup tables for the Cost Agent. All dollar figures are demo estimates.

Repair ranges are typical parts + labor for one repair at an independent shop, before
model, age, and regional adjustments. Keywords are matched against normalized text
(lowercase, "a/c" -> "ac", punctuation -> spaces).
"""

import re

REPAIR_CATEGORIES: dict[str, dict] = {
    "brakes": {"label": "Brake pads and rotors (one axle)", "low": 250, "high": 600,
               "keywords": ["brake", "brakes", "brake pads", "pads", "rotor", "rotors", "braking"]},
    "battery": {"label": "Battery replacement", "low": 150, "high": 350,
                "keywords": ["battery", "dead battery", "car battery"]},
    "alternator": {"label": "Alternator replacement", "low": 400, "high": 900, "keywords": ["alternator"]},
    "starter": {"label": "Starter motor replacement", "low": 350, "high": 800,
                "keywords": ["starter", "starter motor"]},
    "o2_sensor": {"label": "Oxygen (O2) sensor replacement", "low": 200, "high": 500,
                  "keywords": ["oxygen sensor", "o2 sensor", "o2", "02 sensor"]},
    "ac_compressor": {"label": "A/C compressor replacement", "low": 900, "high": 1800,
                      "keywords": ["ac compressor", "air conditioning compressor", "air conditioner compressor", "compressor"]},
    "ac_recharge": {"label": "A/C refrigerant recharge", "low": 150, "high": 350,
                    "keywords": ["ac recharge", "refrigerant", "freon", "recharge"]},
    "water_pump": {"label": "Water pump replacement", "low": 450, "high": 900, "keywords": ["water pump"]},
    "radiator": {"label": "Radiator replacement", "low": 500, "high": 1100, "keywords": ["radiator"]},
    "timing_belt": {"label": "Timing belt or chain service", "low": 500, "high": 1100,
                    "keywords": ["timing belt", "timing chain"]},
    "serpentine_belt": {"label": "Serpentine belt replacement", "low": 120, "high": 250,
                        "keywords": ["serpentine belt", "drive belt"]},
    "struts": {"label": "Struts or shocks (pair)", "low": 600, "high": 1500,
               "keywords": ["strut", "struts", "shocks", "shock absorbers"]},
    "tires": {"label": "Set of four tires", "low": 500, "high": 1000, "keywords": ["tire", "tires", "tyres"]},
    "wheel_bearing": {"label": "Wheel bearing replacement", "low": 300, "high": 700,
                      "keywords": ["wheel bearing", "hub bearing"]},
    "spark_plugs": {"label": "Spark plugs and ignition coils", "low": 150, "high": 450,
                    "keywords": ["spark plug", "spark plugs", "ignition coil", "ignition coils", "coil pack"]},
    "fuel_pump": {"label": "Fuel pump replacement", "low": 600, "high": 1300, "keywords": ["fuel pump"]},
    "catalytic_converter": {"label": "Catalytic converter replacement", "low": 1000, "high": 2500,
                            "keywords": ["catalytic converter", "catalytic", "cat converter"]},
    "head_gasket": {"label": "Head gasket repair", "low": 1500, "high": 3000, "keywords": ["head gasket"]},
    "transmission": {"label": "Transmission rebuild or replacement", "low": 2500, "high": 4500,
                     "keywords": ["transmission", "gearbox", "slipping gears", "transmission slipping"]},
}

# Specific repairs outside the catalog (a bumper, a door handle, a power steering rack). Muse
# picks a tier from the description; the price still comes from these ranges. The keyword
# fallback never picks a tier, so without the LLM these go to manual quote input.
GENERAL_TIERS: dict[str, dict] = {
    "general_minor": {"label": "Minor repair", "low": 150, "high": 500,
                      "scope": "under two hours of labor and an inexpensive part (a mirror glass, a door handle, a small dent)"},
    "general_moderate": {"label": "Moderate repair", "low": 400, "high": 1300,
                         "scope": "a few hours of labor or a mid-priced part (a bumper cover, a headlight assembly, a control arm)"},
    "general_major": {"label": "Major repair", "low": 1200, "high": 3500,
                      "scope": "a day of labor or an expensive part (a door or panel replacement, a steering rack, an A/C evaporator)"},
    "general_severe": {"label": "Severe repair", "low": 3500, "high": 7000,
                       "scope": "an engine or hybrid battery replacement, or extensive collision damage"},
}

# Symptoms describe what the driver notices, not a repair. They span too many possible
# causes to price, so they always go to a real shop diagnosis and manual quote input.
SYMPTOMS: dict[str, dict] = {
    "no_start": {"label": "Car won't start",
                 "keywords": ["won t start", "wont start", "will not start", "not starting", "no start",
                              "doesn t start", "doesnt start", "won t turn on", "wont turn on", "not turning on"]},
    "electrical": {"label": "Electrical problem",
                   "keywords": ["electrical", "electricity", "electric", "power out", "no power", "lights flickering"]},
    "check_engine": {"label": "Check engine light",
                     "keywords": ["check engine", "engine light", "cel"]},
    "warning_light": {"label": "Dashboard warning light",
                      "keywords": ["warning light", "dashboard light", "dash light"]},
    "noise": {"label": "Unusual noise",
              "keywords": ["noise", "noises", "grinding", "clunk", "clunking", "rattle", "rattling", "squeak",
                           "squeaking", "squeal", "squealing", "knocking", "whining"]},
    "vibration": {"label": "Vibration or shaking",
                  "keywords": ["vibration", "vibrating", "shaking", "shakes", "wobble"]},
    "leak": {"label": "Fluid leak", "keywords": ["leak", "leaking", "puddle", "drip", "dripping"]},
    "overheating": {"label": "Overheating",
                    "keywords": ["overheating", "overheats", "running hot", "temperature gauge"]},
    "smoke_smell": {"label": "Smoke or burning smell",
                    "keywords": ["smoke", "smoking", "burning smell", "smells"]},
    "performance": {"label": "Drivability problem",
                    "keywords": ["stalling", "stalls", "hesitates", "hesitation", "rough idle", "sluggish",
                                 "losing power", "misfire", "misfiring"]},
}

# Per-model data: repair cost multiplier, original MSRP (synthetic), annual depreciation rate.
MODELS: dict[str, dict] = {
    "yaris": {"label": "Yaris", "repair_multiplier": 0.85, "msrp": 16000, "depreciation": 0.11},
    "corolla": {"label": "Corolla", "repair_multiplier": 0.90, "msrp": 16500, "depreciation": 0.11},
    "prius": {"label": "Prius", "repair_multiplier": 1.00, "msrp": 25000, "depreciation": 0.11},
    "chr": {"label": "C-HR", "repair_multiplier": 0.95, "msrp": 23000, "depreciation": 0.11},
    "camry": {"label": "Camry", "repair_multiplier": 1.00, "msrp": 22000, "depreciation": 0.11},
    "avalon": {"label": "Avalon", "repair_multiplier": 1.10, "msrp": 33000, "depreciation": 0.11},
    "rav4": {"label": "RAV4", "repair_multiplier": 1.05, "msrp": 24000, "depreciation": 0.09},
    "venza": {"label": "Venza", "repair_multiplier": 1.10, "msrp": 28000, "depreciation": 0.11},
    "highlander": {"label": "Highlander", "repair_multiplier": 1.15, "msrp": 30000, "depreciation": 0.10},
    "sienna": {"label": "Sienna", "repair_multiplier": 1.15, "msrp": 28000, "depreciation": 0.11},
    "4runner": {"label": "4Runner", "repair_multiplier": 1.20, "msrp": 33000, "depreciation": 0.08},
    "tacoma": {"label": "Tacoma", "repair_multiplier": 1.15, "msrp": 26000, "depreciation": 0.08},
    "tundra": {"label": "Tundra", "repair_multiplier": 1.25, "msrp": 33000, "depreciation": 0.09},
    "sequoia": {"label": "Sequoia", "repair_multiplier": 1.30, "msrp": 42000, "depreciation": 0.10},
    "landcruiser": {"label": "Land Cruiser", "repair_multiplier": 1.40, "msrp": 60000, "depreciation": 0.07},
}
DEFAULT_MODEL = {"label": "Toyota", "repair_multiplier": 1.00, "msrp": 25000, "depreciation": 0.11}

# Older cars cost more to fix: harder-to-find parts and seized hardware. (max age, multiplier)
AGE_MULTIPLIERS = ((5, 1.00), (10, 1.05), (15, 1.10))
OLDEST_AGE_MULTIPLIER = 1.15

# Shop labor rate relative to Texas. Unlisted states use 1.0.
LABOR_MULTIPLIERS = {
    "TX": 1.00, "CA": 1.25, "NY": 1.20, "MA": 1.20, "WA": 1.15, "IL": 1.10, "CO": 1.05,
    "FL": 1.00, "AZ": 1.00, "GA": 0.95, "LA": 0.95, "OK": 0.90,
}
# First three ZIP digits -> state, for the states above.
ZIP_PREFIX_STATES = (
    (10, 27, "MA"), (100, 149, "NY"), (300, 319, "GA"), (398, 399, "GA"), (320, 349, "FL"),
    (600, 629, "IL"), (700, 714, "LA"), (730, 749, "OK"), (750, 799, "TX"), (885, 885, "TX"),
    (800, 816, "CO"), (850, 865, "AZ"), (900, 961, "CA"), (980, 994, "WA"),
)
STATE_NAMES = {
    "texas": "TX", "california": "CA", "new york": "NY", "massachusetts": "MA", "washington": "WA",
    "illinois": "IL", "colorado": "CO", "florida": "FL", "arizona": "AZ", "georgia": "GA",
    "louisiana": "LA", "oklahoma": "OK",
}

MILES_PER_YEAR = 12000
TRADE_IN_RATIO = 0.80  # dealers pay less than a private buyer
VALUE_FLOOR = 500

# PFO mappings onto issue #3's PFOFactors (apps/api/app/models/schemas.py on main).
# Credit band -> (auto loan APR assumption, credit_confidence). None APR = krt.DEFAULT_APR.
CREDIT_BANDS = {
    "excellent": (0.055, "high"),
    "good": (0.07, "high"),
    "fair": (0.11, "medium"),
    "poor": (0.16, "low"),
    "unknown": (None, "low"),
}
# One income question -> (income_outlook, job_stability).
INCOME_STABILITY = {
    "growing": ("increasing", "secure"),
    "steady": ("stable", "secure"),
    "at_risk": ("decreasing", "at_risk"),
    "unsure": ("uncertain", "unknown"),
}
# PFOFactors fields the survey doesn't ask about (kept short, per the README's 4-6 questions).
PFO_DEFAULTS = {"windfall_expected": False, "payment_risk_tolerance": "medium", "household_members": 1}

DISCLAIMER = "Estimates based on synthetic data, not financial advice. Get a real shop quote before deciding."


def normalize_text(text: str) -> str:
    text = text.lower().replace("a/c", "ac")
    return " ".join(re.sub(r"[^a-z0-9]+", " ", text).split())


def model_key(vehicle_model: str) -> str | None:
    """Map free-text model ("Toyota RAV 4 XLE") to a MODELS key, preferring the longest match."""
    compact = re.sub(r"[^a-z0-9]", "", vehicle_model.lower()).replace("toyota", "")
    matches = [key for key in MODELS if key in compact]
    return max(matches, key=len) if matches else None
