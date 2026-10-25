# Issue #1: Pre-Quote Survey Backend

Implements [GitHub issue #1](https://github.com/ryandherb/hacktx-26/issues/1).
All changes for this feature live in `issue_1_pre_quote_survey/`. Shared API files,
frontend files, root documentation, and dependency manifests are unchanged so this
folder can merge independently of the team's other features.

## Layout (mirrors the root README)

`app/` mirrors `apps/api/app/`, `web/` mirrors `apps/web/`, and `tests/` mirrors
`apps/api/tests/`. Every file name is unique against the shared tree. The `__init__.py`
files are empty, like the shared ones, and `app/seeds/toyota_profiles.json` is
byte-identical to the shared seed. Unpacking therefore only adds files and never changes
an existing one.

```
issue_1_pre_quote_survey/
  app/
    models/pre_quote_schemas.py     request, response, and complete Cost Agent input models
    seeds/pre_quote_profiles.py     raw profile loader + overridable FastAPI dependency
    seeds/toyota_profiles.json      copy of apps/api/app/seeds/toyota_profiles.json
    pre_quote_service.py            deterministic profile merge and missing-field questions
    pre_quote_routes.py             mountable POST /pre-quote-survey router
  web/lib/pre_quote_api.ts          TypeScript types for the frontend
  tests/test_pre_quote_survey.py    offline route, validation, and integration tests
  pre_quote_api.py                  standalone review server (not unpacked)
  pre_quote_pytest.ini, pre_quote_requirements.txt, PRE_QUOTE_README.md
```

Imports inside `app/` are relative, so they work unchanged after unpacking.

## Run and test before integration

Run from the repository root using the existing backend virtual environment:

```powershell
apps/api/.venv/Scripts/python.exe -m uvicorn issue_1_pre_quote_survey.pre_quote_api:app --host 127.0.0.1 --port 8000
apps/api/.venv/Scripts/python.exe -m pytest -q -c issue_1_pre_quote_survey/pre_quote_pytest.ini issue_1_pre_quote_survey/tests
apps/api/.venv/Scripts/python.exe -m pytest -q -c apps/api/pytest.ini apps/api/tests issue_1_pre_quote_survey/tests
```

Open `http://127.0.0.1:8000/docs` for the standalone survey API (CORS allows
`http://localhost:3000`; set `WEB_ORIGIN` to change it). The shared `app.main:app` does
not expose the survey until the router is mounted during integration. For a new virtual
environment, install `pre_quote_requirements.txt`; `apps/api/requirements.txt` already
covers it.

## Unpack after all branches merge

1. Copy `app/*` into `apps/api/app/`, `web/*` into `apps/web/`, and `tests/*` into
   `apps/api/tests/`.
2. Mount the router in `apps/api/app/main.py`:

   ```python
   from app.pre_quote_routes import router as pre_quote_router

   app.include_router(pre_quote_router)
   ```

3. In `tests/test_pre_quote_survey.py`, replace `issue_1_pre_quote_survey.app` with `app`
   and `issue_1_pre_quote_survey.pre_quote_api` with `app.main`.
4. Profiles: after unpacking, `seeds/pre_quote_profiles.py` reads the shared
   `seeds/toyota_profiles.json`. To use another source, override the dependency with a
   function returning raw `list[dict]` records, including incomplete ones. Don't pass them
   through the strict `Profile` model first:
   `app.dependency_overrides[survey_profile_records] = load_raw_toyota_profiles`.
   Keys used: `id`, `open_issue`, `vehicle_model`, `vehicle_year`, `zip_code`.
5. Frontend: render returned `questions`, keep `answers` in client state, and POST the full
   state each turn. When `complete` is `true`, send `quote_input` to the Cost Agent
   (`POST /quote`, issue #2). Fold the types into `lib/api.ts` when the team syncs schemas.
6. Run `pytest` from `apps/api` and check `/docs`.

## API contract


`POST /pre-quote-survey` collects `repair_type`, `vehicle_model`, `vehicle_year`, and
`location`. It performs no quoting, valuation, or finance onboarding. It works offline
without API keys. Location accepts a ZIP code (as a string, preserving leading zeros)
or city and state; it is not geocoded or verified against a location service.

Start with `{ "profile_id": "maria" }` to prefill from `open_issue`, `vehicle_model`,
`vehicle_year`, and `zip_code`. Use `{}` for manual intake without a Toyota profile.
Incomplete profiles are read independently of the full analysis profile schema so
missing unrelated data cannot block intake. Missing, blank, or invalid stored values
produce questions. An unknown profile ID returns HTTP 404.

User-provided `answers` override profile defaults. Omitted fields keep defaults;
explicit `null` or blank text clears a default and asks for that field again. Text is
trimmed and limited to 500 characters. Vehicle year must be a JSON integer from 1886
through next year. Invalid submitted values and unexpected fields return HTTP 422.

```json
{
  "profile_id": "maria",
  "answers": { "repair_type": "Brake pads", "location": "Austin, TX" }
}
```

The response contains merged `answers`, ordered `missing_fields`, and `questions`
with `field`, `prompt`, and `input_type` (`text` or `number`). When anything is missing,
`complete` is `false` and `quote_input` is `null`. Once all four fields are present,
`complete` is `true`, the question lists are empty, and `quote_input` contains:

```json
{
  "repair_type": "Brake pads",
  "vehicle_model": "Camry",
  "vehicle_year": 2012,
  "location": "Austin, TX"
}
```

The frontend owns survey state: send the selected `profile_id` and accumulated
`answers` on every request. The API does not save answers or modify Toyota profiles.
Descriptions such as "engine not starting" are accepted verbatim; quotability and
repair classification belong to issue #2. Interactive request/response schemas are
available at `http://localhost:8000/docs`. No survey UI is included.
