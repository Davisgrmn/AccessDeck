import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import 'bootstrap/dist/css/bootstrap.min.css';
import './styles.css';

type Plan = { name: string; monthly_price_cents: number; export_limit: number };

function App() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [status, setStatus] = useState('Loading demonstration plans…');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/plans', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load plans');
        return response.json() as Promise<{ plans: Plan[] }>;
      })
      .then(({ plans }) => {
        setPlans(plans);
        setStatus('Demonstration plans are ready.');
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('Plans are unavailable. Please try again later.');
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="app-shell" data-bs-theme="dark">
      <header className="border-bottom">
        <nav className="container d-flex align-items-center justify-content-between py-4" aria-label="Main navigation">
          <a className="brand text-decoration-none" href="/">AccessDeck<span aria-hidden="true">.</span></a>
          <a className="text-light text-decoration-none" href="#plans">Demo plans</a>
        </nav>
      </header>
      <main className="container flex-grow-1 py-5">
        <section className="hero py-md-5" aria-labelledby="welcome-title">
          <p className="eyebrow">SUBSCRIPTION ACCESS &amp; USAGE MANAGEMENT</p>
          <h1 id="welcome-title" className="display-3 fw-semibold">Hello World.<br /><span>Welcome to AccessDeck.</span></h1>
          <p className="lead text-secondary-emphasis mt-4 mb-4">
            One place to define your plans, explain customer access, and understand usage.
          </p>
          <a className="btn btn-primary px-4 py-2" href="#plans">Explore demo plans</a>
          <p className="small text-secondary-emphasis mt-3">CS408 project · Initial application setup</p>
        </section>
        <section id="plans" className="py-4" aria-labelledby="plans-title">
          <h2 id="plans-title" className="h3">Three plans. Clear limits.</h2>
          <p className="text-secondary-emphasis">Fictional demo prices and monthly CSV export allowances. No payments are collected.</p>
          <p className="small text-secondary-emphasis" role="status">{status}</p>
          <div className="row g-3 mt-1">
            {plans.map((plan) => (
              <div className="col-md-4" key={plan.name}>
                <article className="card h-100 p-4">
                  <h3 className="h5">{plan.name}</h3>
                  <p className="fs-2 fw-semibold my-3">
                    ${(plan.monthly_price_cents / 100).toFixed(0)}<span className="fs-6 fw-normal text-secondary-emphasis"> / month</span>
                  </p>
                  <p className="mb-0 text-secondary-emphasis">{plan.export_limit} CSV exports per calendar month</p>
                </article>
              </div>
            ))}
          </div>
        </section>
      </main>
      <footer className="border-top py-4">
        <div className="container d-flex flex-wrap gap-3 justify-content-between text-secondary-emphasis small">
          <span>AccessDeck · CS408</span>
          <a className="text-secondary-emphasis" href="/api/health">System health</a>
        </div>
      </footer>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
