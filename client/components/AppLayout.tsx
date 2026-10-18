import type { ReactNode } from 'react';
import { SiteHeader } from './SiteHeader';
import { SiteFooter } from './SiteFooter';

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell" data-bs-theme="dark">
      <a className="skip-link visually-hidden-focusable bg-dark text-light p-3" href="#main-content">Skip to content</a>
      <SiteHeader />
      <main id="main-content" className="container flex-grow-1 py-5" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
