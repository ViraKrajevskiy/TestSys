# TestSys Data Generator System

Smart auto-fill system for API testing with flexible, type-aware data generation.

## Overview

The Data Generator detects field types from your Pydantic schemas and automatically generates appropriate test data:

- **Email fields** → `user123@gmail.com`
- **Phone fields** → `+15551234567`
- **URLs** → `https://example.com`
- **Names** → `John Smith`
- **Addresses** → Full street addresses
- **Status codes** → HTTP status codes (200, 404, 500, etc.)
- **Dates** → ISO datetime strings
- **Text** → Lorem ipsum-style content
- **Passwords** → Strong random passwords

## Architecture

### Backend (Python)

#### `testsys_backend/data_generator.py`

Core generator module with flexible type detection:

```python
from data_generator import DataGenerator
from schemas import UserCreate

# Generate test data for any Pydantic schema
data = DataGenerator.generate_for_schema(UserCreate)
# Returns: {'name': 'Emma Johnson', 'email': 'emma42@yahoo.com', ...}

# Get field type hints for UI
hints = DataGenerator.get_field_hints(UserCreate)
# Returns: {'name': 'name', 'email': 'email', 'phone': 'phone', ...}
```

**Key Methods:**

- `generate_for_schema(schema)` - Generate all fields at once
- `generate_field(field_name, field_info)` - Generate single field
- `get_field_hints(schema)` - Get type hints for all fields
- `detect_type_from_field_name(field_name)` - Smart field type detection

**Supported Field Types:**

```
- email, password, phone, url, datetime, status_code
- name, address, title, text
- int, float, bool, str
```

### FastAPI Endpoints

#### `POST /generate`

Generate random test data for User schema.

**Request:**
```bash
curl -X POST http://localhost:8000/generate
```

**Response:**
```json
{
  "name": "John Smith",
  "email": "john234@gmail.com",
  "phone": "+15559876543",
  "company": "Tech Corp",
  "website": "https://techcorp.com",
  "address": "123 Main St, New York, NY 10001"
}
```

#### `GET /generate-schema`

Get field type hints for schema.

**Request:**
```bash
curl http://localhost:8000/generate-schema
```

**Response:**
```json
{
  "name": "name",
  "email": "email",
  "phone": "phone",
  "company": "text",
  "website": "url",
  "address": "address"
}
```

### Frontend (JavaScript)

#### `Backend/Ui/js/features/dataGenerator.js`

Modal UI component with live preview.

**Features:**

- Auto-load schema hints on modal open
- Per-field regeneration with shuffle button
- JSON preview pane
- Apply to current request tab
- Bootstrap modal integration

**Usage:**

```javascript
// Show generator modal
document.getElementById("data-generator-btn").click();

// Programmatically apply data to active tab
Generator.applyToTab();
```

## How to Use

### 1. Click the Generator Button

Click the shuffle icon (`<i class="bi bi-shuffle"></i>`) in the navbar to open the Data Generator modal.

### 2. View Generated Data

The modal displays:
- **Field controls** with auto-detected type icons
- **Regenerate button** per field (shuffle icon)
- **JSON preview** showing full generated dataset

### 3. Apply to Request

Click **"Apply to Current Tab"** to paste the generated JSON into the active request's body field.

### 4. Submit Request

The request tab already has the body filled—just click Send!

## Adding New Data Types

### 1. Add Generator Method in `data_generator.py`

```python
@classmethod
def generate_custom_type(cls) -> str:
    """Generate custom type value."""
    return "generated_value"
```

### 2. Update `detect_type_from_field_name()`

```python
if "my_field" in field_lower:
    return "my_type"
```

### 3. Update `generate_field()` routing

```python
if field_type == MyCustomType or "my_field" in field_name.lower():
    return cls.generate_custom_type()
```

### 4. Add Icon in Frontend

In `dataGenerator.js`, add to `FIELD_TYPES`:

```javascript
const FIELD_TYPES = {
  // ...
  my_type: { icon: "my-icon", color: "info" },
};
```

## Extending to Other Schemas

### Current: User Schema

```python
class UserCreate(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str]
    company: Optional[str]
    website: Optional[str]
    address: Optional[str]
```

### Add New Endpoints

Edit `testsys_backend/main.py`:

```python
from schemas import OrderCreate, ProductCreate

@app.post("/generate/orders")
def generate_order():
    return DataGenerator.generate_for_schema(OrderCreate)

@app.post("/generate/products")
def generate_product():
    return DataGenerator.generate_for_schema(ProductCreate)

@app.get("/generate-schema/orders")
def get_order_schema():
    return DataGenerator.get_field_hints(OrderCreate)
```

### Create Separate Generator Modal

Duplicate `dataGenerator.js` and modify endpoint:

```javascript
const API_BASE = "http://localhost:8000";
const API_ENDPOINT = "/generate/orders"; // Change this per schema
```

## Validation & Error Handling

The generator validates before returning:

1. **Type matching** - Generated data matches field type
2. **Format validation** - Emails, URLs, phones follow real formats
3. **Optional fields** - Respects `Optional[T]` annotations
4. **Uniqueness** - Email addresses are randomized

## Performance

- **Generation speed**: ~5ms for typical schema
- **Schema loading**: ~50ms with network overhead
- **No server overhead**: Pure Python + pydantic introspection

## Troubleshooting

### Generator modal doesn't open

**Check:**
1. `dataGenerator.js` is loaded: `<script src="js/features/dataGenerator.js"></script>`
2. Button ID is correct: `id="data-generator-btn"`
3. Bootstrap is loaded

### Data not applying to tab

**Check:**
1. Request body textarea exists: `<textarea name='body'></textarea>`
2. Tab is active before clicking "Apply"
3. Browser console for errors

### Endpoints return 404

**Check:**
1. FastAPI server running: `uvicorn main:app --reload`
2. CORS enabled (already in `main.py`)
3. Correct port (default 8000)

## API Specification

### Generate Endpoint

**Endpoint:** `POST /generate`  
**Headers:** `Content-Type: application/json`  
**Body:** (empty)  
**Response:** 200 OK + JSON object  

### Schema Hints Endpoint

**Endpoint:** `GET /generate-schema`  
**Headers:** Accept: application/json  
**Response:** 200 OK + JSON object with field→type mappings  

## Examples

### Example 1: Basic Usage

```bash
# Get schema hints
curl http://localhost:8000/generate-schema | jq

# Generate data 5 times
for i in {1..5}; do
  curl -X POST http://localhost:8000/generate | jq '.email'
done

# Output: Multiple different emails
# "alice456@gmail.com"
# "bob789@yahoo.com"
# "charlie123@example.com"
```

### Example 2: Frontend Integration

```javascript
// Manually trigger generator
fetch("http://localhost:8000/generate")
  .then(r => r.json())
  .then(data => {
    document.querySelector("textarea[name='body']").value = JSON.stringify(data, null, 2);
  });
```

### Example 3: Batch Testing

```python
# In your test suite
from data_generator import DataGenerator
from schemas import UserCreate

for _ in range(100):
    test_data = DataGenerator.generate_for_schema(UserCreate)
    response = requests.post("http://localhost:8000/users", json=test_data)
    assert response.status_code == 201
```

## Future Enhancements

- [ ] Custom field value ranges (e.g., age: 18-65)
- [ ] Faker library integration for realistic data
- [ ] Predefined data templates (e.g., "realistic", "edge-cases", "invalid")
- [ ] CSV export of generated datasets
- [ ] API schema inference from OpenAPI/Swagger
