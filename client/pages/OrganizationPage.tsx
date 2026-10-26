import { Resource } from '../components/Resource';

type Workspace = {
  organization: { id: number; name: string; plan_name: string | null; status: string | null; monthly_price_cents: number | null; export_limit: number | null; used_count: number };
  reports: { id: number; title: string; sample_data: { label: string; value: number }[] }[];
};

export function OrganizationPage({ organizationId }: { organizationId: number }) {
  return (
    <Resource<Workspace> key={organizationId} path={`/api/organizations/${organizationId}`}>
      {({ organization, reports }) => (
        <section aria-labelledby="organization-title">
          <p className="eyebrow">ORGANIZATION WORKSPACE · ID {organization.id}</p>
          <h1 id="organization-title" className="h2">{organization.name}</h1>
          <div className="card p-4 my-4">
            <h2 className="h4">Subscription</h2>
            <dl className="row mb-0">
              <dt className="col-sm-4">Assigned plan</dt><dd className="col-sm-8">{organization.plan_name ?? 'Unassigned'}</dd>
              <dt className="col-sm-4">Status</dt><dd className="col-sm-8">{organization.status ?? 'Unassigned'}</dd>
              <dt className="col-sm-4">Monthly price</dt><dd className="col-sm-8">{organization.monthly_price_cents === null ? 'Unassigned' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(organization.monthly_price_cents / 100)} (demonstration)</dd>
              <dt className="col-sm-4">CSV usage this UTC month</dt><dd className="col-sm-8">{organization.used_count} / {organization.export_limit ?? 'Unassigned'}</dd>
            </dl>
          </div>
          <h2 className="h4">Organization reports</h2>
          <p className="text-secondary-emphasis">Fictional report previews belonging to this organization.</p>
          {reports.length ? <div className="row g-3">{reports.map((report) => (
            <div className="col-lg-6" key={report.id}><div className="card p-4 h-100">
              <h3 className="h5">{report.title}</h3>
              <div className="table-responsive"><table className="table mb-0">
                <caption className="visually-hidden">{report.title}</caption>
                <thead><tr><th scope="col">Metric</th><th scope="col" className="text-end">Sample value</th></tr></thead>
                <tbody>{report.sample_data.map((row) => <tr key={row.label}><th scope="row" className="fw-normal">{row.label}</th><td className="text-end">{row.value}</td></tr>)}</tbody>
              </table></div>
            </div></div>
          ))}</div> : <p role="status">This organization has no reports yet.</p>}
        </section>
      )}
    </Resource>
  );
}
