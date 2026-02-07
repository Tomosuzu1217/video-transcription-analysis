import json
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.app_setting import AppSetting

router = APIRouter(tags=["settings"])

GEMINI_KEYS_SETTING = "gemini_api_keys"
GEMINI_MODEL_SETTING = "gemini_model"

AVAILABLE_MODELS = [
    {"id": "gemini-3.0-flash", "label": "Gemini 3.0 Flash"},
    {"id": "gemini-2.5-flash", "label": "Gemini 2.5 Flash"},
    {"id": "gemini-2.0-flash", "label": "Gemini 2.0 Flash"},
    {"id": "gemini-2.0-flash-lite", "label": "Gemini 2.0 Flash Lite"},
    {"id": "gemini-1.5-flash", "label": "Gemini 1.5 Flash"},
]


def _get_setting(db: Session, key: str) -> str | None:
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    return row.value if row else None


def _set_setting(db: Session, key: str, value: str) -> None:
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    if row:
        row.value = value
    else:
        db.add(AppSetting(key=key, value=value))
    db.commit()


# ── API Keys ────────────────────────────────────────────────────

class ApiKeyAdd(BaseModel):
    key: str


class ApiKeyDelete(BaseModel):
    index: int


def get_api_keys(db: Session) -> list[str]:
    raw = _get_setting(db, GEMINI_KEYS_SETTING)
    if not raw:
        return []
    try:
        keys = json.loads(raw)
        return [k for k in keys if k]
    except json.JSONDecodeError:
        return []


@router.get("/settings/api-keys")
def list_api_keys(db: Session = Depends(get_db)):
    keys = get_api_keys(db)
    masked = []
    for k in keys:
        if len(k) > 8:
            masked.append(k[:4] + "*" * (len(k) - 8) + k[-4:])
        else:
            masked.append("*" * len(k))
    return {"keys": masked, "count": len(keys)}


@router.post("/settings/api-keys")
def add_api_key(body: ApiKeyAdd, db: Session = Depends(get_db)):
    key = body.key.strip()
    if not key:
        return {"error": "APIキーが空です"}
    keys = get_api_keys(db)
    if key in keys:
        return {"error": "このAPIキーは既に登録されています"}
    keys.append(key)
    _set_setting(db, GEMINI_KEYS_SETTING, json.dumps(keys))
    return {"message": "APIキーを追加しました", "count": len(keys)}


@router.delete("/settings/api-keys")
def remove_api_key(body: ApiKeyDelete, db: Session = Depends(get_db)):
    keys = get_api_keys(db)
    if body.index < 0 or body.index >= len(keys):
        return {"error": "無効なインデックスです"}
    keys.pop(body.index)
    _set_setting(db, GEMINI_KEYS_SETTING, json.dumps(keys))
    return {"message": "APIキーを削除しました", "count": len(keys)}


# ── Model Selection ─────────────────────────────────────────────

class ModelSelect(BaseModel):
    model: str


def get_selected_model(db: Session) -> str:
    val = _get_setting(db, GEMINI_MODEL_SETTING)
    return val if val else "gemini-2.5-flash"


@router.get("/settings/model")
def get_model_setting(db: Session = Depends(get_db)):
    return {
        "current": get_selected_model(db),
        "available": AVAILABLE_MODELS,
    }


@router.put("/settings/model")
def set_model_setting(body: ModelSelect, db: Session = Depends(get_db)):
    _set_setting(db, GEMINI_MODEL_SETTING, body.model.strip())
    return {"message": "モデルを変更しました", "current": body.model.strip()}


# ── Health / validation ─────────────────────────────────────────

@router.post("/settings/api-keys/test")
def test_api_keys(db: Session = Depends(get_db)):
    """Test all stored API keys and return which ones are valid."""
    keys = get_api_keys(db)
    if not keys:
        return {"results": [], "message": "APIキーが登録されていません"}

    from google import genai
    model = get_selected_model(db)
    results = []

    for i, key in enumerate(keys):
        try:
            client = genai.Client(api_key=key)
            resp = client.models.generate_content(
                model=model,
                contents="Say OK",
            )
            results.append({"index": i, "valid": True})
        except Exception as e:
            results.append({"index": i, "valid": False, "error": str(e)[:100]})

    return {"results": results, "model": model}


class ApiKeyTestSingle(BaseModel):
    index: int


@router.post("/settings/api-keys/test-one")
def test_single_api_key(body: ApiKeyTestSingle, db: Session = Depends(get_db)):
    """Test a single API key by index."""
    keys = get_api_keys(db)
    if body.index < 0 or body.index >= len(keys):
        return {"index": body.index, "valid": False, "error": "無効なインデックスです"}

    from google import genai
    model = get_selected_model(db)
    key = keys[body.index]

    try:
        client = genai.Client(api_key=key)
        client.models.generate_content(model=model, contents="Say OK")
        return {"index": body.index, "valid": True}
    except Exception as e:
        return {"index": body.index, "valid": False, "error": str(e)[:100]}
