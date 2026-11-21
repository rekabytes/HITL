"""HTTP wrapper around the comfort model. Only the web app talks to this service."""

from __future__ import annotations

import hmac
import os
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from .model import ComfortModel

TOKEN = os.getenv("ML_TOKEN", "")
model = ComfortModel(os.getenv("MODEL_DIR", "./data"))

app = FastAPI(title="HITL comfort model", version="0.1.0")

if not TOKEN:
    print("[ml] ML_TOKEN is empty: the API is open. Set it outside local development.")


def require_token(authorization: str | None = Header(default=None)) -> None:
    if not TOKEN:
        return
    given = (authorization or "").removeprefix("Bearer ").strip()
    if not hmac.compare_digest(given, TOKEN):
        raise HTTPException(status_code=401, detail="Bad token")


class PredictItem(BaseModel):
    temperature_c: float = Field(ge=-20, le=70)
    humidity_pct: float = Field(ge=0, le=100)
    hour: int = Field(ge=0, le=23)


class PredictRequest(BaseModel):
    items: list[PredictItem] = Field(max_length=1000)


class TrainRow(PredictItem):
    vote: Literal["too_cold", "perfect", "too_hot"]


class TrainRequest(BaseModel):
    rows: list[TrainRow] = Field(max_length=500_000)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "model": model.name, "trained_at": model.trained_at}


@app.post("/predict", dependencies=[Depends(require_token)])
def predict(req: PredictRequest) -> dict:
    preds = model.predict([(i.temperature_c, i.humidity_pct, i.hour) for i in req.items])
    return {"predictions": preds}


@app.post("/train", dependencies=[Depends(require_token)])
def train(req: TrainRequest) -> dict:
    return model.train([(r.temperature_c, r.humidity_pct, r.hour, r.vote) for r in req.rows])
