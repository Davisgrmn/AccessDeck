import type { AuthUser } from '../auth';
import { Resource } from '../components/Resource';

export function DashboardPage({ user }: { user: AuthUser }) {
  return (
    <section aria-labelledby="dashboard-title">
      <p className="eyebrow">{user.role === 'product_manager' ? 'PRODUCT MANAGER' : 'CUSTOMER WORKSPACE'}</p>
      <h1 id="dashboard-title" className="h2">Welcome, {user.name}.</h1>
      <p className="text-secondary-emphasis">Signed in as {user.email}.</p>
      <Resource<{ summary?: { organizations: number; customers: number; plans: number } }> path="/api/dashboard">
        {({ summary }) => summary ? (
          <>
            <div className="row g-3 my-3">
              {Object.entries(summary).map(([label, value]) => <div className="col-sm-4" key={label}><div className="card p-4"><p className="text-capitalize text-secondary-emphasis">{label}</p><p className="display-6 mb-0">{value}</p></div></div>)}
            </div>
            <a className="btn btn-primary" href="/manage">View organizations</a>
          </>
        ) : (
          <div className="card p-4 mt-4">
            <h2 className="h4">{user.organization_name}</h2>
            <p className="text-secondary-emphasis">Your organization’s subscription and private report previews are available in your workspace.</p>
            <div><a className="btn btn-primary" href="/organization">Open my organization</a></div>
          </div>
        )}
      </Resource>
    </section>
  );
}
