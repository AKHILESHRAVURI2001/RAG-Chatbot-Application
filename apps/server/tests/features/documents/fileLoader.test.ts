import { describe, expect, it } from 'vitest';
import { loadFileContent, SUPPORTED_FILE_TYPES } from '../../../src/features/documents/fileLoader';

describe('loadFileContent', () => {
  it('reads plain text files verbatim', async () => {
    const text = await loadFileContent(Buffer.from('hello world'), 'notes.txt', 'text/plain');
    expect(text).toBe('hello world');
  });

  it('accepts extra plain-text extensions (yaml, log)', async () => {
    expect(await loadFileContent(Buffer.from('a: 1'), 'config.yaml', 'application/x-yaml')).toBe('a: 1');
    expect(await loadFileContent(Buffer.from('line one'), 'app.log', 'text/plain')).toBe('line one');
  });

  it('strips tags/scripts/styles from HTML files', async () => {
    const html = '<html><head><style>.x{}</style></head><body><nav>skip</nav><h1>Title</h1><script>evil()</script><p>Real content.</p></body></html>';
    const text = await loadFileContent(Buffer.from(html), 'page.html', 'text/html');
    expect(text).toContain('Title');
    expect(text).toContain('Real content.');
    expect(text).not.toContain('evil()');
    expect(text).not.toContain('skip');
  });

  it('rejects an HTML file with no extractable text', async () => {
    const html = '<html><body><script>evil()</script></body></html>';
    await expect(loadFileContent(Buffer.from(html), 'empty.html', 'text/html')).rejects.toThrow(/No readable text/);
  });

  it('rejects unsupported file types with a helpful message listing what is supported', async () => {
    await expect(loadFileContent(Buffer.from('binary'), 'archive.zip', 'application/zip')).rejects.toThrow(/Unsupported file type/);
    await expect(loadFileContent(Buffer.from('binary'), 'archive.zip', 'application/zip')).rejects.toThrow(new RegExp(SUPPORTED_FILE_TYPES[0]));
  });
});
