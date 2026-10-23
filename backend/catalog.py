"""Durable recipe overrides; bundled starters are never silently written over user edits."""
import json
from sqlmodel import select
from models import RecipeRow

def enrich(recipe):
    return {'category':'Other', 'meal_types':['lunch','dinner'],
            'portion_label':'serving', 'portion_weight_g':None,
            'container_label':'container', 'container_weight_g':None,
            'active':True, **recipe}

def recipes_for(session, starters):
    recipes = {r['id']: enrich(r) for r in starters}
    for row in session.exec(select(RecipeRow)).all():
        recipes[row.id] = json.loads(row.snapshot)
    return sorted(recipes.values(), key=lambda r:r['name'].casefold())
