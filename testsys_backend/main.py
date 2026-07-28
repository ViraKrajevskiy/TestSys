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


# ========== Хелс-чек ==========
@app.get("/health")
def health_check():
    """Проверка здоровья сервера."""
    return {"status": "ok", "message": "TestSys Backend работает"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
