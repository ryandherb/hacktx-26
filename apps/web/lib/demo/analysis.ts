// RECORDED real POST /analyze responses (Ryan's KRT engine + Eni's explanation template), used
// only when no backend is reachable, e.g. the deployed demo. Captured on 2026-10-25 from the
// jack/analyze-inputs backend with each profile's demo answers:
//   maria: credit 740+, new job, daily commute, $6,500 down, transmission estimate $2,750-$4,950
//   dev:   credit 580-669, unpaid internship, daily commute, $0 down, A/C shop quote $1,450
// Re-record if the engine or the demo answers change.
import type { Analysis } from "@/lib/api";

export const RECORDED_ANALYSES: Record<string, Analysis> = {
  "maria": {
    "profile_id": "maria",
    "recommendation": "trade",
    "result": {
      "keepResult": 208.64,
      "refinanceResult": 208.64,
      "tradeResult": 472.26,
      "repair_ratio": 1.010204081632653,
      "pr_runway": 1.5478739870999862,
      "remaining_life": 0.26,
      "new_payment": 250.23,
      "refi_payment": 0.0,
      "suggested_models": [
        {
          "name": "2026 Corolla LE",
          "price": 24500.0,
          "kind": "new",
          "seats": 5,
          "mpg": 35.0,
          "body": "sedan",
          "down_payment": 6500.0,
          "new_payment": 250.23,
          "insurance_delta": 57.17,
          "fuel_delta": -15.7,
          "monthly_cost": 472.26,
          "reason": "lowest monthly cost of the cars that fit"
        },
        {
          "name": "2026 Corolla Cross L",
          "price": 25335.0,
          "kind": "new",
          "seats": 5,
          "mpg": 32.0,
          "body": "suv",
          "down_payment": 6500.0,
          "new_payment": 266.17,
          "insurance_delta": 59.6,
          "fuel_delta": -8.86,
          "monthly_cost": 497.47,
          "reason": "$266/mo payment"
        },
        {
          "name": "2026 Camry Hybrid LE",
          "price": 29000.0,
          "kind": "new",
          "seats": 5,
          "mpg": 51.0,
          "body": "sedan",
          "down_payment": 6500.0,
          "new_payment": 336.18,
          "insurance_delta": 70.29,
          "fuel_delta": -38.57,
          "monthly_cost": 548.46,
          "reason": "saves ~$39/mo on gas"
        }
      ],
      "trade_affordable": true
    },
    "new_monthly_payment": 250.23,
    "suggested_models": [
      {
        "name": "2026 Corolla LE",
        "price": 24500.0,
        "kind": "new",
        "seats": 5,
        "mpg": 35.0,
        "body": "sedan",
        "down_payment": 6500.0,
        "new_payment": 250.23,
        "insurance_delta": 57.17,
        "fuel_delta": -15.7,
        "monthly_cost": 472.26,
        "reason": "lowest monthly cost of the cars that fit"
      },
      {
        "name": "2026 Corolla Cross L",
        "price": 25335.0,
        "kind": "new",
        "seats": 5,
        "mpg": 32.0,
        "body": "suv",
        "down_payment": 6500.0,
        "new_payment": 266.17,
        "insurance_delta": 59.6,
        "fuel_delta": -8.86,
        "monthly_cost": 497.47,
        "reason": "$266/mo payment"
      },
      {
        "name": "2026 Camry Hybrid LE",
        "price": 29000.0,
        "kind": "new",
        "seats": 5,
        "mpg": 51.0,
        "body": "sedan",
        "down_payment": 6500.0,
        "new_payment": 336.18,
        "insurance_delta": 70.29,
        "fuel_delta": -38.57,
        "monthly_cost": 548.46,
        "reason": "saves ~$39/mo on gas"
      }
    ],
    "apr": 0.055,
    "down_payment": 6500.0,
    "affordability": {
      "monthly_income": 4600.0,
      "monthly_spend": 3133.33,
      "savings_balance": 9800.0,
      "monthly_surplus": 1466.67,
      "runway_months": 3.1,
      "can_afford_payment": true,
      "max_comfortable_payment": 1166.67
    },
    "market": {
      "current_vehicle_value_low": 4200.0,
      "current_vehicle_value_high": 5600.0,
      "scheduled_maintenance": [
        {
          "cost": 75.0,
          "interval": 5000
        },
        {
          "cost": 30.0,
          "interval": 5000
        },
        {
          "cost": 90.0,
          "interval": 30000
        },
        {
          "cost": 300.0,
          "interval": 40000
        },
        {
          "cost": 150.0,
          "interval": 100000
        }
      ],
      "replacement_options": [
        {
          "name": "2026 Corolla LE",
          "price": 24500,
          "kind": "new"
        },
        {
          "name": "2026 Corolla Cross L",
          "price": 25335,
          "kind": "new"
        },
        {
          "name": "2026 Camry Hybrid LE",
          "price": 29000,
          "kind": "new"
        },
        {
          "name": "2026 RAV4 Hybrid LE",
          "price": 31900,
          "kind": "new"
        },
        {
          "name": "2026 Sienna LE",
          "price": 40120,
          "kind": "new"
        }
      ],
      "repair_quotes": [
        {
          "shop": "Austin Transmission Co.",
          "estimate": 3200,
          "source": "fixture"
        },
        {
          "shop": "Central TX Auto Care",
          "estimate": 2800,
          "source": "fixture"
        }
      ]
    },
    "explanation": "The repair would cost about 101% of what your 2012 Camry is worth, so trading in is your best move. A 2026 Corolla LE would run about $472 a month, and it fits your budget. Estimates, not financial advice.",
    "explanation_details": "Trading in now looks like the best move, and a replacement fits your budget. Estimated monthly cost: keeping $209, trading $472. The repair is estimated at $2,750 to $4,950. That's about 101% of what the car is worth, and after paying for it your savings would cover about 1.5 months of spending. The car has about 26% of its expected life left. Top picks for you: 2026 Corolla LE at $24,500: about $250 a month loan payment with $6,500 down (lowest monthly cost of the cars that fit); 2026 Corolla Cross L at $25,335: about $266 a month loan payment with $6,500 down ($266/mo payment); 2026 Camry Hybrid LE at $29,000: about $336 a month loan payment with $6,500 down (saves ~$39/mo on gas). With that car, insurance would go up about $57 a month and you'd save about $16 a month on gas. You have about $1,467 left over each month, and a payment up to $1,167 looks comfortable. Prices and recommendations are estimates built on synthetic data, not financial advice.",
    "curve": [],
    "crossover_month": null
  },
  "dev": {
    "profile_id": "dev",
    "recommendation": "keep",
    "result": {
      "keepResult": 110.23,
      "refinanceResult": 116.85,
      "tradeResult": 592.86,
      "repair_ratio": 0.5370370370370371,
      "pr_runway": -0.24811992763920654,
      "remaining_life": 0.14500000000000002,
      "new_payment": 473.98,
      "refi_payment": 0.0,
      "suggested_models": [
        {
          "name": "2026 Corolla LE",
          "price": 24500.0,
          "kind": "new",
          "seats": 5,
          "mpg": 35.0,
          "body": "sedan",
          "down_payment": 0.0,
          "new_payment": 473.98,
          "insurance_delta": 63.58,
          "fuel_delta": -8.23,
          "monthly_cost": 592.86,
          "reason": "lowest monthly cost, but over your comfortable payment"
        },
        {
          "name": "2026 Corolla Cross L",
          "price": 25335.0,
          "kind": "new",
          "seats": 5,
          "mpg": 32.0,
          "body": "suv",
          "down_payment": 0.0,
          "new_payment": 492.14,
          "insurance_delta": 66.02,
          "fuel_delta": -1.29,
          "monthly_cost": 623.7,
          "reason": "$492/mo payment"
        },
        {
          "name": "2026 Camry Hybrid LE",
          "price": 29000.0,
          "kind": "new",
          "seats": 5,
          "mpg": 51.0,
          "body": "sedan",
          "down_payment": 0.0,
          "new_payment": 571.83,
          "insurance_delta": 76.71,
          "fuel_delta": -31.45,
          "monthly_cost": 691.14,
          "reason": "saves ~$31/mo on gas"
        }
      ],
      "trade_affordable": false
    },
    "new_monthly_payment": 473.98,
    "suggested_models": null,
    "apr": 0.11,
    "down_payment": 0.0,
    "affordability": {
      "monthly_income": 2266.67,
      "monthly_spend": 2216.67,
      "savings_balance": 900.0,
      "monthly_surplus": 50.0,
      "runway_months": 0.4,
      "can_afford_payment": false,
      "max_comfortable_payment": 0.0
    },
    "market": {
      "current_vehicle_value_low": 2200.0,
      "current_vehicle_value_high": 3200.0,
      "scheduled_maintenance": [
        {
          "cost": 75.0,
          "interval": 5000
        },
        {
          "cost": 30.0,
          "interval": 5000
        },
        {
          "cost": 90.0,
          "interval": 30000
        },
        {
          "cost": 300.0,
          "interval": 40000
        },
        {
          "cost": 150.0,
          "interval": 100000
        }
      ],
      "replacement_options": [
        {
          "name": "2026 Corolla LE",
          "price": 24500,
          "kind": "new"
        },
        {
          "name": "2026 Corolla Cross L",
          "price": 25335,
          "kind": "new"
        },
        {
          "name": "2026 Camry Hybrid LE",
          "price": 29000,
          "kind": "new"
        },
        {
          "name": "2026 RAV4 Hybrid LE",
          "price": 31900,
          "kind": "new"
        },
        {
          "name": "2026 Sienna LE",
          "price": 40120,
          "kind": "new"
        }
      ],
      "repair_quotes": [
        {
          "shop": "South Austin Auto A/C",
          "estimate": 1150,
          "source": "fixture"
        },
        {
          "shop": "Quick Fix Garage",
          "estimate": 980,
          "source": "fixture"
        }
      ]
    },
    "explanation": "Repairing your 2010 Corolla is your best move: about $110 a month, compared with $593 to trade in. A new car payment doesn't fit your budget right now. Estimates, not financial advice.",
    "explanation_details": "Repairing and keeping your current car looks like the best move. Estimated monthly cost: keeping $110, trading $593. The repair is quoted at $1,450. That's about 54% of what the car is worth, and it costs more than your current savings. The car has about 15% of its expected life left. If you'd rather trade in, the best fit is 2026 Corolla LE at $24,500: about $474 a month loan payment with $0 down (lowest monthly cost, but over your comfortable payment). With that car, insurance would go up about $64 a month and you'd save about $8 a month on gas. You have about $50 left over each month, so there's no room for a new car payment right now. Prices and recommendations are estimates built on synthetic data, not financial advice.",
    "curve": [],
    "crossover_month": null
  }
};
