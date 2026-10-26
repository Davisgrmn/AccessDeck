export function SiteFooter() {
  return (
    <footer className="border-top py-4">
      <div className="container d-flex flex-wrap gap-3 justify-content-between text-secondary-emphasis small">
        <span>AccessDeck</span>
        <a className="text-secondary-emphasis" href="/api/health">System health</a>
      </div>
    </footer>
  );
}
