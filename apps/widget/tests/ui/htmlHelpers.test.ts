import { beforeEach, describe, expect, it } from 'vitest';
import {
  escapeHtml,
  isImageUrl,
  renderAvatarHtml,
  renderHtml,
  setBubbleIcon,
  setUnreadBadge,
} from '../../src/ui/components/htmlHelpers';

describe('escapeHtml', () => {
  it('escapes all five HTML-sensitive characters', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });

  it('leaves plain text untouched', () => {
    expect(escapeHtml('Hello world 123')).toBe('Hello world 123');
  });
});

describe('isImageUrl', () => {
  it('accepts http(s) URLs', () => {
    expect(isImageUrl('http://example.com/pic')).toBe(true);
    expect(isImageUrl('https://example.com/pic')).toBe(true);
  });

  it('accepts data:image URLs', () => {
    expect(isImageUrl('data:image/png;base64,abc123')).toBe(true);
  });

  it('accepts root-relative paths', () => {
    expect(isImageUrl('/icons/bot.png')).toBe(true);
  });

  it('accepts bare filenames with an image extension', () => {
    expect(isImageUrl('bot.svg')).toBe(true);
    expect(isImageUrl('photo.JPEG')).toBe(true);
  });

  it('rejects plain text and emoji', () => {
    expect(isImageUrl('💬')).toBe(false);
    expect(isImageUrl('not a url')).toBe(false);
  });

  it('rejects an empty/falsy value', () => {
    expect(isImageUrl('')).toBe(false);
  });
});

describe('renderHtml (sanitization)', () => {
  it('returns an empty string for falsy input', () => {
    expect(renderHtml('')).toBe('');
  });

  it('strips <script> tags entirely', () => {
    expect(renderHtml('hi <script>alert(1)</script> there')).toBe('hi  there');
  });

  it('strips <iframe> tags entirely', () => {
    expect(renderHtml('<iframe src="evil.com"></iframe>safe')).toBe('safe');
  });

  it('strips inline event handler attributes', () => {
    const out = renderHtml('<div onclick="alert(1)">hi</div>');
    expect(out).not.toContain('onclick');
  });

  it('neutralizes javascript: hrefs', () => {
    const out = renderHtml('<a href="javascript:alert(1)">click</a>');
    expect(out).toContain('href="#"');
    expect(out).not.toContain('javascript:');
  });

  it('forces target="_blank" and rel="noopener noreferrer" onto anchors without one', () => {
    const out = renderHtml('<a href="https://example.com">link</a>');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it('leaves an anchor that already declares target alone', () => {
    const out = renderHtml('<a href="https://example.com" target="_self">link</a>');
    expect(out).toContain('target="_self"');
    expect(out.match(/target=/g)?.length).toBe(1);
  });
});

describe('renderAvatarHtml', () => {
  it('prefers a provided inline SVG', () => {
    const svg = '<svg><circle/></svg>';
    expect(renderAvatarHtml('💬', svg)).toBe(svg);
  });

  it('renders an <img> for an image-looking icon', () => {
    const out = renderAvatarHtml('https://example.com/bot.png');
    expect(out).toContain('<img');
    expect(out).toContain('src="https://example.com/bot.png"');
  });

  it('renders an emoji span for a plain emoji icon', () => {
    expect(renderAvatarHtml('💬')).toBe('<span class="mcb-avatar-emoji">💬</span>');
  });

  it('falls back to the default avatar SVG when no icon is given', () => {
    const out = renderAvatarHtml();
    expect(out).toContain('<svg');
  });

  it('escapes the icon value when used as an image src', () => {
    const out = renderAvatarHtml('https://example.com/"><script>alert(1)</script>.png');
    expect(out).not.toContain('<script>');
  });
});

describe('setBubbleIcon / setUnreadBadge (DOM mutation)', () => {
  let bubble: HTMLButtonElement;

  beforeEach(() => {
    bubble = document.createElement('button');
  });

  it('creates the icon, close, and unread-badge elements on first call', () => {
    setBubbleIcon(bubble, '💬');
    expect(bubble.querySelector('.mcb-bubble-icon')).not.toBeNull();
    expect(bubble.querySelector('.mcb-bubble-close')).not.toBeNull();
    expect(bubble.querySelector('.mcb-unread-badge')).not.toBeNull();
  });

  it('reuses the existing icon element on subsequent calls instead of duplicating it', () => {
    setBubbleIcon(bubble, '💬');
    setBubbleIcon(bubble, '🎉');
    expect(bubble.querySelectorAll('.mcb-bubble-icon').length).toBe(1);
    expect(bubble.querySelector('.mcb-bubble-icon')!.textContent).toBe('🎉');
  });

  it('renders an <img> inside the icon element for an image icon', () => {
    setBubbleIcon(bubble, 'https://example.com/bot.png');
    expect(bubble.querySelector('.mcb-bubble-icon img')).not.toBeNull();
  });

  it('setUnreadBadge sets the count text and toggles the has-unread class', () => {
    setBubbleIcon(bubble, '💬');
    setUnreadBadge(bubble, 3);
    expect(bubble.querySelector('.mcb-unread-badge')!.textContent).toBe('3');
    expect(bubble.classList.contains('mcb-has-unread')).toBe(true);

    setUnreadBadge(bubble, 0);
    expect(bubble.classList.contains('mcb-has-unread')).toBe(false);
  });

  it('setUnreadBadge caps the displayed count at "9+"', () => {
    setBubbleIcon(bubble, '💬');
    setUnreadBadge(bubble, 42);
    expect(bubble.querySelector('.mcb-unread-badge')!.textContent).toBe('9+');
  });
});
