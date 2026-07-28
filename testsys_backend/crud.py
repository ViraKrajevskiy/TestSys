"""
crud.py
-------
CRUD операции для User.
"""

from sqlalchemy.orm import Session
from models import User
from schemas import UserCreate, UserUpdate


# ========== CREATE ==========
def create_user(db: Session, user: UserCreate) -> User:
    """Создать нового пользователя в БД."""
    db_user = User(**user.model_dump())
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


# ========== READ ==========
def get_user(db: Session, user_id: int) -> User | None:
    """Получить пользователя по ID."""
    return db.query(User).filter(User.id == user_id).first()


def get_user_by_email(db: Session, email: str) -> User | None:
    """Получить пользователя по email."""
    return db.query(User).filter(User.email == email).first()


def get_all_users(db: Session, skip: int = 0, limit: int = 100) -> list[User]:
    """Получить список всех пользователей с пагинацией."""
    return db.query(User).offset(skip).limit(limit).all()


# ========== UPDATE ==========
def update_user(db: Session, user_id: int, user_update: UserUpdate) -> User | None:
    """Обновить пользователя по ID."""
    db_user = db.query(User).filter(User.id == user_id).first()
    
    if not db_user:
        return None
    
    # Обновляем только переданные поля
    update_data = user_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_user, key, value)
    
    db.commit()
    db.refresh(db_user)
    return db_user


# ========== DELETE ==========
def delete_user(db: Session, user_id: int) -> bool:
    """Удалить пользователя по ID. Возвращает True если удалён, False если не найден."""
    db_user = db.query(User).filter(User.id == user_id).first()
    
    if not db_user:
        return False
    
    db.delete(db_user)
    db.commit()
    return True
