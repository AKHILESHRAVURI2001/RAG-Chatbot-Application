import { describe, expect, it } from 'vitest';
import { formatChatMarkdown } from '../../src/shared/chatFormat';

describe('formatChatMarkdown', () => {
  it('renders bold text', () => {
    expect(formatChatMarkdown('This is **important**.')).toBe('<p>This is <strong>important</strong>.</p>');
  });

  it('renders a bullet list, including bold text inside a bullet', () => {
    const input = '* **Guides:** Step-by-step help.\n* **Calculators:** Cost planning tools.';
    expect(formatChatMarkdown(input)).toBe(
      '<ul><li><strong>Guides:</strong> Step-by-step help.</li><li><strong>Calculators:</strong> Cost planning tools.</li></ul>',
    );
  });

  it('mixes paragraphs and a list in document order', () => {
    const input = 'Intro line.\n\n* First\n* Second\n\nClosing line.';
    expect(formatChatMarkdown(input)).toBe('<p>Intro line.</p><ul><li>First</li><li>Second</li></ul><p>Closing line.</p>');
  });

  it('renders a markdown link inline as a real anchor tag, opening in a new tab', () => {
    expect(formatChatMarkdown('See our [pricing page](https://example.com/pricing) for details.')).toBe(
      '<p>See our <a href="https://example.com/pricing" target="_blank" rel="noopener noreferrer">pricing page</a> for details.</p>',
    );
  });

  it('renders the "Related articles" section as a card grid, not a plain bullet list', () => {
    const input =
      'Here you go.\n\nRelated articles:\n- [First-Time Buyer Guide](https://example.com/guide)\n- [Pricing FAQ](https://example.com/pricing)';
    expect(formatChatMarkdown(input)).toBe(
      '<p>Here you go.</p><p class="related-articles-heading">Related articles</p>' +
        '<div class="related-articles">' +
        '<a class="related-article-card" href="https://example.com/guide" target="_blank" rel="noopener noreferrer" title="First-Time Buyer Guide">First-Time Buyer Guide</a>' +
        '<a class="related-article-card" href="https://example.com/pricing" target="_blank" rel="noopener noreferrer" title="Pricing FAQ">Pricing FAQ</a>' +
        '</div>',
    );
  });

  it('renders the "Suggested articles" section when information is not directly in knowledge base', () => {
    const input =
      'I do not have access to images.\n\nSuggested articles:\n- [UK Property Guides](https://example.com/guides)';
    expect(formatChatMarkdown(input)).toBe(
      '<p>I do not have access to images.</p><p class="related-articles-heading">Suggested articles</p>' +
        '<div class="related-articles">' +
        '<a class="related-article-card" href="https://example.com/guides" target="_blank" rel="noopener noreferrer" title="UK Property Guides">UK Property Guides</a>' +
        '</div>',
    );
  });

  it('renders an ordinary bullet list of links as a normal list, not cards, outside a "Related articles" section', () => {
    const input = '- [Guide one](https://example.com/a)\n- [Guide two](https://example.com/b)';
    expect(formatChatMarkdown(input)).toBe(
      '<ul>' +
        '<li><a href="https://example.com/a" target="_blank" rel="noopener noreferrer">Guide one</a></li>' +
        '<li><a href="https://example.com/b" target="_blank" rel="noopener noreferrer">Guide two</a></li>' +
        '</ul>',
    );
  });

  it('does not linkify a non-http(s) scheme, even though the text is already escaped', () => {
    const input = '[Click me](javascript:alert(1))';
    expect(formatChatMarkdown(input)).toBe('<p>[Click me](javascript:alert(1))</p>');
  });

  it('escapes HTML so a response can never inject markup', () => {
    expect(formatChatMarkdown('<script>alert(1)</script>')).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  });

  it('skips blank lines instead of emitting empty paragraphs', () => {
    expect(formatChatMarkdown('One.\n\n\nTwo.')).toBe('<p>One.</p><p>Two.</p>');
  });

  it('autolinks email addresses to mailto links', () => {
    expect(formatChatMarkdown('Please email us at info@example.com for help.')).toBe(
      '<p>Please email us at <a href="mailto:info@example.com" class="mcb-auto-link mcb-email-link">info@example.com</a> for help.</p>',
    );
  });

  it('autolinks phone and contact module numbers', () => {
    expect(formatChatMarkdown('Call us at +44 20 7946 0991 or contact module #80967900.')).toBe(
      '<p>Call us at <a href="tel:+442079460991" class="mcb-auto-link mcb-phone-link">+44 20 7946 0991</a> or contact module <a href="tel:80967900" class="mcb-auto-link mcb-phone-link">#80967900</a>.</p>',
    );
  });

  it('does not linkify short non-phone numbers like years or percentages', () => {
    expect(formatChatMarkdown('Founded in 2026 with 100% satisfaction.')).toBe(
      '<p>Founded in 2026 with 100% satisfaction.</p>',
    );
  });

  it('returns an empty string for empty input', () => {
    expect(formatChatMarkdown('')).toBe('');
  });
});
