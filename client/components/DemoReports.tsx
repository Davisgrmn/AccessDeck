import { useEffect, useState } from 'react';

type DemoReport = {
  id: number;
  organization_name: string;
  title: string;
  sample_data: { label: string; value: number }[];
};

export function DemoReports() {
  const [reports, setReports] = useState<DemoReport[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [status, setStatus] = useState('Loading report samples…');
  const selected = reports.find((report) => report.id === selectedId) ?? reports[0];

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/demo/reports', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load report samples');
        return response.json() as Promise<{ reports: DemoReport[] }>;
      })
      .then(({ reports }) => {
        setReports(reports);
        setStatus(reports.length ? 'Report samples are ready.' : 'No report samples are available.');
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('Report samples are unavailable. Please try again later.');
      });
    return () => controller.abort();
  }, []);

  return (
    <section id="reports" className="py-4" aria-labelledby="reports-title">
      <h2 id="reports-title" className="h3">Explore a report sample.</h2>
      <p className="text-secondary-emphasis">Public examples from fictional organizations. All numbers are demonstration data.</p>
      <p className="small text-secondary-emphasis" role="status">{status}</p>
      {selected && (
        <div className="card p-4">
          <label className="form-label" htmlFor="report-picker">Choose a sample</label>
          <select id="report-picker" className="form-select mb-4" value={selected.id} onChange={(event) => setSelectedId(Number(event.target.value))}>
            {reports.map((report) => <option key={report.id} value={report.id}>{report.organization_name} — {report.title}</option>)}
          </select>
          <div className="table-responsive">
            <table className="table mb-0">
              <caption className="caption-top text-light">{selected.title} · {selected.organization_name}</caption>
              <thead><tr><th scope="col">Metric</th><th scope="col" className="text-end">Sample value</th></tr></thead>
              <tbody>
                {selected.sample_data.map((row) => <tr key={row.label}><th scope="row" className="fw-normal">{row.label}</th><td className="text-end">{row.value.toLocaleString()}</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
