import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppLayout } from '../client/components/AppLayout';

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
});
