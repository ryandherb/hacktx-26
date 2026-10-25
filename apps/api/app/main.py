from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.cost_routes import router as cost_router
from app.pre_quote_routes import router as pre_quote_router
from app.routes import router

app = FastAPI(title="Next Move API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[get_settings().web_origin],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(pre_quote_router)  # POST /pre-quote-survey (issue #1)
app.include_router(cost_router)  # POST /quote, POST /onboarding (issue #2)
