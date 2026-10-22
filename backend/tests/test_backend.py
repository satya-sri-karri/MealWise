import json
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select
from main import create_app
from models import ForecastRow, PlanRow, ResultRow
from planning import rounded
from seed import seed

@pytest.fixture
def client(tmp_path):
    app = create_app(tmp_path / 'test.db')
    with TestClient(app) as c:
        yield c

def preview(c, **changes):
    body = dict(date='2020-03-01', meal_type='lunch', recipe_ids=['rice'], fallback_diners=180,
                adjustment=0, adjustment_reason='', buffer_percent=5)
    body.update(changes)
    return c.post('/api/forecast', json=body)

def plan(c, **changes):
    f = preview(c, **changes)
    assert f.status_code == 200, f.text
    r = c.post('/api/plans', json={'forecast_id': f.json()['forecast_id']})
    assert r.status_code == 201, r.text
    return r.json()

def result(c, p, actual=150, waste=3, **changes):
    body = dict(actual_diners=actual, shortage_count=0, dishes=[dict(recipe_id='rice', prepared_kg=40,
        unserved_kg=waste, plate_waste_kg=0, measurement_method='weighed')], notes='  test  ')
    body.update(changes)
    return c.put('/api/plans/'+p['id']+'/result', json=body)

def test_empty_and_health(client):
    assert client.get('/api/health').json() == {'status':'ok','api_version':'1','database':'ok'}
    assert client.get('/api/plans').json() == {'plans':[]}
    i = client.get('/api/insights').json()
    assert len(i) == 11 and i['mean_forecast_error_diners'] is None and i['waste_per_diner_g'] is None
    assert [r['id'] for r in client.get('/api/recipes').json()['recipes']] == ['dal','rice','vegetable-curry']

@pytest.mark.parametrize('fallback,adjustment,buffer,expected',[(180,-30,5,158),(240,20,10,250),(10,-20,5,0)])
def test_calculation(client,fallback,adjustment,buffer,expected):
    f = preview(client,fallback_diners=fallback,adjustment=adjustment,adjustment_reason='event',buffer_percent=buffer).json()
    assert f['planned_diners'] == expected
    assert f['ingredients'][0]['quantity_kg'] == expected/10
    assert f['history_count'] == 0 and f['method'] == 'fallback'

@pytest.mark.parametrize('changes',[
    {'fallback_diners':True},{'fallback_diners':'180'},{'fallback_diners':251},{'adjustment':251},
    {'buffer_percent':'5'},{'buffer_percent':5.001},{'buffer_percent':31},{'adjustment':1},
    {'recipe_ids':['rice','rice']},{'recipe_ids':['missing']},{'recipe_ids':[]},
    {'date':'2020-02-30'},{'date':'20200301'},{'unexpected':1},{'adjustment_reason':'x'*301}])
def test_forecast_validation(client,changes):
    r = preview(client,**changes)
    assert r.status_code == 422 and set(r.json()) == {'error'}

def test_invalid_json_and_get(client):
    for content in ['{','{"date":NaN}']:
        r = client.post('/api/forecast',content=content,headers={'Content-Type':'application/json'})
        assert r.status_code == 422
    assert client.get('/api/plans?extra=1').status_code == 422
    assert client.request('GET','/api/plans',json={}).status_code == 422

def test_save_idempotency_and_conflict(client):
    p = plan(client)
    result(client,p)
    retry = client.post('/api/plans',json={'forecast_id':p['forecast']['forecast_id']})
    assert retry.status_code == 200 and retry.json()['id'] == p['id'] and retry.json()['status'] == 'completed'
    f = preview(client).json()
    assert client.post('/api/plans',json={'forecast_id':f['forecast_id']}).status_code == 409
    assert client.post('/api/plans',json={'forecast_id':str(uuid4())}).status_code == 404
    assert client.post('/api/plans',json={'forecast_id':'bad'}).status_code == 422

def test_corrections_atomic_and_metrics(client):
    p = plan(client)
    assert result(client,p,actual=150,waste=3).status_code == 200
    before = client.get('/api/plans').json()['plans'][0]
    assert before['metrics']['forecast_error_diners'] == 30
    assert before['metrics']['waste_per_diner_g'] == 20
    bad = dict(recipe_id='rice',prepared_kg=10,unserved_kg=8,plate_waste_kg=3,measurement_method='weighed')
    assert result(client,p,dishes=[bad]).status_code == 422
    assert client.get('/api/plans').json()['plans'][0] == before
    result(client,p,actual=100,waste=2)
    result(client,p,actual=100,waste=2)
    assert client.get('/api/insights').json()['total_waste_kg'] == 2
    with Session(client.app.state.engine) as s:
        assert len(s.exec(select(ResultRow)).all()) == 1

@pytest.mark.parametrize('changes',[
    {'actual_diners':True},{'actual_diners':-1},{'actual_diners':250,'shortage_count':1},
    {'dishes':[]},{'notes':'x'*1001},
    {'dishes':[dict(recipe_id='rice',prepared_kg='40',unserved_kg=0,plate_waste_kg=0,measurement_method='weighed')]},
    {'dishes':[dict(recipe_id='rice',prepared_kg=40.0001,unserved_kg=0,plate_waste_kg=0,measurement_method='weighed')]},
    {'actual_diners':0,'dishes':[dict(recipe_id='rice',prepared_kg=40,unserved_kg=0,plate_waste_kg=1,measurement_method='weighed')]}
])
def test_result_validation(client,changes):
    assert result(client,plan(client),**changes).status_code == 422

def test_future_and_missing(client):
    p = plan(client,date='2099-01-01')
    assert result(client,p).status_code == 422
    assert result(client,{'id':str(uuid4())}).status_code == 404

def test_aggregate_weighted_and_zero(client):
    p = plan(client,date='2020-01-01'); result(client,p,actual=10,waste=1)
    p = plan(client,date='2020-01-02'); result(client,p,actual=90,waste=9)
    i = client.get('/api/insights').json()
    assert i['waste_per_diner_g'] == 100 and i['completed_meals'] == 2
    for p in client.get('/api/plans').json()['plans']:
        assert result(client,p,actual=0,waste=2).status_code == 200
    assert client.get('/api/insights').json()['waste_per_diner_g'] is None

def test_history_selection(client):
    for day,actual in [('2020-02-02',100),('2020-02-09',120),('2020-02-16',140),('2020-02-23',160),('2020-02-29',200),('2020-03-01',240),('2020-03-02',250)]:
        result(client,plan(client,date=day),actual=actual)
    f = preview(client).json()
    assert f['method'] == 'same_weekday' and f['history_count'] == 4 and f['estimated_diners'] == 130
    f = preview(client,date='2020-02-10').json()
    assert f['method'] == 'recent_meals' and f['history_count'] == 2 and f['estimated_diners'] == 110
    assert preview(client,date='2020-02-02').json()['method'] == 'fallback'

def test_snapshot_restart_and_changed_directory(client,tmp_path,monkeypatch):
    result(client,plan(client,date='2020-02-01'),actual=100)
    f = preview(client).json()
    result(client,client.get('/api/plans').json()['plans'][0],actual=200)
    client.app.state.recipes[2]['ingredients'][0]['grams_per_diner'] = 999
    client.app.state.settings['hostel_capacity'] = 200
    path = client.app.state.engine.url.database
    monkeypatch.chdir(tmp_path)
    with TestClient(create_app(path)) as other:
        p = other.post('/api/plans',json={'forecast_id':f['forecast_id']}).json()
        assert p['forecast'] == f
        assert result(other,p,actual=250).status_code == 200
        assert other.get('/api/insights').json()['completed_meals'] == 2

def test_shared_ingredients_and_rounding(client):
    client.app.state.recipes[:] = [dict(id=k,name=k,ingredients=[dict(ingredient_id='shared',name='Shared',grams_per_diner=.5)]) for k in ['a','b']]
    f = preview(client,recipe_ids=['b','a'],fallback_diners=1,buffer_percent=0).json()
    assert [d['recipe_id'] for d in f['dishes']] == ['a','b']
    assert f['dishes'][0]['ingredients'][0]['quantity_kg'] == .001
    assert f['ingredients'][0]['quantity_kg'] == .001
    assert rounded('1.005',2) == 1.01

def test_concurrent_saves(client):
    f = preview(client).json()
    def save(_):
        return client.post('/api/plans',json={'forecast_id':f['forecast_id']})
    with ThreadPoolExecutor(max_workers=4) as pool:
        responses = list(pool.map(save,range(4)))
    assert sorted(r.status_code for r in responses) == [200,200,200,201]
    assert len({r.json()['id'] for r in responses}) == 1

def test_seed_rerun(tmp_path):
    app = create_app(tmp_path/'demo.db')
    seed(app,date(2020,3,1))
    with TestClient(app) as c:
        before = c.get('/api/plans').json()
        assert len(before['plans']) == 15
        assert c.get('/api/insights').json()['demo_meals'] == 14
    seed(app,date(2020,3,2))
    with TestClient(app) as c:
        assert c.get('/api/plans').json() == before

def test_storage_failure(client):
    with client.app.state.engine.begin() as conn:
        conn.exec_driver_sql('DROP TABLE resultrow')
        conn.exec_driver_sql('DROP TABLE planrow')
        conn.exec_driver_sql('DROP TABLE forecastrow')
    r = client.get('/api/health')
    assert r.status_code == 503 and r.json()['error']['code'] == 'STORAGE_UNAVAILABLE'

def test_unrounded_baseline_and_recent_limit(client):
    for n in range(8):
        p = plan(client,date=(date(2020,1,1)+timedelta(days=n)).isoformat())
        result(client,p,actual=1 if n==7 else 0)
    f = preview(client,date='2020-01-09',buffer_percent=0).json()
    assert f['history_count'] == 7 and f['estimated_diners'] == .14 and f['planned_diners'] == 1
    p = client.post('/api/plans',json={'forecast_id':f['forecast_id']}).json()
    result(client,p,actual=0,waste=0)
    saved = next(p for p in client.get('/api/plans').json()['plans'] if p['forecast']['date']=='2020-01-09')
    assert saved['metrics']['forecast_error_diners'] == .14

def test_concurrent_distinct_forecasts(client):
    ids = [preview(client).json()['forecast_id'] for _ in range(2)]
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda fid: client.post('/api/plans',json={'forecast_id':fid}),ids))
    assert sorted(r.status_code for r in responses) == [201,409]

def test_multiple_dishes_sorting_estimated_and_snapshot(client):
    p = plan(client,recipe_ids=['rice','dal'])
    dishes = [dict(recipe_id=r,prepared_kg=10,unserved_kg=1,plate_waste_kg=.1,measurement_method='estimated') for r in ['rice','dal']]
    assert result(client,p,dishes=[dishes[0],dishes[0]]).status_code == 422
    assert result(client,p,dishes=dishes).status_code == 200
    current = client.get('/api/plans').json()['plans'][0]
    assert [d['recipe_id'] for d in current['result']['dishes']] == ['dal','rice']
    assert current['metrics']['has_estimated_measurements']
    assert current['metrics']['total_waste_kg'] == 2.2
    assert client.get('/api/insights').json()['meals_with_estimated_measurements'] == 1

def test_nonfinite_weight_and_unknown_fields(client):
    p = plan(client)
    for weight in [float('inf'),float('nan')]:
        body = dict(actual_diners=1,shortage_count=0,notes='',dishes=[dict(recipe_id='rice',prepared_kg=weight,unserved_kg=0,plate_waste_kg=0,measurement_method='weighed')])
        r = client.put('/api/plans/'+p['id']+'/result',content=json.dumps(body),headers={'Content-Type':'application/json'})
        assert r.status_code == 422
    assert result(client,p,unknown=1).status_code == 422
