"""Standalone review server; mount app.pre_quote_routes.router in the shared app after merging."""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .app.pre_quote_routes import router

app = FastAPI(title="Issue #1: Pre-Quote Survey API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("WEB_ORIGIN", "http://localhost:3000")],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)
