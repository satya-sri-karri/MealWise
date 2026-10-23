import { useState } from "react";
import { api } from "../api";
import { ErrorBox } from "../components";
import type { Catalog, MealType, Recipe } from "../types";
const categories = [
  "Breakfast",
  "Rice & breads",
  "Dal & curries",
  "Sides",
  "Drinks",
  "Other",
];
const blank: Omit<Recipe, "id"> = {
  name: "",
  category: "Other",
  meal_types: ["lunch", "dinner"],
  portion_label: "serving",
  portion_weight_g: null,
  container_label: "container",
  container_weight_g: null,
  ingredients: [],
  active: true,
};
export default function Menu({
  catalog,
  onSaved,
}: {
  catalog: Catalog;
  onSaved: () => Promise<void>;
}) {
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState("All"),
    [edit, setEdit] = useState<Recipe | Omit<Recipe, "id"> | null>(null),
    [error, setError] = useState<unknown>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const filtered = catalog.recipes.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) &&
      (category === "All" || r.category === category),
  );
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    setBusy(true);
    setError(null);
    try {
      const { id, ...body } = edit as Recipe;
      await api.saveRecipe(body, id);
      await onSaved();
      setEdit(null);
      setMessage(`${edit.name} saved to your kitchen menu.`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  function change<K extends keyof Omit<Recipe, "id">>(
    key: K,
    value: Recipe[K],
  ) {
    if (edit) setEdit({ ...edit, [key]: value });
  }
  return (
    <>
      <div className="menu-intro">
        <div>
          <h2>Your kitchen, your menu</h2>
          <p>
            Add the dishes you actually serve. Set a familiar portion or
            container once, then reuse it after every meal.
          </p>
        </div>
        <button
          className="primary"
          onClick={() => {
            setEdit({ ...blank });
            setError(null);
            setMessage("");
          }}
        >
          + Add a dish
        </button>
      </div>
      {message && (
        <div className="notice success" role="status">
          {message}
        </div>
      )}
      {edit && (
        <form className="panel menu-editor" onSubmit={save}>
          <div className="section-title">
            <h2>{"id" in edit ? "Edit dish" : "Add a dish"}</h2>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => setEdit(null)}
            >
              Cancel
            </button>
          </div>
          <fieldset disabled={busy}>
            <div className="form-grid">
              <label>
                Dish name
                <input
                  autoFocus
                  required
                  maxLength={100}
                  value={edit.name}
                  onChange={(e) => change("name", e.target.value)}
                />
              </label>
              <label>
                Category
                <select
                  aria-label="Category"
                  value={edit.category}
                  onChange={(e) => change("category", e.target.value)}
                >
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>
            <fieldset className="dish-picker">
              <legend>Usually served at</legend>
              {(["breakfast", "lunch", "dinner"] as MealType[]).map((m) => (
                <label className="check capitalize" key={m}>
                  <input
                    type="checkbox"
                    checked={edit.meal_types?.includes(m)}
                    onChange={(e) =>
                      change(
                        "meal_types",
                        e.target.checked
                          ? [...(edit.meal_types || []), m]
                          : (edit.meal_types || []).filter((x) => x !== m),
                      )
                    }
                  />
                  {m}
                </label>
              ))}
            </fieldset>
            <div className="notice">
              Conversions are estimates. For better records, weigh one usual
              serving or a filled container once. Leave the weight blank if you
              do not know it.
            </div>
            <div className="form-grid">
              <label>
                Portion name
                <input
                  required
                  value={edit.portion_label}
                  maxLength={100}
                  onChange={(e) => change("portion_label", e.target.value)}
                  placeholder="piece, bowl, serving"
                />
              </label>
              <label>
                One portion, cooked grams
                <input
                  type="number"
                  min="0.001"
                  max="100000"
                  step="0.001"
                  value={edit.portion_weight_g ?? ""}
                  onChange={(e) =>
                    change(
                      "portion_weight_g",
                      e.target.value === "" ? null : e.target.valueAsNumber,
                    )
                  }
                />
              </label>
              <label>
                Container name
                <input
                  required
                  value={edit.container_label}
                  maxLength={100}
                  onChange={(e) => change("container_label", e.target.value)}
                  placeholder="small bucket, tray, vessel"
                />
              </label>
              <label>
                One full container, net food grams
                <input
                  type="number"
                  min="0.001"
                  max="100000"
                  step="0.001"
                  value={edit.container_weight_g ?? ""}
                  onChange={(e) =>
                    change(
                      "container_weight_g",
                      e.target.value === "" ? null : e.target.valueAsNumber,
                    )
                  }
                />
                <small>Exclude the weight of the container.</small>
              </label>
            </div>
            <details className="recipe-details">
              <summary>
                Raw ingredient recipe <span className="muted">· optional</span>
              </summary>
              <p className="muted">
                Enter raw grams needed per diner. These allowances create your
                ingredient shopping list. Empty recipes still support meal and
                leftover tracking.
              </p>
              {edit.ingredients.map((i, index) => (
                <div className="ingredient-editor" key={index}>
                  <label>
                    Ingredient name
                    <input
                      required
                      value={i.name}
                      onChange={(e) =>
                        change(
                          "ingredients",
                          edit.ingredients.map((r, n) =>
                            n === index
                              ? {
                                  ...r,
                                  name: e.target.value,
                                  ingredient_id: e.target.value
                                    .toLowerCase()
                                    .trim()
                                    .replace(/[^a-z0-9]+/g, "-"),
                                }
                              : r,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Grams per diner
                    <input
                      required
                      min="0.001"
                      max="10000"
                      step="0.001"
                      type="number"
                      value={i.grams_per_diner || ""}
                      onChange={(e) =>
                        change(
                          "ingredients",
                          edit.ingredients.map((r, n) =>
                            n === index
                              ? {
                                  ...r,
                                  grams_per_diner: e.target.valueAsNumber,
                                }
                              : r,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary"
                    aria-label={`Remove ingredient ${index + 1}`}
                    onClick={() =>
                      change(
                        "ingredients",
                        edit.ingredients.filter((_, n) => n !== index),
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  change("ingredients", [
                    ...edit.ingredients,
                    { ingredient_id: "", name: "", grams_per_diner: 0 },
                  ])
                }
              >
                + Add ingredient
              </button>
            </details>
            <label className="check">
              <input
                type="checkbox"
                checked={edit.active !== false}
                onChange={(e) => change("active", e.target.checked)}
              />
              Available for new meal plans
            </label>
            <div>
              <button
                className="primary"
                disabled={busy || !edit.meal_types?.length}
              >
                {busy ? "Saving…" : "Save dish"}
              </button>
            </div>
          </fieldset>
          <ErrorBox error={error} />
        </form>
      )}
      <div className="menu-toolbar">
        <label>
          Search dishes
          <input
            type="search"
            value={search}
            placeholder="Try idli, chapati, curd…"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          Filter category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option>All</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted small-copy">
        Starter recipes and serving sizes are illustrative. Edit them for your
        kitchen before relying on quantities.
      </p>
      <div className="recipe-grid">
        {filtered.map((r) => (
          <article
            className={`panel recipe-card ${r.active === false ? "archived" : ""}`}
            key={r.id}
          >
            <div className="section-title">
              <span className="badge">{r.category || "Other"}</span>
              {r.active === false && <span className="badge">Archived</span>}
            </div>
            <h3>{r.name}</h3>
            <p className="capitalize muted">
              {(r.meal_types || ["lunch", "dinner"]).join(" · ")}
            </p>
            <div className="recipe-facts">
              <span>
                {r.portion_weight_g
                  ? `${r.portion_weight_g} g / ${r.portion_label}`
                  : "Portion size not set"}
              </span>
              <span>
                {r.container_weight_g
                  ? `${r.container_weight_g} g / ${r.container_label}`
                  : "Container size not set"}
              </span>
            </div>
            <button
              className="text-button"
              onClick={() => {
                setEdit({
                  ...blank,
                  ...r,
                  ingredients: r.ingredients.map((i) => ({ ...i })),
                });
                setError(null);
                setMessage("");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              Edit {r.name} →
            </button>
          </article>
        ))}
      </div>
      {!filtered.length && (
        <div className="empty">
          No dishes match. Add a dish to make this menu yours.
        </div>
      )}
    </>
  );
}
