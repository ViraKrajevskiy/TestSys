"""
main.py
-------
FastAPI сервер с CRUD эндпоинтами для User.

Запуск:
    uvicorn main:app --reload --host 0.0.0.0 --port 8000

Документация:
    http://localhost:8000/docs (Swagger UI)
    http://localhost:8000/redoc (ReDoc)
"""

from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from database import get_db, init_db
from models import User
from schemas import UserCreate, UserResponse, UserUpdate
import crud
from data_generator import DataGenerator

# ========== Инициализация FastAPI ==========
app = FastAPI(
    title="TestSys Backend",
    description="CRUD API для User на FastAPI + PostgreSQL",
    version="1.0.0"
)

# ========== CORS (для фронта) ==========
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Разреши все источники (или укажи http://localhost:5000 и т.д.)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ========== Лайфцикл приложения ==========
@app.on_event("startup")
def startup():
    """Создать таблицы при запуске."""
    init_db()
    print("✓ БД инициализирована")


# ========== CRUD эндпоинты ==========

# ========== CREATE (POST) ==========
@app.post("/users", response_model=UserResponse, status_code=201)
def create_user(user: UserCreate, db: Session = Depends(get_db)):
    """Создать нового пользователя."""
    # Проверка дубликата email
    existing = crud.get_user_by_email(db, user.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email уже зарегистрирован")
    
    return crud.create_user(db, user)


# ========== READ (GET) ==========
@app.get("/users/{user_id}", response_model=UserResponse)
def get_user(user_id: int, db: Session = Depends(get_db)):
    """Получить пользователя по ID."""
    user = crud.get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return user


@app.get("/users", response_model=list[UserResponse])
def get_all_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """Получить список всех пользователей с пагинацией."""
    return crud.get_all_users(db, skip=skip, limit=limit)


# ========== UPDATE (PUT/PATCH) ==========
@app.put("/users/{user_id}", response_model=UserResponse)
def update_user(user_id: int, user_update: UserUpdate, db: Session = Depends(get_db)):
    """Обновить пользователя (полное обновление)."""
    user = crud.update_user(db, user_id, user_update)
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return user


@app.patch("/users/{user_id}", response_model=UserResponse)
def partial_update_user(user_id: int, user_update: UserUpdate, db: Session = Depends(get_db)):
    """Частичное обновление пользователя."""
    user = crud.update_user(db, user_id, user_update)
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return user


# ========== DELETE (DELETE) ==========
@app.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: int, db: Session = Depends(get_db)):
    """Удалить пользователя по ID."""
    success = crud.delete_user(db, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return None



# ========== DATA GENERATOR (AUTO-FILL) ==========
@app.post("/generate")
def generate_test_data():
    """
    Generate random test data for User schema.
    Returns dict with auto-filled fields ready to POST to /users
    
    Usage:
        POST /generate
        Response: {'name': 'John Smith', 'email': 'john123@gmail.com', ...}
    """
    return DataGenerator.generate_for_schema(UserCreate)


@app.get("/generate-schema")
def get_schema_hints():
    """
    Get field type hints for User schema.
    Useful for UI to know which generator to use for each field.
    
    Returns: {'name': 'name', 'email': 'email', 'phone': 'phone', ...}
    """
    return DataGenerator.get_field_hints(UserCreate)

# ========== Хелс-чек ==========
@app.get("/health")
def health_check():
    """Проверка здоровья сервера."""
    return {"status": "ok", "message": "TestSys Backend работает"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

# ========== ADVANCED RANDOMIZERS ==========
from custom_generator import RandomizerType1, randomizer as randomizer_type2

@app.post("/randomize/type1")
def randomize_type1(
    char_type: str = "mixed",
    length: int = 20,
    error_probability: float = 0.0,
):
    """
    Type 1 Randomizer: by data type
    - char_type: 'text', 'numbers', 'symbols', 'mixed', 'alphanumeric'
    - length: output length
    - error_probability: 0.0-1.0 (chance to inject error)
    """
    return {
        "value": RandomizerType1.generate(
            char_type=char_type,
            length=length,
            error_probability=error_probability,
        )
    }


@app.post("/randomize/type2")
def randomize_type2(
    list_name: str,
    count: int = 1,
    separator: str = "",
    error_probability: float = 0.0,
):
    """
    Type 2 Randomizer: from custom word lists
    - list_name: which word list to use
    - count: number of words to pick
    - separator: join with (space, comma, etc.)
    - error_probability: chance to inject error
    """
    return {
        "value": randomizer_type2.generate(
            list_name=list_name,
            count=count,
            separator=separator,
            error_probability=error_probability,
        )
    }


@app.get("/randomize/lists")
def get_word_lists():
    """Get available word lists"""
    return {"lists": randomizer_type2.get_list_names()}


@app.post("/randomize/lists/add")
def add_word_list(list_name: str, words: list):
    """Add new word list"""
    success = randomizer_type2.add_word_list(list_name, words)
    return {"success": success, "list_name": list_name}


@app.post("/randomize/lists/import")
def import_word_lists(json_data: str):
    """Import word lists from JSON"""
    success = randomizer_type2.load_from_json(json_data)
    if success:
        return {"success": True, "lists": randomizer_type2.get_list_names()}
    return {"success": False, "error": "Invalid JSON"}


@app.get("/randomize/lists/export")
def export_word_lists():
    """Export all word lists as JSON"""
    return {"data": randomizer_type2.export_to_json()}


@app.delete("/randomize/lists/{list_name}")
def delete_word_list(list_name: str):
    """Delete word list"""
    success = randomizer_type2.delete_list(list_name)
    return {"success": success}

