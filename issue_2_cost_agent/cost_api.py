"""Standalone review server: survey (#1) + Cost Agent (#2). Mount the routers in the shared app after merging."""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from issue_1_pre_quote_survey.app.pre_quote_routes import router as pre_quote_router

from .app.cost_routes import router as cost_router

app = FastAPI(title="Issue #2: Cost Agent API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("WEB_ORIGIN", "http://localhost:3000")],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(pre_quote_router)
app.include_router(cost_router)
