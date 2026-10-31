import { afterEach, describe, expect, it, vi } from 'vitest';

// getStaticAssetUrl reads document.currentScript once, synchronously, at module load time — so
// each test that wants a different "embedding script" needs its own fresh module instance.
async function loadWithCurrentScript(src: string | null) {
  vi.resetModules();
  const scriptEl = src ? Object.assign(document.createElement('script'), { src }) : null;
  vi.spyOn(document, 'currentScript', 'get').mockReturnValue(scriptEl as HTMLScriptElement | null);
  return import('../../src/shared/assetUrl');
}

describe('getStaticAssetUrl', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves a relative path against wherever the widget script was actually loaded from', async () => {
    const { getStaticAssetUrl } = await loadWithCurrentScript('https://cdn.example.com/widget/dist/widget.js');
    expect(getStaticAssetUrl('icons/foo.png')).toBe('https://cdn.example.com/widget/dist/icons/foo.png');
  });

  it('works the same regardless of which domain or subpath the dist folder is hosted under', async () => {
    const { getStaticAssetUrl } = await loadWithCurrentScript('https://example.org/some/nested/path/widget.js');
    expect(getStaticAssetUrl('test-icon.png')).toBe('https://example.org/some/nested/path/test-icon.png');
  });

  it('falls back to returning the path unchanged when there is no current script to resolve against', async () => {
    const { getStaticAssetUrl } = await loadWithCurrentScript(null);
    expect(getStaticAssetUrl('icons/foo.png')).toBe('icons/foo.png');
  });
});
