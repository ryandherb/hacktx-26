# Issue #1: Pre-Quote Survey Backend

Implements [GitHub issue #1](https://github.com/ryandherb/hacktx-26/issues/1).
All changes for this feature live in `issue_1_pre_quote_survey/`. Shared API files,
frontend files, root documentation, and dependency manifests are unchanged so this
folder can merge independently of the team's other features. This reduces conflict
surface; it cannot guarantee a conflict-free merge if someone edits the same folder.

## Run and test before integration

Run from the repository root using the existing backend virtual environment:

```powershell
apps/api/.venv/Scripts/python.exe -m uvicorn issue_1_pre_quote_survey.pre_quote_api:app --host 127.0.0.1 --port 8000
apps/api/.venv/Scripts/python.exe -m pytest -q -c issue_1_pre_quote_survey/pytest.ini issue_1_pre_quote_survey/tests
```

Open `http://127.0.0.1:8000/docs` for the standalone survey API. If port 8000 is in use,
stop the old backend process first or choose another port. The standalone server
exposes only this feature. The shared backend's `app.main:app` does not expose the
survey until the router is mounted during integration.

For a new virtual environment, install `issue_1_pre_quote_survey/requirements.txt`.
It contains only the dependencies needed to run and test this package. The existing
`apps/api/requirements.txt` already includes these dependencies.

Run the shared backend regression tests together with this package from the root:

```powershell
apps/api/.venv/Scripts/python.exe -m pytest -q -c apps/api/pytest.ini apps/api/tests issue_1_pre_quote_survey/tests
```

## Package contents

- `pre_quote_schemas.py`: request, response, and complete Cost Agent input models.
- `pre_quote_service.py`: deterministic profile merge and missing-field questions.
- `pre_quote_profiles.py`: local fixture loader and overridable profile dependency.
- `pre_quote_router.py`: mountable `POST /pre-quote-survey` router.
- `pre_quote_api.py`: standalone review server with CORS for `http://localhost:3000`.
  Set `WEB_ORIGIN` in the shell to use a different origin.
- `pre_quote_contract.ts`: matching TypeScript contracts for later frontend integration.
- `fixtures/toyota_profiles.json`: copied synthetic demo profiles, not production data.
- `tests/test_pre_quote_survey.py`: offline route, validation, and integration tests.

## Connect after all branches merge

The folder can stay in place; it does not need to be physically unpacked. If the team
moves it into the API tree, update its Python import paths and test commands together.

1. Mount the feature's router in the shared FastAPI application:

   ```python
   from issue_1_pre_quote_survey.pre_quote_router import router as pre_quote_router

   app.include_router(pre_quote_router)
   ```

2. Replace the bundled demo profile source with the team's raw Toyota profile adapter.
   It must return `list[dict]`, including incomplete records. Do not pass records through
   the existing strict `Profile` model before intake. Register the dependency on the
   shared app, keeping the adapter in the team's chosen integration location:

   ```python
   from issue_1_pre_quote_survey.pre_quote_profiles import survey_profile_records

   app.dependency_overrides[survey_profile_records] = load_raw_toyota_profiles
   ```

   `load_raw_toyota_profiles` is the integration function the team supplies. Record
   keys used here are `id`, `open_issue`, `vehicle_model`, `vehicle_year`, and `zip_code`.
   Missing values are allowed. The standalone demo uses only its bundled fixtures.

3. Import or move `pre_quote_contract.ts` into the frontend API layer. Render returned
   `questions`, retain `answers` in client state, and POST the full state each turn.
4. Continue to the future Cost Agent only when `complete` is `true`, using `quote_input`.
   No Cost Agent endpoint or frontend screen is implemented by this issue.
5. Run both test suites and check the shared application's `/docs` after integration.

The package-local schema and TypeScript contract deliberately remain together here
instead of editing the shared schema/type files during parallel branch work.

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
