"""
data_generator.py
-----------------
Flexible data generation engine for auto-filling request fields.
Detects field types from Pydantic schemas and generates appropriate test data.
"""

import random
import string
import re
from typing import Any, Dict, Type, get_origin, get_args, Optional, Union
from datetime import datetime, timedelta
from pydantic import BaseModel, EmailStr


class DataGenerator:
    """Generate test data based on field type inspection."""

    FAKE_NAMES = [
        "John Smith", "Emma Johnson", "Michael Brown", "Sarah Davis",
        "James Wilson", "Emily Taylor", "Robert Anderson", "Jessica Martin",
        "David Thompson", "Lisa White", "Christopher Harris", "Mary Clark",
    ]

    FAKE_DOMAINS = ["gmail.com", "yahoo.com", "example.com", "test.org", "company.net"]

    FAKE_COMPANIES = [
        "Tech Corp", "Data Systems", "Cloud Solutions", "AI Innovations",
        "Digital Labs", "Software House", "Web Ventures", "Network Pro"
    ]

    FAKE_CITIES = [
        "New York", "Los Angeles", "Chicago", "Houston", "Phoenix",
        "London", "Paris", "Berlin", "Tokyo", "Sydney"
    ]

    COMMON_HTTP_CODES = [200, 201, 204, 400, 401, 403, 404, 500, 502, 503]

    @classmethod
    def generate_for_schema(cls, schema: Type[BaseModel]) -> Dict[str, Any]:
        """
        Auto-fill a Pydantic schema with appropriate test data.
        Inspects field names and types to generate relevant values.

        Example:
            from schemas import UserCreate
            data = DataGenerator.generate_for_schema(UserCreate)
            # Returns: {'name': 'John Smith', 'email': 'john123@gmail.com', ...}
        """
        result = {}

        if hasattr(schema, "model_fields"):
            fields = schema.model_fields  # Pydantic v2
        else:
            fields = schema.__fields__  # Pydantic v1

        for field_name, field_info in fields.items():
            value = cls.generate_field(field_name, field_info)
            if value is not None:
                result[field_name] = value

        return result

    @classmethod
    def generate_field(cls, field_name: str, field_info: Any) -> Any:
        """
        Generate value for a single field based on name heuristics and type.
        """
        field_type = field_info.annotation if hasattr(field_info, "annotation") else type(field_info)

        # Handle Optional types
        if get_origin(field_type) is Union:
            args = get_args(field_type)
            if type(None) in args:
                field_type = next(arg for arg in args if arg is not type(None))

        # Type-based generation
        if field_type == EmailStr or field_type == str and "email" in field_name.lower():
            return cls.generate_email()

        if "password" in field_name.lower():
            return cls.generate_password()

        if "phone" in field_name.lower() or "tel" in field_name.lower():
            return cls.generate_phone()

        if "url" in field_name.lower() or "website" in field_name.lower():
            return cls.generate_url()

        if "company" in field_name.lower():
            return random.choice(cls.FAKE_COMPANIES)

        if "address" in field_name.lower():
            return cls.generate_address()

        if "code" in field_name.lower() or "status" in field_name.lower():
            return random.choice(cls.COMMON_HTTP_CODES)

        if "date" in field_name.lower() or "time" in field_name.lower():
            return cls.generate_datetime()

        if field_type == int:
            return random.randint(1, 100)

        if field_type == float:
            return round(random.uniform(1.0, 100.0), 2)

        if field_type == bool:
            return random.choice([True, False])

        if field_type == str or field_type == "string":
            if "name" in field_name.lower():
                return random.choice(cls.FAKE_NAMES)
            if "title" in field_name.lower() or "subject" in field_name.lower():
                return cls.generate_title()
            if "description" in field_name.lower():
                return cls.generate_description()

            return cls.generate_text()

        return None

    @classmethod
    def generate_email(cls) -> str:
        """Generate fake email."""
        name = random.choice(cls.FAKE_NAMES).split()[0].lower()
        suffix = random.randint(1, 999)
        domain = random.choice(cls.FAKE_DOMAINS)
        return f"{name}{suffix}@{domain}"

    @classmethod
    def generate_password(cls) -> str:
        """Generate strong password: 12 chars with upper, lower, digit, special."""
        chars = (
            random.choice(string.ascii_uppercase)
            + random.choice(string.ascii_lowercase)
            + random.choice(string.digits)
            + random.choice("!@#$%^&*")
            + "".join(random.choices(string.ascii_letters + string.digits, k=8))
        )
        return "".join(random.sample(chars, len(chars)))

    @classmethod
    def generate_phone(cls) -> str:
        """Generate fake phone number."""
        return f"+1{random.randint(200, 999)}{random.randint(200, 999)}{random.randint(1000, 9999)}"

    @classmethod
    def generate_url(cls) -> str:
        """Generate fake URL."""
        name = random.choice(cls.FAKE_COMPANIES).replace(" ", "").lower()
        domain = random.choice(["com", "org", "net", "io"])
        return f"https://{name}.{domain}"

    @classmethod
    def generate_address(cls) -> str:
        """Generate fake address."""
        street_num = random.randint(1, 999)
        street_names = ["Main", "Oak", "Maple", "Pine", "Elm", "Broadway"]
        street_type = random.choice(["St", "Ave", "Blvd", "Ln", "Dr"])
        city = random.choice(cls.FAKE_CITIES)
        state_codes = ["NY", "CA", "TX", "FL", "IL", "PA"]
        state = random.choice(state_codes)
        zipcode = random.randint(10000, 99999)
        return f"{street_num} {random.choice(street_names)} {street_type}, {city}, {state} {zipcode}"

    @classmethod
    def generate_text(cls, length: int = 50) -> str:
        """Generate random text."""
        words = [
            "lorem", "ipsum", "dolor", "sit", "amet", "consectetur",
            "adipiscing", "elit", "sed", "do", "eiusmod", "tempor"
        ]
        return " ".join(random.choices(words, k=length // 6))

    @classmethod
    def generate_title(cls) -> str:
        """Generate short title."""
        prefixes = ["The", "A", "New", "Advanced", "Simple"]
        topics = ["Guide", "Tutorial", "Introduction", "Overview", "Manual"]
        return f"{random.choice(prefixes)} {random.choice(topics)}"

    @classmethod
    def generate_description(cls) -> str:
        """Generate description text."""
        return cls.generate_text(100)

    @classmethod
    def generate_datetime(cls) -> str:
        """Generate ISO datetime string."""
        days_offset = random.randint(-30, 30)
        dt = datetime.now() + timedelta(days=days_offset)
        return dt.isoformat()

    @classmethod
    def detect_type_from_field_name(cls, field_name: str) -> str:
        """
        Detect probable field type from name.
        Useful for UI hints.
        """
        field_lower = field_name.lower()

        if "email" in field_lower:
            return "email"
        if "password" in field_lower or "pwd" in field_lower:
            return "password"
        if "phone" in field_lower or "tel" in field_lower:
            return "phone"
        if "url" in field_lower or "website" in field_lower:
            return "url"
        if "date" in field_lower or "time" in field_lower:
            return "datetime"
        if "code" in field_lower or "status" in field_lower:
            return "status_code"
        if "name" in field_lower:
            return "name"
        if "address" in field_lower:
            return "address"
        if "title" in field_lower or "subject" in field_lower:
            return "title"
        if "description" in field_lower or "content" in field_lower:
            return "text"

        return "text"

    @classmethod
    def get_field_hints(cls, schema: Type[BaseModel]) -> Dict[str, str]:
        """
        Return type hints for all fields in a schema.
        Useful for UI to show what kind of data generator to use.
        """
        hints = {}

        if hasattr(schema, "model_fields"):
            fields = schema.model_fields
        else:
            fields = schema.__fields__

        for field_name in fields:
            hints[field_name] = cls.detect_type_from_field_name(field_name)

        return hints
