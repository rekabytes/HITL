"""Comfort model: predicts how an occupant will vote from room conditions.

Trained on real votes (too_cold / perfect / too_hot) paired with the
temperature and humidity in the room when the vote was cast. Until there is
enough data, a rule-based estimate stands in so the dashboard always has a value.
"""

from __future__ import annotations

import math
import os
import tempfile
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, f1_score
from sklearn.model_selection import train_test_split

VOTES = ("too_cold", "perfect", "too_hot")
MIN_ROWS = int(os.getenv("ML_MIN_TRAINING_ROWS", "30"))
SETPOINT_C = float(os.getenv("ML_HEURISTIC_SETPOINT_C", "24.5"))


def features(temperature_c: float, humidity_pct: float, hour: int) -> list[float]:
    # Hour as a point on a circle so 23:00 and 00:00 are neighbours.
    angle = 2 * math.pi * (hour % 24) / 24
    return [temperature_c, humidity_pct, math.sin(angle), math.cos(angle)]


def heuristic(temperature_c: float, humidity_pct: float) -> tuple[float, str]:
    """Fallback with no training data. Comfort drops off away from the setpoint and in very humid air."""
    off = abs(temperature_c - SETPOINT_C)
    humid = max(0.0, humidity_pct - 70) * 0.01
    score = max(0.0, min(1.0, 1 - off * 0.18 - humid))
    if temperature_c > SETPOINT_C + 1.5:
        vote = "too_hot"
    elif temperature_c < SETPOINT_C - 1.5:
        vote = "too_cold"
    else:
        vote = "perfect"
    return round(score, 4), vote


@dataclass
class Loaded:
    clf: RandomForestClassifier | None = None
    trained_at: str | None = None
    rows: int = 0
    metrics: dict[str, Any] = field(default_factory=dict)


class ComfortModel:
    def __init__(self, model_dir: str | Path):
        self.dir = Path(model_dir)
        self.path = self.dir / "comfort_rf.joblib"
        self._lock = threading.Lock()
        self._state = Loaded()
        self.load()

    # ---- persistence ----
    def load(self) -> None:
        if not self.path.exists():
            return
        try:
            data = joblib.load(self.path)
            self._state = Loaded(data["clf"], data["trained_at"], data["rows"], data["metrics"])
        except Exception as exc:  # a broken file should not stop the service
            print(f"[ml] could not load {self.path}: {exc}")

    def _save(self, state: Loaded) -> None:
        self.dir.mkdir(parents=True, exist_ok=True)
        # Write then rename, so a crash mid-write never leaves a half file.
        fd, tmp = tempfile.mkstemp(dir=self.dir, suffix=".tmp")
        os.close(fd)
        joblib.dump(
            {"clf": state.clf, "trained_at": state.trained_at, "rows": state.rows, "metrics": state.metrics},
            tmp,
        )
        os.replace(tmp, self.path)

    # ---- info ----
    @property
    def name(self) -> str:
        return "random_forest" if self._state.clf is not None else "heuristic"

    @property
    def trained_at(self) -> str | None:
        return self._state.trained_at

    # ---- predict ----
    def predict(self, items: list[tuple[float, float, int]]) -> list[dict[str, Any]]:
        state = self._state
        if state.clf is None:
            out = []
            for t, h, _ in items:
                score, vote = heuristic(t, h)
                out.append({"comfort_score": score, "predicted_vote": vote, "model": "heuristic"})
            return out

        X = np.array([features(t, h, hr) for t, h, hr in items], dtype=float)
        proba = state.clf.predict_proba(X)
        classes = list(state.clf.classes_)
        perfect_idx = classes.index("perfect") if "perfect" in classes else None
        out = []
        for row in proba:
            out.append(
                {
                    "comfort_score": round(float(row[perfect_idx]) if perfect_idx is not None else 0.0, 4),
                    "predicted_vote": classes[int(np.argmax(row))],
                    "model": "random_forest",
                }
            )
        return out

    # ---- train ----
    def train(self, rows: list[tuple[float, float, int, str]]) -> dict[str, Any]:
        rows = [r for r in rows if r[3] in VOTES]
        labels = [r[3] for r in rows]
        counts = {v: labels.count(v) for v in VOTES}
        if len(rows) < MIN_ROWS:
            return self._skip(len(rows), counts, f"Need at least {MIN_ROWS} labelled votes, have {len(rows)}.")
        if sum(1 for c in counts.values() if c > 0) < 2:
            return self._skip(len(rows), counts, "All votes are the same, nothing to learn yet.")

        X = np.array([features(t, h, hr) for t, h, hr, _ in rows], dtype=float)
        y = np.array(labels)

        def new_clf() -> RandomForestClassifier:
            return RandomForestClassifier(
                n_estimators=300, min_samples_leaf=2, class_weight="balanced", random_state=42, n_jobs=-1
            )

        metrics: dict[str, Any] = {"class_counts": counts}
        # Hold out 20% to report honest numbers, when every class has enough rows to split.
        if min(c for c in counts.values() if c > 0) >= 2 and len(rows) >= 40:
            X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, stratify=y, random_state=42)
            probe = new_clf().fit(X_tr, y_tr)
            pred = probe.predict(X_te)
            metrics["accuracy"] = round(float(accuracy_score(y_te, pred)), 4)
            metrics["f1_macro"] = round(float(f1_score(y_te, pred, average="macro")), 4)
            metrics["holdout_rows"] = int(len(y_te))

        clf = new_clf().fit(X, y)  # final model uses every row
        metrics["feature_importance"] = dict(
            zip(["temperature_c", "humidity_pct", "hour_sin", "hour_cos"], [round(float(v), 4) for v in clf.feature_importances_])
        )
        state = Loaded(clf, datetime.now(timezone.utc).isoformat(), len(rows), metrics)
        with self._lock:
            self._save(state)
            self._state = state
        return {"status": "succeeded", "algorithm": "random_forest", "rows": len(rows), "metrics": metrics}

    @staticmethod
    def _skip(n: int, counts: dict[str, int], reason: str) -> dict[str, Any]:
        return {"status": "skipped", "algorithm": None, "rows": n, "metrics": {"class_counts": counts}, "reason": reason}
