import * as cheerio from 'cheerio';

const ALLOWED_TAGS = new Set([
  'svg',
  'g',
  'defs',
  'title',
  'desc',
  'path',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'rect',
  'text',
  'tspan',
  'lineargradient',
  'radialgradient',
  'stop',
  'clippath',
  'mask',
]);

const ALLOWED_ATTRS = new Set([
  'viewbox',
  'width',
  'height',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'points',
  'd',
  'transform',
  'fill',
  'fill-rule',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-opacity',
  'opacity',
  'offset',
  'stop-color',
  'stop-opacity',
  'gradientunits',
  'gradienttransform',
  'clip-path',
  'mask',
  'font-size',
  'font-family',
  'font-weight',
  'text-anchor',
  'xmlns',
  'id',
  'class',
]);

const MAX_SANITIZED_LENGTH = 20_000;

export class InvalidSvgError extends Error {}

export function sanitizeSvg(raw: string): string {
  const text = raw.trim();
  if (!text) throw new InvalidSvgError('The file is empty.');
  if (!/<svg[\s>]/i.test(text)) throw new InvalidSvgError('That file does not look like an SVG (no <svg> element found).');

  const $ = cheerio.load(text, { xmlMode: true });
  const root = $('svg').first();
  if (root.length === 0) throw new InvalidSvgError('That file does not look like an SVG (no <svg> element found).');

  $('*').each((_, el) => {
    if (el.type !== 'tag') return;
    const tagName = el.tagName?.toLowerCase() ?? '';
    if (!ALLOWED_TAGS.has(tagName)) {
      $(el).remove();
      return;
    }
    for (const attr of Object.keys(el.attribs)) {
      if (!ALLOWED_ATTRS.has(attr.toLowerCase())) delete el.attribs[attr];
    }
  });

  if ($('svg').length === 0) throw new InvalidSvgError('Nothing safe to keep was found in that file.');

  const cleaned = $.xml($('svg').first());
  if (cleaned.length > MAX_SANITIZED_LENGTH) {
    throw new InvalidSvgError(`That SVG is too complex for an icon (over ${MAX_SANITIZED_LENGTH.toLocaleString()} characters after cleaning) — simplify it and try again.`);
  }
  return cleaned;
}
