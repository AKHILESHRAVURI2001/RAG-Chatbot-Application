import { describe, expect, it } from 'vitest';
import { InvalidSvgError, sanitizeSvg } from '../../src/utils/svgSanitizer';

describe('sanitizeSvg', () => {
  it('keeps a clean icon SVG verbatim (modulo attribute order)', () => {
    const clean = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2L2 22h20z" fill="currentColor"/></svg>';
    expect(sanitizeSvg(clean)).toBe(clean);
  });

  it('strips <script> tags and their content entirely', () => {
    const result = sanitizeSvg('<svg viewBox="0 0 10 10"><script>alert(1)</script><circle cx="5" cy="5" r="4"/></svg>');
    expect(result).not.toContain('script');
    expect(result).not.toContain('alert');
    expect(result).toContain('<circle');
  });

  it('strips onload/onclick and every other event-handler attribute', () => {
    const result = sanitizeSvg('<svg onload="evil()" viewBox="0 0 10 10"><path d="M0 0" onclick="evil()" fill="red"/></svg>');
    expect(result).not.toContain('onload');
    expect(result).not.toContain('onclick');
    expect(result).toContain('fill="red"');
  });

  it('strips <foreignObject> and any HTML it carries, since that can hold arbitrary markup', () => {
    const result = sanitizeSvg('<svg viewBox="0 0 10 10"><foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><img src=x onerror=alert(1)></body></foreignObject><rect width="10" height="10"/></svg>');
    expect(result).not.toContain('foreignObject');
    expect(result).not.toContain('onerror');
    expect(result).toContain('<rect');
  });

  it('strips <image> and <use> (both can reference an external URL)', () => {
    const result = sanitizeSvg('<svg viewBox="0 0 10 10"><image href="https://evil.example/track.png"/><use href="#somewhere-else"/><path d="M0 0"/></svg>');
    expect(result).not.toContain('image');
    expect(result).not.toContain('evil.example');
    expect(result).not.toContain('<use');
  });

  it('strips <style> tags (can smuggle a remote url() background)', () => {
    const result = sanitizeSvg('<svg viewBox="0 0 10 10"><style>svg{background:url(https://evil.example)}</style><path d="M0 0"/></svg>');
    expect(result).not.toContain('style');
    expect(result).not.toContain('evil.example');
  });

  it('keeps gradients and their stops — a common legitimate icon pattern', () => {
    const result = sanitizeSvg(
      '<svg viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient></defs><rect width="10" height="10" fill="url(#g)"/></svg>',
    );
    expect(result).toContain('linearGradient');
    expect(result).toContain('stop-color');
    expect(result).toContain('fill="url(#g)"');
  });

  it('rejects a file with no <svg> element at all', () => {
    expect(() => sanitizeSvg('<html><body>not an icon</body></html>')).toThrow(InvalidSvgError);
    expect(() => sanitizeSvg('plain text, not markup')).toThrow(InvalidSvgError);
  });

  it('rejects empty input', () => {
    expect(() => sanitizeSvg('')).toThrow(InvalidSvgError);
    expect(() => sanitizeSvg('   ')).toThrow(InvalidSvgError);
  });

  it('rejects an SVG that is too large after cleaning', () => {
    const huge = `<svg viewBox="0 0 10 10">${'<path d="M0 0L1 1"/>'.repeat(2000)}</svg>`;
    expect(() => sanitizeSvg(huge)).toThrow(InvalidSvgError);
  });
});
