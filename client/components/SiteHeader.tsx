export function SiteHeader() {
  return (
    <header className="border-bottom">
      <nav className="container d-flex flex-wrap gap-3 align-items-center justify-content-between py-4" aria-label="Main navigation">
        <a className="brand text-decoration-none" href="/">AccessDeck<span aria-hidden="true">.</span></a>
        <div className="d-flex flex-wrap gap-4">
          <a className="text-light text-decoration-none" href="/#plans">Demo plans</a>
          <a className="text-light text-decoration-none" href="/#reports">Report samples</a>
        </div>
      </nav>
    </header>
  );
}
