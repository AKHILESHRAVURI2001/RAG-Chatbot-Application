import mammoth from 'mammoth';
import * as cheerio from 'cheerio';

const PLAIN_TEXT_EXTENSIONS = ['txt', 'md', 'markdown', 'csv', 'json', 'yml', 'yaml', 'log'];
const HTML_EXTENSIONS = ['html', 'htm'];
const XML_EXTENSIONS = ['xml'];

export const SUPPORTED_FILE_TYPES = ['.txt', '.md', '.pdf', '.docx', '.csv', '.json', '.yml', '.yaml', '.log', '.html', '.htm', '.xml'];

function extractHtmlText(html: string): string {
  const $ = cheerio.load(html);
  $('script, style, noscript, nav, footer, header, svg, form').remove();
  return $('body').text().replace(/\n{2,}/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();
}

function extractXmlText(xml: string): string {
  const $ = cheerio.load(xml, { xmlMode: true });
  $('script, style').remove();
  return $.root().text().replace(/\n{2,}/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();
}

export async function loadFileContent(buffer: Buffer, filename: string, mimetype: string): Promise<string> {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';

  if (mimetype === 'application/pdf' || ext === 'pdf') {
    const pdfParseModule = await import('pdf-parse');
    const pdfParse = typeof pdfParseModule === 'function' ? pdfParseModule : (pdfParseModule as any).default || pdfParseModule;
    const result = await (pdfParse as any)(buffer);
    return result.text;
  }

  if (
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === 'docx'
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (mimetype === 'text/html' || HTML_EXTENSIONS.includes(ext)) {
    const text = extractHtmlText(buffer.toString('utf-8'));
    if (!text) throw new Error('No readable text found in that HTML file');
    return text;
  }

  if (mimetype === 'application/xml' || mimetype === 'text/xml' || XML_EXTENSIONS.includes(ext)) {
    const text = extractXmlText(buffer.toString('utf-8'));
    if (!text) throw new Error('No readable text found in that XML file');
    return text;
  }

  if (mimetype.startsWith('text/') || PLAIN_TEXT_EXTENSIONS.includes(ext)) {
    return buffer.toString('utf-8');
  }

  throw new Error(`Unsupported file type: ${filename} (${mimetype}). Supported: ${SUPPORTED_FILE_TYPES.join(', ')}`);
}
