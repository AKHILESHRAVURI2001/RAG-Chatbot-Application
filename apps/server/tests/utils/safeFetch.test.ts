import { describe, expect, it } from 'vitest';
import { assertPublicHttpUrl, isNonPublicAddress } from '../../src/utils/safeFetch';

describe('isNonPublicAddress', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255',
    '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', '::ffff:127.0.0.1', '::ffff:10.0.0.5',
  ])('blocks %s', (addr) => {
    expect(isNonPublicAddress(addr)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '172.15.0.1', '172.32.0.1', '100.63.0.1', '93.184.216.34', '2606:4700:4700::1111', '::ffff:8.8.8.8'])('allows public %s', (addr) => {
    expect(isNonPublicAddress(addr)).toBe(false);
  });

  it('never treats something that is not an IP as public', () => {
    expect(isNonPublicAddress('not-an-ip')).toBe(true);
  });
});

describe('assertPublicHttpUrl', () => {
  it('rejects non-http(s) schemes', async () => {
    await expect(assertPublicHttpUrl('file:///etc/passwd')).rejects.toThrow('Only http/https');
    await expect(assertPublicHttpUrl('ftp://example.com/x')).rejects.toThrow('Only http/https');
  });

  it('rejects literal private and metadata addresses without any DNS lookup', async () => {
    await expect(assertPublicHttpUrl('http://127.0.0.1:4000/admin')).rejects.toThrow('private or internal');
    await expect(assertPublicHttpUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow('private or internal');
    await expect(assertPublicHttpUrl('http://[::1]/')).rejects.toThrow('private or internal');
    await expect(assertPublicHttpUrl('http://10.0.0.8/')).rejects.toThrow('private or internal');
  });

  it('rejects localhost by name', async () => {
    await expect(assertPublicHttpUrl('http://localhost:3000/')).rejects.toThrow('private or internal');
  });

  it('accepts a public literal address', async () => {
    await expect(assertPublicHttpUrl('https://8.8.8.8/')).resolves.toBeInstanceOf(URL);
  });

  it('rejects an invalid URL', async () => {
    await expect(assertPublicHttpUrl('not a url')).rejects.toThrow();
  });
});
