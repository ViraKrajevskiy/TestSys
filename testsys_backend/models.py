"""
models.py
---------
SQLAlchemy модели для таблиц БД.
"""

from sqlalchemy import Column, Integer, String, Text
from database import Base


class User(Base):
    """Модель User для таблицы users в БД."""
    
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    phone = Column(String(20), nullable=True)
    company = Column(String(255), nullable=True)
    website = Column(String(255), nullable=True)
    address = Column(Text, nullable=True)

    class Config:
        from_attributes = True
