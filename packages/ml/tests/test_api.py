import importlib
import random

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("MODEL_DIR", str(tmp_path))
    monkeypatch.setenv("ML_TOKEN", "test-token")
    import app.main as main

    importlib.reload(main)
    return TestClient(main.app, headers={"Authorization": "Bearer test-token"})


def synthetic_votes(n=120, seed=1):
    """People here call 23.5-25.5 °C perfect, hotter is too hot, colder too cold."""
    rnd = random.Random(seed)
    rows = []
    for _ in range(n):
        t = rnd.uniform(20, 30)
        vote = "too_hot" if t > 25.5 else "too_cold" if t < 23.5 else "perfect"
        rows.append({"temperature_c": t, "humidity_pct": rnd.uniform(45, 80), "hour": rnd.randint(8, 18), "vote": vote})
    return rows


def test_health_starts_on_heuristic(client):
    body = client.get("/health").json()
    assert body["model"] == "heuristic"
    assert body["trained_at"] is None


def test_token_required(client):
    r = client.post("/predict", json={"items": []}, headers={"Authorization": "Bearer wrong"})
    assert r.status_code == 401


def test_heuristic_prediction(client):
    r = client.post("/predict", json={"items": [{"temperature_c": 24.5, "humidity_pct": 55, "hour": 10}]})
    p = r.json()["predictions"][0]
    assert p["model"] == "heuristic"
    assert p["predicted_vote"] == "perfect"
    assert p["comfort_score"] > 0.9


def test_train_skips_with_too_few_votes(client):
    r = client.post("/train", json={"rows": synthetic_votes(10)})
    assert r.json()["status"] == "skipped"


def test_train_skips_with_one_class(client):
    rows = [{"temperature_c": 28, "humidity_pct": 60, "hour": 12, "vote": "too_hot"}] * 40
    assert client.post("/train", json={"rows": rows}).json()["status"] == "skipped"


def test_train_then_predict(client):
    r = client.post("/train", json={"rows": synthetic_votes()})
    body = r.json()
    assert body["status"] == "succeeded"
    assert body["metrics"]["accuracy"] > 0.7

    assert client.get("/health").json()["model"] == "random_forest"
    preds = client.post(
        "/predict",
        json={"items": [{"temperature_c": 29, "humidity_pct": 60, "hour": 14}, {"temperature_c": 24.5, "humidity_pct": 60, "hour": 14}]},
    ).json()["predictions"]
    assert preds[0]["predicted_vote"] == "too_hot"
    assert preds[1]["predicted_vote"] == "perfect"
    assert preds[1]["comfort_score"] > preds[0]["comfort_score"]


def test_model_survives_restart(client, tmp_path):
    client.post("/train", json={"rows": synthetic_votes()})
    import app.main as main

    importlib.reload(main)
    assert main.model.name == "random_forest"
