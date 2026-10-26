import type { ReactNode } from 'react';
import { SiteHeader } from './SiteHeader';
import { SiteFooter } from './SiteFooter';
import type { AuthUser } from '../auth';

export function AppLayout({ children, user, onSignOut, signingOut }: { children: ReactNode; user?: AuthUser | null; onSignOut?: () => void; signingOut?: boolean }) {
  return (
    <div className="app-shell" data-bs-theme="dark">
      <a className="skip-link visually-hidden-focusable bg-dark text-light p-3" href="#main-content">Skip to content</a>
      <SiteHeader user={user} onSignOut={onSignOut} signingOut={signingOut} />
      <main id="main-content" className="container flex-grow-1 py-5" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
