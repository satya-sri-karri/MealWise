"""Decimal-safe forecasting, raw ingredients, and cooked-waste analytics."""
import json
from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_CEILING, ROUND_HALF_UP
from uuid import uuid4
from sqlmodel import select
from models import ForecastRow, PlanRow, ResultRow

D = lambda v: Decimal(str(v))

def rounded(v, places=3):
    return float(D(v).quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_UP))

def now():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')

def history(session):
    return [(p, session.get(ForecastRow, p.forecast_id), session.get(ResultRow, p.id))
            for p in session.exec(select(PlanRow)).all()]

def make_forecast(session, req, settings, recipes, forecast_id=None):
    records = [(p, json.loads(r.snapshot)) for p, f, r in history(session)
               if r and p.meal_type == req.meal_type and p.date < req.date]
    records.sort(key=lambda x: x[0].date, reverse=True)
    weekday = date.fromisoformat(req.date).weekday()
    same = [x for x in records if date.fromisoformat(x[0].date).weekday() == weekday][:4]
    chosen = same if len(same) >= 2 else records[:7]
    method = 'same_weekday' if len(same) >= 2 else 'recent_meals' if chosen else 'fallback'
    baseline = sum((D(r['actual_diners']) for p, r in chosen), D(0)) / len(chosen) if chosen else D(req.fallback_diners)
    adjusted = max(D(0), baseline + req.adjustment)
    uncapped = int((adjusted * (1 + req.buffer_percent / 100)).to_integral_value(rounding=ROUND_CEILING))
    planned = min(settings['hostel_capacity'], uncapped)
    dishes, totals = [], {}
    for recipe in sorted(recipes, key=lambda r: r['id']):
        if recipe['id'] not in req.recipe_ids:
            continue
        ingredients = []
        for ing in sorted(recipe['ingredients'], key=lambda i: i['ingredient_id']):
            kg = planned * D(ing['grams_per_diner']) / 1000
            ingredients.append({**ing, 'quantity_kg': rounded(kg)})
            item = totals.setdefault(ing['ingredient_id'], {'name': ing['name'], 'kg': D(0)})
            item['kg'] += kg
        dishes.append({'recipe_id': recipe['id'], 'name': recipe['name'], 'ingredients': ingredients,
            **{k:recipe.get(k) for k in ('portion_label','portion_weight_g','container_label','container_weight_g')}})
    source = f'{method}: {len(chosen)} completed meals before {req.date}' if chosen else f'No completed {req.meal_type} meals before {req.date}; fallback {req.fallback_diners}'
    explanation = f'{source}; adjustment {req.adjustment}; buffer {req.buffer_percent}%; planned {planned} (capacity {settings["hostel_capacity"]}).'
    if uncapped > planned:
        explanation += ' Capped at hostel capacity.'
    snapshot = {**req.model_dump(exclude={'buffer_percent'}), 'buffer_percent': float(req.buffer_percent),
                'recipe_ids': sorted(req.recipe_ids), 'forecast_id': forecast_id or str(uuid4()), 'created_at': now(),
                'hostel_capacity': settings['hostel_capacity'], 'estimated_diners': rounded(baseline, 2),
                'adjusted_diners': rounded(adjusted, 2), 'planned_diners': planned, 'method': method,
                'history_count': len(chosen), 'history_plan_ids': [p.id for p, r in chosen],
                'explanation': explanation, 'is_demo': settings['is_demo'], 'dishes': dishes,
                'ingredients': [{'ingredient_id': k, 'name': v['name'], 'quantity_kg': rounded(v['kg'])} for k, v in sorted(totals.items())]}
    return ForecastRow(id=snapshot['forecast_id'], snapshot=json.dumps(snapshot), baseline=str(baseline))

def coverage(result):
    dishes = result['dishes']
    recorded = sum(d.get('unserved_kg') is not None for d in dishes)
    plates = result.get('mixed_plate_waste_kg') is not None or all(d.get('plate_waste_kg') is not None for d in dishes)
    complete = recorded == len(dishes) and plates
    return recorded, plates, complete

def raw_metrics(forecast, result):
    totals = {k: sum((D(d[k]) for d in result['dishes'] if d.get(k) is not None), D(0)) for k in ('prepared_kg', 'unserved_kg', 'plate_waste_kg')}
    totals['plate_waste_kg'] += D(result.get('mixed_plate_waste_kg') or 0)
    totals['waste_kg'] = totals['unserved_kg'] + totals['plate_waste_kg']
    return totals, abs(D(forecast.baseline) - result['actual_diners'])

def metrics(forecast, result):
    totals, error = raw_metrics(forecast, result)
    recorded, plates, complete = coverage(result)
    return {**{'total_' + k: rounded(v) for k, v in totals.items()},
            'waste_per_diner_g': rounded(totals['waste_kg'] * 1000 / result['actual_diners'], 2) if result['actual_diners'] and complete else None,
            'forecast_error_diners': rounded(error, 2),
            'has_estimated_measurements': any(d['measurement_method'] == 'estimated' for d in result['dishes']) or result.get('mixed_plate_waste_kg') is not None,
            'recorded_dishes':recorded, 'total_dishes':len(result['dishes']),
            'plate_waste_recorded':plates, 'waste_record_complete':complete}

def plan_output(session, p):
    f = session.get(ForecastRow, p.forecast_id)
    r = session.get(ResultRow, p.id)
    result = json.loads(r.snapshot) if r else None
    return {'id': p.id, 'created_at': p.created_at, 'status': 'completed' if r else 'planned',
            'forecast': json.loads(f.snapshot), 'result': result, 'metrics': metrics(f, result) if r else None}

def insights(session):
    out = dict(completed_meals=0, total_actual_diners=0, total_shortage_count=0,
               meals_with_estimated_measurements=0, demo_meals=0, complete_waste_meals=0,
               partial_waste_meals=0, complete_waste_diners=0)
    totals = {k: D(0) for k in ('prepared_kg', 'unserved_kg', 'plate_waste_kg', 'waste_kg')}
    errors = D(0)
    complete_waste = D(0)
    dish_totals = {}
    for p, f, r in history(session):
        if not r:
            continue
        result = json.loads(r.snapshot)
        values, error = raw_metrics(f, result)
        for k in totals:
            totals[k] += values[k]
        errors += error
        out['completed_meals'] += 1
        out['total_actual_diners'] += result['actual_diners']
        out['total_shortage_count'] += result['shortage_count']
        snapshot = json.loads(f.snapshot)
        out['demo_meals'] += int(snapshot['is_demo'])
        out['meals_with_estimated_measurements'] += int(any(d['measurement_method'] == 'estimated' for d in result['dishes']) or result.get('mixed_plate_waste_kg') is not None)
        if coverage(result)[2]:
            out['complete_waste_meals'] += 1
            out['complete_waste_diners'] += result['actual_diners']
            complete_waste += values['waste_kg']
        else:
            out['partial_waste_meals'] += 1
        names = {d['recipe_id']:d['name'] for d in snapshot['dishes']}
        for d in result['dishes']:
            if d.get('unserved_kg') is None:
                continue
            item = dish_totals.setdefault(d['recipe_id'], {'recipe_id':d['recipe_id'], 'name':names[d['recipe_id']], 'recorded_meals':0, 'unserved_kg':D(0)})
            item['recorded_meals'] += 1
            item['unserved_kg'] += D(d['unserved_kg'])
    out.update({'total_' + k: rounded(v) for k, v in totals.items()})
    out['waste_per_diner_g'] = rounded(complete_waste * 1000 / out['complete_waste_diners'], 2) if out['complete_waste_diners'] else None
    out['mean_forecast_error_diners'] = rounded(errors / out['completed_meals'], 2) if out['completed_meals'] else None
    out['dish_leftovers'] = [{**d, 'unserved_kg':rounded(d['unserved_kg'])} for d in sorted(dish_totals.values(), key=lambda d:d['unserved_kg'], reverse=True)]
    return out
