# @hitl/ml

Small FastAPI service holding the comfort model. Only `@hitl/web` calls it.

- `POST /predict` takes `{items: [{temperature_c, humidity_pct, hour}]}` and returns, for each item, the chance an occupant votes *perfect* (`comfort_score`) and the most likely vote.
- `POST /train` takes `{rows: [{temperature_c, humidity_pct, hour, vote}]}`, fits a random forest and saves it to `MODEL_DIR/comfort_rf.joblib`.
- `GET /health` reports which model is loaded.

Both POST routes need `Authorization: Bearer $ML_TOKEN`.

Until there are at least `ML_MIN_TRAINING_ROWS` (default 30) labelled votes in two or more classes, `/predict` answers with a rule-based estimate around `ML_HEURISTIC_SETPOINT_C` (default 24.5 °C) and reports `"model": "heuristic"`.

## Run locally

```bash
cd packages/ml
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
ML_TOKEN=dev uvicorn app.main:app --reload --port 8000
python -m pytest -q
```
