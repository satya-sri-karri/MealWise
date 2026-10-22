"""Explicit, safely rerunnable fictional demo dataset. Never runs at startup."""
import argparse
from datetime import date, datetime, timedelta
from uuid import NAMESPACE_URL, uuid5
from zoneinfo import ZoneInfo
from fastapi.testclient import TestClient
from sqlmodel import Session, select
from main import create_app
from models import PlanRow

def seed(app, anchor=None):
    anchor = anchor or datetime.now(ZoneInfo('Asia/Kolkata')).date()
    if not app.state.settings['is_demo']:
        raise ValueError('Seed requires is_demo=true and a dedicated demo database.')
    with TestClient(app) as client:
        for index in range(15):
            stable_id = str(uuid5(NAMESPACE_URL, f'mealwise-demo-v1-{index}'))
            with Session(app.state.engine) as s:
                if s.get(PlanRow, stable_id):
                    continue
            day = anchor - timedelta(days=14-index) if index < 14 else anchor + timedelta(days=1)
            meal = 'lunch'
            with Session(app.state.engine) as s:
                if s.exec(select(PlanRow).where(PlanRow.date == day.isoformat(), PlanRow.meal_type == meal)).first():
                    continue
            from planning import make_forecast
            from schemas import ForecastInput
            req = ForecastInput(date=day.isoformat(), meal_type=meal,
                recipe_ids=['rice','dal','vegetable-curry'], fallback_diners=app.state.settings['default_fallback_diners'],
                adjustment=0, adjustment_reason='', buffer_percent=5)
            from planning import now
            from sqlalchemy.exc import IntegrityError
            with Session(app.state.engine) as s:
                forecast = make_forecast(s, req, app.state.settings, app.state.recipes,
                    str(uuid5(NAMESPACE_URL, f'mealwise-demo-forecast-v1-{index}')))
                s.add(forecast)
                s.add(PlanRow(id=stable_id, forecast_id=forecast.id, date=day.isoformat(), meal_type=meal, created_at=now()))
                try:
                    s.flush([forecast])
                    s.commit()
                except IntegrityError:
                    s.rollback()
                    continue
            if index < 14:
                cap = app.state.settings['hostel_capacity']
                actual = min(cap, 155 + (index * 13) % 65)
                result = dict(actual_diners=actual, shortage_count=min(index % 3, cap-actual),
                    dishes=[dict(recipe_id=rid, prepared_kg=kg, unserved_kg=round(1+index%4*.2,3),
                                 plate_waste_kg=.3 if actual else 0, measurement_method='estimated' if index%4==0 else 'weighed')
                            for rid,kg in [('rice',40),('dal',18),('vegetable-curry',22)]],
                    notes='Demo data — fictional illustrative measurements, not observed savings.')
                response = client.put(f'/api/plans/{stable_id}/result', json=result)
                response.raise_for_status()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Seed Demo data without overwriting existing records.')
    parser.add_argument('--date', type=date.fromisoformat, help='Anchor date, YYYY-MM-DD (default: today in Asia/Kolkata)')
    args = parser.parse_args()
    seed(create_app(), args.date)
    print('Demo data ready. Existing plans and results were preserved.')
