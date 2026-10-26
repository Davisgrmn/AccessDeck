import { DemoPlans } from '../components/DemoPlans';
import { DemoReports } from '../components/DemoReports';

export function LandingPage() {
  return (
    <>
      <section className="hero py-md-5" aria-labelledby="welcome-title">
        <p className="eyebrow">SUBSCRIPTION ACCESS &amp; USAGE MANAGEMENT</p>
        <h1 id="welcome-title" className="display-3 fw-semibold"><span>Welcome to AccessDeck.</span></h1>
        <p className="lead text-secondary-emphasis mt-4 mb-4">One place to define your plans, explain customer access, and understand usage.</p>
        <div className="d-flex flex-wrap gap-3">
          <a className="btn btn-primary px-4 py-2" href="/register">Create an account</a>
          <a className="btn btn-outline-light px-4 py-2" href="#plans">Explore demo plans</a>
        </div>
      </section>
      <DemoPlans />
      <DemoReports />
    </>
  );
}
