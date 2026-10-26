import { Resource } from '../components/Resource';

type Organization = { id: number; name: string; plan_name: string | null; status: string | null };

export function OrganizationsPage() {
  return (
    <section aria-labelledby="organizations-title">
      <p className="eyebrow">PRODUCT MANAGER</p>
      <h1 id="organizations-title" className="h2">Organizations</h1>
      <p className="text-secondary-emphasis">Inspect customer workspaces across organizations. Showing the 100 most recently created organizations.</p>
      <Resource<{ organizations: Organization[] }> path="/api/manager/organizations">
        {({ organizations }) => organizations.length ? (
          <div className="card p-3 mt-4 table-responsive">
            <table className="table mb-0"><caption>Organization subscriptions</caption>
              <thead><tr><th scope="col">Organization</th><th scope="col">Plan</th><th scope="col">Status</th><th scope="col">Workspace</th></tr></thead>
              <tbody>{organizations.map((organization) => <tr key={organization.id}>
                <th scope="row">{organization.name}</th><td>{organization.plan_name ?? 'Unassigned'}</td><td>{organization.status ?? 'Unassigned'}</td>
                <td><a href={`/organizations/${organization.id}`} aria-label={`View ${organization.name}`}>View organization</a></td>
              </tr>)}</tbody>
            </table>
          </div>
        ) : <p role="status">No organizations have been created yet.</p>}
      </Resource>
    </section>
  );
}
