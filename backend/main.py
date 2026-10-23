"""Seven contract endpoints. Run with python -m uvicorn main:app --reload."""
import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy import event, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.dialects.sqlite import insert
from sqlmodel import Session, SQLModel, create_engine, select
from models import ForecastRow, PlanRow, ResultRow, RecipeRow
from catalog import recipes_for
from schemas import ForecastInput, SaveInput, ResultInput, RecipeInput, number
from planning import make_forecast, plan_output, insights, now

ROOT = Path(__file__).resolve().parent

class APIError(Exception):
    def __init__(self, status, code, message, fields=None):
        self.status, self.code, self.message, self.fields = status, code, message, fields or []

def invalid(path, message):
    raise APIError(422, 'VALIDATION_ERROR', message, [{'path': path, 'message': message}])

def load_config():
    settings = json.loads((ROOT / 'config.json').read_text())
    recipes = json.loads((ROOT / 'recipes.json').read_text())
    assert set(settings) == {'hostel_capacity','default_fallback_diners','default_buffer_percent','timezone','is_demo'}
    cap = settings['hostel_capacity']
    assert type(cap) is int and 1 <= cap <= 10000
    assert type(settings['default_fallback_diners']) is int and 0 <= settings['default_fallback_diners'] <= cap
    b = number(settings['default_buffer_percent'])
    assert 0 <= b <= 30 and b == b.quantize(number(.01))
    assert settings['timezone'] == 'Asia/Kolkata' and type(settings['is_demo']) is bool
    assert recipes and len({r['id'] for r in recipes}) == len(recipes)
    names = {}
    for r in recipes:
        assert {'id','name','ingredients'} <= set(r)
        assert all(isinstance(r[k], str) and r[k].strip() for k in ('id','name'))
        assert len({i['ingredient_id'] for i in r['ingredients']}) == len(r['ingredients'])
        for i in r['ingredients']:
            assert set(i) == {'ingredient_id','name','grams_per_diner'}
            assert all(isinstance(i[k], str) and i[k].strip() for k in ('ingredient_id','name'))
            g = number(i['grams_per_diner'])
            assert 0 < g <= 10000 and g == g.quantize(number(.001))
            assert names.setdefault(i['ingredient_id'], i['name']) == i['name']
    return settings, sorted(recipes, key=lambda r: r['id'])

def create_app(database_path=None):
    settings, recipes = load_config()
    path = Path(database_path or os.getenv('MEALWISE_DB', 'mealwise.db'))
    if not path.is_absolute():
        path = ROOT / path
    engine = create_engine('sqlite:///' + str(path), connect_args={'check_same_thread': False, 'timeout': 15})
    @event.listens_for(engine, 'connect')
    def sqlite_options(connection, record):
        connection.execute('PRAGMA foreign_keys=ON')
        connection.execute('PRAGMA busy_timeout=15000')
    @asynccontextmanager
    async def lifespan(app):
        try:
            SQLModel.metadata.create_all(engine)
        except SQLAlchemyError:
            logging.exception('Database initialization failed')
        yield
        engine.dispose()
    app = FastAPI(title='MealWise Backend', version='1', lifespan=lifespan)
    app.state.engine, app.state.settings, app.state.recipes = engine, settings, recipes
    app.add_middleware(CORSMiddleware, allow_origins=['http://localhost:5173','http://127.0.0.1:5173'], allow_methods=['GET','POST','PUT'], allow_headers=['Content-Type'])
    @app.exception_handler(APIError)
    async def api_error(request, exc):
        return JSONResponse(status_code=exc.status, content={'error': {'code': exc.code, 'message': exc.message, 'fields': exc.fields}})
    @app.exception_handler(StarletteHTTPException)
    async def http_error(request, exc):
        code = 'NOT_FOUND' if exc.status_code == 404 else 'VALIDATION_ERROR'
        return await api_error(request, APIError(exc.status_code, code, str(exc.detail)))
    @app.exception_handler(RequestValidationError)
    async def validation(request, exc):
        fields = [{'path': '.'.join(str(p) for p in e['loc'] if p != 'body'), 'message': e['msg']} for e in exc.errors()]
        return await api_error(request, APIError(422, 'VALIDATION_ERROR', 'Invalid request.', fields))
    @app.exception_handler(SQLAlchemyError)
    async def storage(request, exc):
        logging.error('Storage failure: %s', type(exc).__name__)
        return await api_error(request, APIError(503, 'STORAGE_UNAVAILABLE', 'Database unavailable. Please retry.'))
    @app.exception_handler(Exception)
    async def unexpected(request, exc):
        logging.exception('Unexpected failure')
        return await api_error(request, APIError(500, 'INTERNAL_ERROR', 'An unexpected error occurred.'))
    @app.middleware('http')
    async def get_validation(request: Request, call_next):
        if request.method == 'GET' and request.url.path.startswith('/api/'):
            if request.query_params or await request.body():
                return await api_error(request, APIError(422, 'VALIDATION_ERROR', 'GET endpoints accept no body or query parameters.'))
        return await call_next(request)
    @app.get('/api/health')
    def health():
        with Session(engine) as s:
            s.exec(text('SELECT 1'))
            s.exec(select(ForecastRow).limit(1)).all()
        return {'status':'ok','api_version':'1','database':'ok'}
    @app.get('/api/recipes')
    def get_recipes():
        with Session(engine) as s:
            return {'settings': settings, 'recipes': recipes_for(s, recipes)}
    def store_recipe(s, id, req):
        data = json.loads(json.dumps(req.model_dump(), default=float))
        data['id'] = id
        for r in recipes_for(s, recipes):
            if r['id'] == id:
                continue
            if r['name'].casefold() == req.name.casefold():
                raise APIError(409, 'RECIPE_ALREADY_EXISTS', 'A dish with this name already exists. Edit that dish instead.')
            for ingredient in r['ingredients']:
                for i in data['ingredients']:
                    if i['ingredient_id'] == ingredient['ingredient_id'] and i['name'] != ingredient['name']:
                        invalid('ingredients', 'Shared ingredient IDs must have the same name.')
        row = s.get(RecipeRow, id)
        if row:
            row.snapshot = json.dumps(data)
        else:
            row = RecipeRow(id=id, snapshot=json.dumps(data))
        s.add(row)
        s.commit()
        return data
    @app.post('/api/recipes', status_code=201)
    def add_recipe(req: RecipeInput):
        with Session(engine) as s:
            return store_recipe(s, str(uuid4()), req)
    @app.put('/api/recipes/{id}')
    def edit_recipe(id: str, req: RecipeInput):
        with Session(engine) as s:
            if id not in {r['id'] for r in recipes_for(s, recipes)}:
                raise APIError(404, 'NOT_FOUND', 'Dish not found.')
            return store_recipe(s, id, req)
    @app.post('/api/forecast')
    def forecast(req: ForecastInput):
        cap = settings['hostel_capacity']
        if not 0 <= req.fallback_diners <= cap:
            invalid('fallback_diners', 'Fallback must be within hostel capacity.')
        if not -cap <= req.adjustment <= cap:
            invalid('adjustment', 'Adjustment must be within plus/minus hostel capacity.')
        with Session(engine) as s:
            current = [r for r in recipes_for(s, recipes) if r['active']]
            if set(req.recipe_ids) - {r['id'] for r in current}:
                invalid('recipe_ids', 'Unknown or archived recipe ID.')
            row = make_forecast(s, req, settings, current)
            s.add(row)
            s.commit()
            return json.loads(row.snapshot)
    @app.post('/api/plans')
    def save(req: SaveInput):
        with Session(engine) as s:
            f = s.get(ForecastRow, req.forecast_id)
            if not f:
                raise APIError(404, 'NOT_FOUND', 'Forecast not found.')
            snap = json.loads(f.snapshot)
            def resolve():
                existing = s.exec(select(PlanRow).where(PlanRow.forecast_id == req.forecast_id)).first()
                if existing:
                    return JSONResponse(status_code=200, content=plan_output(s, existing))
                raise APIError(409, 'PLAN_ALREADY_EXISTS', f'A {snap["meal_type"]} plan already exists for {snap["date"]}.')
            if s.exec(select(PlanRow).where(PlanRow.forecast_id == req.forecast_id)).first():
                return resolve()
            p = PlanRow(id=str(uuid4()), forecast_id=f.id, date=snap['date'], meal_type=snap['meal_type'], created_at=now())
            s.add(p)
            try:
                s.commit()
            except IntegrityError:
                s.rollback()
                return resolve()
            return JSONResponse(status_code=201, content=plan_output(s, p))
    @app.get('/api/plans')
    def plans():
        order = {'breakfast':0,'lunch':1,'dinner':2}
        with Session(engine) as s:
            rows = sorted(s.exec(select(PlanRow)).all(), key=lambda p: (p.date, order[p.meal_type]), reverse=True)
            return {'plans': [plan_output(s, p) for p in rows]}
    @app.put('/api/plans/{id}/result')
    def put_result(id: str, req: ResultInput):
        try:
            id = str(UUID(id))
        except ValueError:
            invalid('id', 'Plan ID must be a UUID.')
        with Session(engine) as s:
            p = s.get(PlanRow, id)
            if not p:
                raise APIError(404, 'NOT_FOUND', 'Meal plan not found.')
            f = json.loads(s.get(ForecastRow, p.forecast_id).snapshot)
            if p.date > datetime.now(ZoneInfo('Asia/Kolkata')).date().isoformat():
                invalid('date', 'Cannot record results before the meal date in Asia/Kolkata.')
            cap = f['hostel_capacity']
            if req.actual_diners < 0 or req.shortage_count < 0 or req.actual_diners + req.shortage_count > cap:
                invalid('actual_diners', 'Diners and shortages must be nonnegative and sum to at most snapshot capacity.')
            ids = [d.recipe_id for d in req.dishes]
            if len(ids) != len(set(ids)) or set(ids) != set(f['recipe_ids']):
                invalid('dishes', 'Provide exactly one dish per saved recipe, with no extras or duplicates.')
            if req.mixed_plate_waste_kg is not None and any(d.plate_waste_kg is not None for d in req.dishes):
                invalid('mixed_plate_waste_kg', 'Record plate waste once: shared bin or individual dishes, not both.')
            if req.actual_diners == 0 and req.mixed_plate_waste_kg:
                invalid('mixed_plate_waste_kg', 'Plate waste must be zero when no diners were served.')
            snapshots = {d['recipe_id']: d for d in f['dishes']}
            for index, d in enumerate(req.dishes):
                if d.entry_unit != 'kg':
                    factor = snapshots[d.recipe_id].get('portion_weight_g' if d.entry_unit == 'portion' else 'container_weight_g')
                    if not factor or d.entry_amount is None:
                        invalid(f'dishes.{index}.entry_amount', 'This unit needs a configured size and a quantity.')
                    from planning import rounded
                    expected = number(rounded(d.entry_amount * number(factor) / 1000))
                    if d.unserved_kg != expected:
                        invalid(f'dishes.{index}.unserved_kg', 'Quantity does not match the saved unit conversion.')
                    if d.measurement_method != 'estimated':
                        invalid(f'dishes.{index}.measurement_method', 'Portion and container entries must be marked estimated.')
                known = (d.unserved_kg or 0) + (d.plate_waste_kg or 0)
                if d.prepared_kg is not None and known > d.prepared_kg:
                    invalid(f'dishes.{index}.unserved_kg', 'Combined recorded waste must be at most prepared_kg.')
                if req.actual_diners == 0 and d.plate_waste_kg:
                    invalid(f'dishes.{index}.plate_waste_kg', 'Plate waste must be zero when no diners were served.')
            result = {'plan_id': id, 'actual_diners': req.actual_diners, 'shortage_count': req.shortage_count,
                      'dishes': [dict(recipe_id=d.recipe_id, measurement_method=d.measurement_method,
                         entry_unit=d.entry_unit, entry_amount=float(d.entry_amount) if d.entry_amount is not None else None,
                         **{k:float(getattr(d,k)) if getattr(d,k) is not None else None for k in ('prepared_kg','unserved_kg','plate_waste_kg')})
                         for d in sorted(req.dishes,key=lambda d:d.recipe_id)],
                      'mixed_plate_waste_kg':float(req.mixed_plate_waste_kg) if req.mixed_plate_waste_kg is not None else None,
                      'notes': req.notes, 'updated_at': now()}
            statement = insert(ResultRow).values(plan_id=id, snapshot=json.dumps(result))
            s.exec(statement.on_conflict_do_update(index_elements=['plan_id'], set_={'snapshot':statement.excluded.snapshot}))
            s.commit()
            return result
    @app.get('/api/insights')
    def get_insights():
        with Session(engine) as s:
            return insights(s)
    return app

app = create_app()
