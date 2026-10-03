import { createHash } from 'crypto';

export function normalizeQuestion(text: string): string {
  return text.trim().toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
}

export function hashQuestion(text: string): string {
  return createHash('sha256').update(normalizeQuestion(text)).digest('hex');
}
