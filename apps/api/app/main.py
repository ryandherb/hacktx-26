import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routes import router

REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.append(str(REPO_ROOT))

from issue_1_pre_quote_survey.app.pre_quote_routes import router as pre_quote_router  # noqa: E402
from issue_2_cost_agent.app.cost_routes import router as cost_router  # noqa: E402

app = FastAPI(title="Next Move API")

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.web_origins,
    allow_origin_regex=settings.web_origin_regex or None,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(pre_quote_router)
app.include_router(cost_router)
