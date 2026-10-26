import { useState, type FormEvent } from 'react';
import { api, ApiError, type Session } from '../auth';

export function AccountPage({ mode, session, onAuthenticated }: { mode: 'login' | 'register'; session: Session; onAuthenticated: (session: Session) => void }) {
  const registering = mode === 'register';
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError('');
    setFields({});
    try {
      const result = await api<Session>('/api/auth/' + mode, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken },
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      onAuthenticated(result);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not connect. Please try again.');
      if (failure instanceof ApiError) setFields(failure.fields);
      setPending(false);
    }
  }

  const input = (name: string, label: string, type: string, autoComplete: string, maximum: number, minimum?: number) => (
    <div className="mb-3">
      <label className="form-label" htmlFor={name}>{label}</label>
      <input className={`form-control${fields[name] ? ' is-invalid' : ''}`} id={name} name={name} type={type} required
        autoComplete={autoComplete} maxLength={maximum} minLength={minimum} aria-invalid={Boolean(fields[name])}
        aria-describedby={fields[name] ? `${name}-error` : name === 'password' && registering ? 'password-help' : undefined} />
      {fields[name] && <div id={`${name}-error`} className="invalid-feedback">{fields[name]}</div>}
    </div>
  );
  return (
    <section className="account-panel mx-auto" aria-labelledby="account-title">
      <p className="eyebrow">YOUR ACCESSDECK WORKSPACE</p>
      <h1 id="account-title" className="h2">{registering ? 'Create your account' : 'Welcome back'}</h1>
      <p className="text-secondary-emphasis">{registering ? 'Start a new organization on the Free plan. No payment is collected.' : 'Sign in to your organization or management workspace.'}</p>
      <div className="card p-4 mt-4">
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        <form onSubmit={(event) => { void submit(event); }}>
          <fieldset disabled={pending}>
            {registering && input('name', 'Your name', 'text', 'name', 100)}
            {registering && input('organizationName', 'Organization name', 'text', 'organization', 100)}
            {input('email', 'Email address', 'email', 'email', 254)}
            {input('password', 'Password', 'password', registering ? 'new-password' : 'current-password', 128, registering ? 12 : undefined)}
            {registering && <p id="password-help" className="small text-secondary-emphasis">Use 12–128 characters. Each registration creates a separate customer organization.</p>}
            <button className="btn btn-primary w-100 mt-2" type="submit">{pending ? 'Please wait…' : registering ? 'Create account' : 'Sign in'}</button>
          </fieldset>
        </form>
      </div>
      <p className="mt-4">{registering ? 'Already have an account? ' : 'New to AccessDeck? '}<a href={registering ? '/login' : '/register'}>{registering ? 'Sign in' : 'Create an account'}</a></p>
    </section>
  );
}
