import dns from 'node:dns/promises';
import net from 'node:net';
import { env } from '../config/env';

/**
 * Fetching a URL that an admin typed in is a server-side request: left unchecked it can reach things only the
 * server can see (localhost, the cloud metadata service at 169.254.169.254, private networks). This module is the
 * single place those fetches go through. It refuses non-http(s) URLs and any host that resolves to a non-public
 * address — including after a redirect, which would otherwise be an easy way around the check.
 *
 * Set ALLOW_PRIVATE_URL_FETCH=true to ingest from internal sites (e.g. an intranet or a local dev server).
 * Known limit: the address is checked, then fetch resolves the name again; a hostile DNS server could answer
 * differently the second time. Run the server without access to sensitive internal services as the real defence.
 */

const MAX_REDIRECTS = 5;

/** True for loopback, private, link-local, carrier-grade NAT, multicast, reserved and unspecified addresses (IPv4 and IPv6). */
export function isNonPublicAddress(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return (
      a === 0 || // "this network"
      a === 10 ||
      a === 127 || // loopback
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
      (a === 169 && b === 254) || // link-local, incl. the cloud metadata service
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) || // IETF protocol assignments / documentation
      (a === 198 && (b === 18 || b === 19)) || // benchmarking
      a >= 224 // multicast and reserved
    );
  }
  if (net.isIPv6(address)) {
    const lower = address.toLowerCase();
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped, e.g. ::ffff:127.0.0.1
    if (mapped) return isNonPublicAddress(mapped[1]);
    return (
      lower === '::' ||
      lower === '::1' ||
      lower.startsWith('fc') || // unique local fc00::/7
      lower.startsWith('fd') ||
      /^fe[89ab]/.test(lower) || // link-local fe80::/10
      lower.startsWith('ff') // multicast
    );
  }
  return true; // not an IP at all — never treat unknown as public
}

export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  const parsed = new URL(rawUrl); // throws on an invalid URL
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only http/https URLs are supported');
  if (env.ALLOW_PRIVATE_URL_FETCH === 'true') return parsed;

  const host = parsed.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets
  const addresses = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((a) => a.address);
  if (addresses.length === 0 || addresses.some(isNonPublicAddress)) {
    throw new Error('That address points to a private or internal network, which can’t be fetched.');
  }
  return parsed;
}

/** `fetch` that validates the URL and every redirect hop before following it. */
export async function safeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHttpUrl(current);
    const res = await fetch(current, { ...init, redirect: 'manual' });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      current = new URL(location, current).toString();
      continue;
    }
    return res;
  }
  throw new Error('Too many redirects');
}
