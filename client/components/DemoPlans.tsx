import { useEffect, useState } from 'react';

type Plan = { name: string; monthly_price_cents: number; export_limit: number };

export function DemoPlans() {
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
        setStatus(plans.length ? 'Demonstration plans are ready.' : 'No demonstration plans are available.');
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('Plans are unavailable. Please try again later.');
      });
    return () => controller.abort();
  }, []);

  return (
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
  );
}
