"""
schemas.py
----------
Pydantic схемы для валидации и сериализации данных.
"""

from pydantic import BaseModel, EmailStr
from typing import Optional


class UserBase(BaseModel):
    """Базовая схема User (общие поля для Create и Update)."""
    name: str
    email: EmailStr
    phone: Optional[str] = None
    company: Optional[str] = None
    website: Optional[str] = None
    address: Optional[str] = None


class UserCreate(UserBase):
    """Схема для создания User (POST)."""
    pass


class UserUpdate(BaseModel):
    """Схема для обновления User (PUT/PATCH) — все поля опциональны."""
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    website: Optional[str] = None
    address: Optional[str] = None


class UserResponse(UserBase):
    """Схема ответа с id."""
    id: int

    class Config:
        from_attributes = True
