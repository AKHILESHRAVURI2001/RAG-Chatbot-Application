import { describe, expect, it } from 'vitest';
import { formatChatMarkdown } from '../../src/shared/chatFormat';

describe('formatChatMarkdown', () => {
  it('escapes raw HTML in the input so the bot cannot inject markup', () => {
    const out = formatChatMarkdown('<img src=x onerror=alert(1)>');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
  });

  it('wraps a plain line in a paragraph', () => {
    expect(formatChatMarkdown('Hello there')).toBe('<p>Hello there</p>');
  });

  it('skips blank lines without emitting empty paragraphs', () => {
    expect(formatChatMarkdown('Line one\n\nLine two')).toBe('<p>Line one</p><p>Line two</p>');
  });

  it('renders **bold** text as <strong>', () => {
    expect(formatChatMarkdown('This is **important**.')).toBe('<p>This is <strong>important</strong>.</p>');
  });

  it('renders `code` spans', () => {
    expect(formatChatMarkdown('Run `npm install` first')).toBe(
      '<p>Run <code class="mcb-inline-code">npm install</code> first</p>',
    );
  });

  it('renders [text](url) markdown links with safe target/rel attributes', () => {
    const out = formatChatMarkdown('See [our site](https://example.com/page).');
    expect(out).toContain('<a href="https://example.com/page" target="_blank" rel="noopener noreferrer" class="mcb-markdown-link">our site</a>');
  });

  it('autolinks bare URLs', () => {
    const out = formatChatMarkdown('Visit https://example.com for details.');
    expect(out).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer" class="mcb-auto-link">https://example.com</a>');
  });

  it('autolinks email addresses as mailto links', () => {
    const out = formatChatMarkdown('Contact us at hello@example.com anytime.');
    expect(out).toContain('<a href="mailto:hello@example.com" class="mcb-auto-link mcb-email-link">hello@example.com</a>');
  });

  it('autolinks a plausible phone number as a tel link', () => {
    const out = formatChatMarkdown('Call us on 9876543210 today.');
    expect(out).toContain('tel:9876543210');
    expect(out).toContain('mcb-phone-link');
  });

  it('renders a bullet list as <ul><li>', () => {
    const out = formatChatMarkdown('- First\n- Second');
    expect(out).toBe('<ul><li>First</li><li>Second</li></ul>');
  });

  it('closes a list before starting a following paragraph', () => {
    const out = formatChatMarkdown('- Only item\nAfter the list');
    expect(out).toBe('<ul><li>Only item</li></ul><p>After the list</p>');
  });

  it('renders a "Related articles:" section of markdown links as article cards', () => {
    const out = formatChatMarkdown('Related articles:\n- [Pricing guide](https://example.com/pricing)');
    expect(out).toContain('<p class="related-articles-heading">Related articles</p>');
    expect(out).toContain('<div class="related-articles">');
    expect(out).toContain('<a class="related-article-card" href="https://example.com/pricing" target="_blank" rel="noopener noreferrer" title="Pricing guide">Pricing guide</a>');
  });

  it('renders a "Suggested articles:" section with its own heading text', () => {
    const out = formatChatMarkdown('Suggested articles:\n- [Guide](https://example.com/guide)');
    expect(out).toContain('<p class="related-articles-heading">Suggested articles</p>');
  });

  it('falls back to a plain bullet list when a related-articles bullet is not a markdown link', () => {
    const out = formatChatMarkdown('Related articles:\n- Just plain text, not a link');
    expect(out).toContain('<ul>');
    expect(out).not.toContain('related-article-card');
  });
});
