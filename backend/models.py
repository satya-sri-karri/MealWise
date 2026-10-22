"""Database rows. Snapshot JSON is immutable; results are replaceable."""
from sqlalchemy import Column, Text, UniqueConstraint
from sqlmodel import SQLModel, Field

class ForecastRow(SQLModel, table=True):
    id: str = Field(primary_key=True)
    snapshot: str = Field(sa_column=Column(Text, nullable=False))
    baseline: str

class PlanRow(SQLModel, table=True):
    __table_args__ = (UniqueConstraint('date', 'meal_type'),)
    id: str = Field(primary_key=True)
    forecast_id: str = Field(foreign_key='forecastrow.id', unique=True)
    date: str
    meal_type: str
    created_at: str

class ResultRow(SQLModel, table=True):
    plan_id: str = Field(primary_key=True, foreign_key='planrow.id')
    snapshot: str = Field(sa_column=Column(Text, nullable=False))
