"""Strict JSON request validation; strings and booleans cannot stand in for numbers."""
import re
from datetime import date
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, StrictInt, StrictStr, BeforeValidator, field_validator, model_validator

def number(value):
    if type(value) not in (int, float, Decimal):
        raise ValueError('Must be a JSON number.')
    d = Decimal(str(value))
    if not d.is_finite():
        raise ValueError('Must be finite.')
    return d

Number = Annotated[Decimal, BeforeValidator(number)]
Meal = Literal['breakfast', 'lunch', 'dinner']

class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid')

class ForecastInput(StrictModel):
    date: StrictStr
    meal_type: Meal
    recipe_ids: list[StrictStr]
    fallback_diners: StrictInt
    adjustment: StrictInt
    adjustment_reason: StrictStr
    buffer_percent: Number

    @field_validator('date')
    @classmethod
    def valid_date(cls, v):
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', v):
            raise ValueError('Use YYYY-MM-DD.')
        date.fromisoformat(v)
        return v

    @field_validator('recipe_ids')
    @classmethod
    def unique_recipes(cls, v):
        if not 1 <= len(v) <= 20 or len(set(v)) != len(v):
            raise ValueError('Provide 1–20 unique recipe IDs.')
        return v

    @field_validator('adjustment_reason')
    @classmethod
    def reason(cls, v):
        v = v.strip()
        if len(v) > 300:
            raise ValueError('Maximum 300 characters.')
        return v

    @field_validator('buffer_percent')
    @classmethod
    def buffer(cls, v):
        if not 0 <= v <= 30 or v != v.quantize(Decimal('.01')):
            raise ValueError('Use 0–30 with at most two decimals.')
        return v

    @model_validator(mode='after')
    def nonempty_reason(self):
        if self.adjustment and not self.adjustment_reason:
            raise ValueError('An adjustment reason is required.')
        return self

class SaveInput(StrictModel):
    forecast_id: StrictStr

    @field_validator('forecast_id')
    @classmethod
    def uuid_string(cls, v):
        return str(UUID(v))

class DishInput(StrictModel):
    recipe_id: StrictStr
    prepared_kg: Number
    unserved_kg: Number
    plate_waste_kg: Number
    measurement_method: Literal['weighed', 'estimated']

    @field_validator('prepared_kg', 'unserved_kg', 'plate_waste_kg')
    @classmethod
    def weight(cls, v):
        if not 0 <= v <= 10000 or v != v.quantize(Decimal('.001')):
            raise ValueError('Use 0–10000 kg with at most three decimals.')
        return v

class ResultInput(StrictModel):
    actual_diners: StrictInt
    shortage_count: StrictInt
    dishes: list[DishInput]
    notes: StrictStr

    @field_validator('notes')
    @classmethod
    def notes_length(cls, v):
        v = v.strip()
        if len(v) > 1000:
            raise ValueError('Maximum 1000 characters.')
        return v
