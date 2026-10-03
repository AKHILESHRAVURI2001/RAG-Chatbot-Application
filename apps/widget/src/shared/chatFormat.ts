function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function autolinkContent(s: string): string {
  const tokens: string[] = [];

  // 1. Protect existing HTML tags and links
  let text = s.replace(/<a\b[^>]*>.*?<\/a>|<strong\b[^>]*>.*?<\/strong>/gi, (match) => {
    tokens.push(match);
    return `___TOKEN_${tokens.length - 1}___`;
  });

  // 2. Autolink email addresses
  text = text.replace(/(?<![a-zA-Z0-9._%+-])([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?![a-zA-Z0-9._%+-])/g, (_match, email) => {
    tokens.push(`<a href="mailto:${email}" class="mcb-auto-link mcb-email-link">${email}</a>`);
    return `___TOKEN_${tokens.length - 1}___`;
  });

  // 3. Autolink standalone URLs (not already part of anchor tags)
  text = text.replace(/\b(https?:\/\/[^\s<)]+)/gi, (_match, url) => {
    tokens.push(`<a href="${url}" target="_blank" rel="noopener noreferrer" class="mcb-auto-link">${url}</a>`);
    return `___TOKEN_${tokens.length - 1}___`;
  });

  // 4. Autolink phone and contact numbers (7 to 15 digits)
  // Supports international prefixes (+), hashes (#), dashes, dots, spaces, parentheses
  const phoneRegex = /(?:(?<=^|[\s,;:!?(])|\B#)(?:\+?\d{1,4}[\s.-]?)?(?:\(?\d{2,5}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}\b/g;
  text = text.replace(phoneRegex, (match) => {
    const digitsOnly = match.replace(/\D/g, '');
    if (digitsOnly.length < 7 || digitsOnly.length > 15) return match;
    const cleanTel = match.startsWith('+') ? `+${digitsOnly}` : digitsOnly;
    tokens.push(`<a href="tel:${cleanTel}" class="mcb-auto-link mcb-phone-link">${match}</a>`);
    return `___TOKEN_${tokens.length - 1}___`;
  });

  // 5. Restore tokens
  text = text.replace(/___TOKEN_(\d+)___/g, (_, idx) => tokens[Number(idx)] ?? '');

  return text;
}

function formatInline(s: string): string {
  let result = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/`([^`]+)`/g, '<code class="mcb-inline-code">$1</code>');
  result = result.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="mcb-markdown-link">$1</a>');
  result = autolinkContent(result);
  return result;
}

const RELATED_ARTICLES_HEADING = 'Related articles:';
const SUGGESTED_ARTICLES_HEADING = 'Suggested articles:';

export function formatChatMarkdown(raw: string): string {
  const lines = escapeHtml(raw).split('\n');
  let html = '';
  let inList = false;
  let inRelatedArticles = false;
  let justSawRelatedHeading = false;

  function closeList() {
    if (!inList) return;
    html += inRelatedArticles ? '</div>' : '</ul>';
    inList = false;
    inRelatedArticles = false;
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === RELATED_ARTICLES_HEADING || trimmed === SUGGESTED_ARTICLES_HEADING) {
      closeList();
      const isSuggested = trimmed === SUGGESTED_ARTICLES_HEADING;
      html += `<p class="related-articles-heading">${isSuggested ? 'Suggested articles' : 'Related articles'}</p>`;
      justSawRelatedHeading = true;
      continue;
    }
    const bulletMatch = line.match(/^\s*[-*]\s+(.*)$/);
    if (bulletMatch) {
      const linkMatch = bulletMatch[1].match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      if (!inList) {
        inRelatedArticles = justSawRelatedHeading && Boolean(linkMatch);
        html += inRelatedArticles ? '<div class="related-articles">' : '<ul>';
        inList = true;
      }
      justSawRelatedHeading = false;
      if (inRelatedArticles && linkMatch) {
        html += `<a class="related-article-card" href="${linkMatch[2]}" target="_blank" rel="noopener noreferrer" title="${linkMatch[1]}">${linkMatch[1]}</a>`;
      } else {
        html += `<li>${formatInline(bulletMatch[1])}</li>`;
      }
      continue;
    }
    closeList();
    if (line.trim() === '') continue;
    html += `<p>${formatInline(line)}</p>`;
  }
  closeList();
  return html;
}
