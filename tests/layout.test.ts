import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppLayout } from '../client/components/AppLayout';
import { SiteHeader } from '../client/components/SiteHeader';

describe('shared application layout', () => {
  it('keeps navigation, landmarks, and keyboard skip access around different page content', () => {
    for (const title of ['Landing content', 'Another page']) {
      const html = renderToStaticMarkup(createElement(AppLayout, { children: createElement('h1', null, title) }));
      expect(html).toContain('href="#main-content"');
      expect(html).toContain('id="main-content"');
      expect(html).toContain('aria-label="Main navigation"');
      expect(html).toContain('href="/#plans"');
      expect(html).toContain('href="/#reports"');
      expect(html).toContain('href="/api/health"');
      expect(html).toContain(`<h1>${title}</h1>`);
      expect(html.indexOf('<header')).toBeLessThan(html.indexOf('<main'));
      expect(html.indexOf('</main>')).toBeLessThan(html.indexOf('<footer'));
    }
  });

  it('shows account links to visitors and only the navigation authorized for each role', () => {
    const visitor = renderToStaticMarkup(createElement(SiteHeader));
    expect(visitor).toContain('href="/login"');
    expect(visitor).toContain('href="/register"');
    expect(visitor).not.toContain('href="/manage"');
    const base = { id: 1, name: 'Customer', email: 'customer@example.test', organization_id: 1, organization_name: 'Example' };
    const customer = renderToStaticMarkup(createElement(SiteHeader, { user: { ...base, role: 'customer' } }));
    expect(customer).toContain('href="/organization"');
    expect(customer).toContain('href="/dashboard"');
    expect(customer).toContain('Sign out');
    expect(customer).not.toContain('href="/manage"');
    expect(customer).not.toContain('href="/register"');
    const manager = renderToStaticMarkup(createElement(SiteHeader, { user: { ...base, role: 'product_manager', organization_id: null, organization_name: null } }));
    expect(manager).toContain('href="/manage"');
    expect(manager).not.toContain('href="/organization"');
  });
});
