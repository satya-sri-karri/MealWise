import { useEffect, useRef, useState } from "react";
import { api, mockMode } from "./api";
import { ErrorBox } from "./components";
import type { Catalog, Insights, Plan } from "./types";
import { dateLabel, today } from "./utils";
import Dashboard from "./pages/Dashboard";
import Planner from "./pages/Planner";
import Results from "./pages/Results";
import History from "./pages/History";
type Page = "dashboard" | "plan" | "results" | "history";
const pages: { id: Page; label: string; icon: string; subtitle: string }[] = [
  {
    id: "dashboard",
    label: "Overview",
    icon: "▦",
    subtitle: "A little clarity for your kitchen.",
  },
  {
    id: "plan",
    label: "Plan a Meal",
    icon: "+",
    subtitle: "The right quantities start with a thoughtful plan.",
  },
  {
    id: "results",
    label: "Record Results",
    icon: "✓",
    subtitle: "Capture what happened after service.",
  },
  {
    id: "history",
    label: "History & Insights",
    icon: "◷",
    subtitle: "Learn from every meal.",
  },
];
export default function App() {
  const [page, setPage] = useState<Page>("dashboard"),
    [catalog, setCatalog] = useState<Catalog | null>(null),
    [plans, setPlans] = useState<Plan[]>([]),
    [insights, setInsights] = useState<Insights | null>(null),
    [error, setError] = useState<unknown>(null),
    [loading, setLoading] = useState(true);
  const title = useRef<HTMLHeadingElement>(null);
  const previousPage = useRef(page);
  const active = pages.find((p) => p.id === page)!;
  async function refresh() {
    try {
      const [c, p, i] = await Promise.all([
        api.recipes(),
        api.plans(),
        api.insights(),
      ]);
      setCatalog(c);
      setPlans(p.plans);
      setInsights(i);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    document.title = `${active.label} · MealWise`;
    if (previousPage.current !== page) {
      title.current?.focus();
      previousPage.current = page;
    }
  }, [active, page]);
  return (
    <div className="app">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("dashboard");
          }}
        >
          <span className="brand-icon" aria-hidden="true">
            ✳
          </span>{" "}
          MealWise<span className="brand-dot">.</span>
        </a>
        <p className="sidebar-label">YOUR KITCHEN, IN BALANCE</p>
        <nav aria-label="Main navigation">
          {pages.map((p) => (
            <button
              key={p.id}
              aria-current={page === p.id ? "page" : undefined}
              onClick={() => setPage(p.id)}
            >
              <span aria-hidden="true">{p.icon}</span>
              {p.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span aria-hidden="true">↗</span>
          <strong>
            Every meal is a chance
            <br />
            to plan a little better.
          </strong>
          <p>Plan. Serve. Learn.</p>
        </div>
        <div className="kitchen">
          <span className="avatar">MW</span>
          <div>
            <strong>Hostel kitchen</strong>
            <small>
              {catalog
                ? `${catalog.settings.hostel_capacity} diner capacity`
                : "Kitchen workspace"}
            </small>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            Kitchen workspace <span className="slash">/</span>{" "}
            <b>{active.label}</b>
          </span>
          <span className="date">{dateLabel(today())} · IST</span>
        </header>
        <main id="main" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <p className="eyebrow">MEALWISE / DAILY OPERATIONS</p>
              <h1 ref={title} tabIndex={-1}>
                {active.label}
              </h1>
              <p>{active.subtitle}</p>
            </div>
            {page === "dashboard" && (
              <button className="primary" onClick={() => setPage("plan")}>
                + Plan a meal
              </button>
            )}
          </div>
          {mockMode && (
            <div className="notice demo">
              <b>Fixture mode · fictional demo data</b>
              <span>Saved only in this browser. No backend connection.</span>
            </div>
          )}
          {!mockMode &&
            (catalog?.settings.is_demo ||
              plans.some((p) => p.forecast.is_demo)) && (
              <div className="notice demo">
                <b>Demo data</b>
                <span>Fictional records; these are not verified savings.</span>
              </div>
            )}
          {error != null && (
            <>
              <ErrorBox error={error} />
              <button
                className="secondary retry"
                onClick={() => void refresh()}
              >
                Retry connection
              </button>
            </>
          )}
          {loading ? (
            <div className="panel loading" role="status">
              Loading your kitchen…
            </div>
          ) : catalog && insights ? (
            <>
              <div hidden={page !== "dashboard"}>
                <Dashboard
                  plans={plans}
                  insights={insights}
                  navigate={setPage}
                />
              </div>
              <div hidden={page !== "plan"}>
                <Planner catalog={catalog} onSaved={refresh} />
              </div>
              <div hidden={page !== "results"}>
                <Results
                  plans={plans}
                  onSaved={refresh}
                  active={page === "results"}
                />
              </div>
              <div hidden={page !== "history"}>
                <History plans={plans} insights={insights} />
              </div>
            </>
          ) : (
            <section className="panel">
              <h2>Let's connect your kitchen</h2>
              <p>
                Start the MealWise backend on port 8000 and retry. Your
                dashboard will appear when the service is ready.
              </p>
            </section>
          )}
          <footer>
            Made for thoughtful kitchens.<span>Plan → Serve → Learn</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
