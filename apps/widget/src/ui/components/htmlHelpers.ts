import { AVATAR_SVG } from '../widgetIcons';

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

export function renderHtml(raw: string): string {
  if (!raw) return '';
  const cleaned = raw
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\son\w+\s*=\s*[^>\s]+/gi, '')
    .replace(/href\s*=\s*(['"])\s*javascript:[^'"]*\1/gi, 'href="#"');
  return cleaned.replace(/<a\b(?![^>]*\btarget=)([^>]*?)>/gi, '<a target="_blank" rel="noopener noreferrer" $1>');
}

export function isImageUrl(str: string): boolean {
  if (!str) return false;
  const trimmed = str.trim();
  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('/') ||
    /\.(png|jpe?g|svg|webp|gif|ico)(\?.*)?$/i.test(trimmed)
  );
}

export function renderAvatarHtml(icon?: string, iconSvg?: string): string {
  if (iconSvg && iconSvg.trim().startsWith('<svg')) {
    return iconSvg;
  }
  if (icon && isImageUrl(icon)) {
    return `<img src="${escapeHtml(icon.trim())}" alt="Bot" class="mcb-avatar-img" onerror="this.style.display='none'" />`;
  }
  if (icon && icon.trim()) {
    return `<span class="mcb-avatar-emoji">${escapeHtml(icon.trim())}</span>`;
  }
  return AVATAR_SVG;
}

export function setBubbleIcon(bubble: HTMLElement, icon: string, iconSvg?: string): void {
  let iconEl = bubble.querySelector<HTMLElement>('.mcb-bubble-icon');
  if (!iconEl) {
    iconEl = document.createElement('span');
    iconEl.className = 'mcb-bubble-icon';
    bubble.appendChild(iconEl);
  }
  if (iconSvg && iconSvg.trim().startsWith('<svg')) {
    iconEl.innerHTML = iconSvg;
  } else if (isImageUrl(icon)) {
    iconEl.innerHTML = `<img src="${escapeHtml(icon.trim())}" alt="Chat" class="mcb-bubble-img" onerror="this.parentElement.textContent='💬'" />`;
  } else {
    iconEl.textContent = icon || '💬';
  }
  if (!bubble.querySelector('.mcb-bubble-close')) {
    const closeEl = document.createElement('span');
    closeEl.className = 'mcb-bubble-close';
    closeEl.innerHTML = '✕';
    bubble.appendChild(closeEl);
  }
  if (!bubble.querySelector('.mcb-unread-badge')) {
    const badge = document.createElement('span');
    badge.className = 'mcb-unread-badge';
    bubble.appendChild(badge);
  }
}

export function setUnreadBadge(bubble: HTMLElement, count: number): void {
  const badge = bubble.querySelector<HTMLElement>('.mcb-unread-badge');
  if (badge) badge.textContent = count > 9 ? '9+' : String(count);
  bubble.classList.toggle('mcb-has-unread', count > 0);
}
