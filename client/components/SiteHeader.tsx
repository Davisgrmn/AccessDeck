import type { AuthUser } from '../auth';

export function SiteHeader({ user = null, onSignOut, signingOut = false }: { user?: AuthUser | null; onSignOut?: () => void; signingOut?: boolean }) {
  return (
    <header className="border-bottom">
      <nav className="container d-flex flex-wrap gap-3 align-items-center justify-content-between py-4" aria-label="Main navigation">
        <a className="brand text-decoration-none" href="/">AccessDeck<span aria-hidden="true">.</span></a>
        <div className="d-flex flex-wrap gap-3 align-items-center">
          <a className="text-light text-decoration-none" href="/#plans">Demo plans</a>
          <a className="text-light text-decoration-none" href="/#reports">Report samples</a>
          {user ? <>
            <a className="text-light text-decoration-none" href="/dashboard">Dashboard</a>
            {user.role === 'product_manager'
              ? <a className="text-light text-decoration-none" href="/manage">Organizations</a>
              : <a className="text-light text-decoration-none" href="/organization">My organization</a>}
            <span className="badge text-bg-secondary">{user.role === 'product_manager' ? 'Product manager' : 'Customer'}</span>
            <button className="btn btn-outline-light btn-sm" type="button" onClick={onSignOut} disabled={signingOut}>{signingOut ? 'Signing out…' : 'Sign out'}</button>
          </> : <>
            <a className="text-light text-decoration-none" href="/login">Sign in</a>
            <a className="btn btn-primary btn-sm" href="/register">Create account</a>
          </>}
        </div>
      </nav>
    </header>
  );
}
