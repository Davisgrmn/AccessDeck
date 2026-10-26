import { AppLayout } from './components/AppLayout';
import { LandingPage } from './pages/LandingPage';
import { useEffect, useState } from 'react';
import { api, type Session } from './auth';
import { AccountPage } from './pages/AccountPage';
import { DashboardPage } from './pages/DashboardPage';
import { OrganizationPage } from './pages/OrganizationPage';
import { OrganizationsPage } from './pages/OrganizationsPage';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const path = window.location.pathname;
  const publicPage = ['/', '/login', '/register'].includes(path);
  useEffect(() => {
    const controller = new AbortController();
    api<Session>('/api/auth/session', { signal: controller.signal }).then(setSession).catch(() => {
      if (!controller.signal.aborted) setError('Could not load your session. Please reload the page.');
    });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!session) return;
    if (!publicPage && !session.user) window.location.replace('/login');
    if (session.user && ['/login', '/register'].includes(path)) window.location.replace('/dashboard');
  }, [session, publicPage, path]);

  async function signOut() {
    if (!session) return;
    setSigningOut(true);
    try {
      await api<void>('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken }, body: '{}' });
      window.location.assign('/login');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not sign out. Please try again.');
      setSigningOut(false);
    }
  }

  let page;
  if (!session) page = <p role="status">Loading your session…</p>;
  else if (path === '/') page = <LandingPage />;
  else if (path === '/login' || path === '/register') page = session.user ? <p role="status">Opening your dashboard…</p> : <AccountPage mode={path === '/login' ? 'login' : 'register'} session={session} onAuthenticated={(result) => { setSession(result); window.location.assign('/dashboard'); }} />;
  else if (!session.user) page = <p role="status">Opening sign-in…</p>;
  else if (path === '/dashboard') page = <DashboardPage user={session.user} />;
  else if (path === '/organization' && session.user.organization_id) page = <OrganizationPage organizationId={session.user.organization_id} />;
  else if (path === '/manage') page = session.user.role === 'product_manager' ? <OrganizationsPage /> : <div className="alert alert-warning" role="alert">This page requires a product manager account. <a className="alert-link" href="/dashboard">Return to your dashboard</a>.</div>;
  else if (/^\/organizations\/[1-9][0-9]*$/.test(path)) page = <OrganizationPage organizationId={Number(path.split('/')[2])} />;
  else page = <p>This page is unavailable. <a href="/dashboard">Open your dashboard</a>.</p>;

  return <AppLayout user={session?.user} onSignOut={() => { void signOut(); }} signingOut={signingOut}>
    {error && <div className="alert alert-danger" role="alert">{error} <a className="alert-link" href={path}>Reload page</a></div>}
    {page}
  </AppLayout>;
}
