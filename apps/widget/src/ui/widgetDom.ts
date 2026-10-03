import { formatChatMarkdown } from '../shared';
import type { WidgetConfig } from '../types/widget.types';
import {
  AVATAR_SVG,
  ALERT_SVG,
  MIC_SVG,
  MIC_LARGE_SVG,
  SEND_SVG,
  REFRESH_SVG,
  WAVEFORM_SVG,
  LOCK_SVG,
  USER_SVG,
  USER_PLUS_SVG,
  LOGIN_SVG,
  LOGOUT_SVG,
} from './widgetIcons';
import widgetCss from '../widget.css?inline';
import {
  escapeHtml,
  renderHtml,
  isImageUrl,
  renderAvatarHtml,
  setBubbleIcon,
  setUnreadBadge,
} from './components/htmlHelpers';

export { escapeHtml, renderHtml, isImageUrl, renderAvatarHtml, setBubbleIcon, setUnreadBadge };

export interface WidgetDomElements {
  bubble: HTMLButtonElement;
  window: HTMLDivElement;
  headerAvatar: HTMLDivElement;
  messagesEl: HTMLDivElement;
  inputEl: HTMLInputElement | null;
  sendBtn: HTMLButtonElement | null;
  voiceTypeBtn: HTMLButtonElement | null;
  voiceAgentBtn: HTMLButtonElement | null;
  voiceOverlay: HTMLDivElement | null;
  voiceRingInner: HTMLDivElement | null;
  voiceStatusEl: HTMLDivElement | null;
  voiceCaptionEl: HTMLDivElement | null;
  voiceStopBtn: HTMLButtonElement | null;
  voiceBackBtn: HTMLButtonElement | null;
  closeBtn: HTMLButtonElement;
  newChatBtn: HTMLButtonElement;
  confirmOverlay: HTMLDivElement;
  confirmCancelBtn: HTMLButtonElement;
  confirmOkBtn: HTMLButtonElement;
  noteBanner: HTMLDivElement | null;
  userWrapper: HTMLDivElement;
  userAvatarBtn: HTMLButtonElement;
  userInitialEl: HTMLSpanElement;
  userDropdown: HTMLDivElement;
  userDropdownName: HTMLDivElement;
  userDropdownEmail: HTMLDivElement;
  userDropdownInitial: HTMLSpanElement;
  userDropdownLogoutBtn: HTMLButtonElement;
  userChip: HTMLDivElement;
  userNameEl: HTMLElement;
  userLogoutBtn: HTMLButtonElement;
  authOverlay: HTMLDivElement;
  authModalClose: HTMLButtonElement;
  authTabs: NodeListOf<HTMLButtonElement>;
  signupForm: HTMLFormElement;
  loginForm: HTMLFormElement;
  authErrorBanner: HTMLDivElement;
  signupNameInput: HTMLInputElement;
  signupEmailInput: HTMLInputElement;
  signupPasswordInput: HTMLInputElement;
  loginEmailInput: HTMLInputElement;
  loginPasswordInput: HTMLInputElement;
}

/** "5:42:07 PM" in the visitor's own locale — time of day only, no date. Empty if the value isn't a valid date. */
function formatMessageTime(at?: Date | string): string {
  const d = at === undefined ? new Date() : new Date(at);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

export class WidgetDomRenderer {
  public static injectStyles(primaryColor: string): HTMLStyleElement {
    const style = document.createElement('style');
    style.id = 'mcb-widget-style';
    const color = primaryColor || '#4f46e5';
    style.textContent = widgetCss + `\n:root, .mcb-widget-root, .minichatbot-widget { --mcb-primary: ${color} !important; }\n`;
    document.head.appendChild(style);
    return style;
  }

  public static buildElements(config: WidgetConfig): WidgetDomElements {
    const posClass = `mcb-pos-${config.position || 'bottom-right'}`;
    const bubble = document.createElement('button');
    bubble.className = `mcb-bubble ${posClass} notranslate`;
    bubble.setAttribute('translate', 'no');
    bubble.setAttribute('aria-label', config.title);
    setBubbleIcon(bubble, config.icon, config.iconSvg);

    const win = document.createElement('div');
    win.className = `mcb-window ${posClass} notranslate`;
    win.setAttribute('translate', 'no');
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-modal', 'true');
    win.setAttribute('aria-label', config.title);
    win.innerHTML = `
      <div class="mcb-header">
        <div class="mcb-header-brand" title="${escapeHtml(config.title)}">
          <div class="mcb-header-avatar">
            ${renderAvatarHtml(config.icon, config.iconSvg)}
          </div>
          <div class="mcb-header-text">
            <div class="mcb-header-title" title="${escapeHtml(config.title)}">${escapeHtml(config.title)}</div>
            ${config.description ? `<div class="mcb-header-description" title="${escapeHtml(config.description.replace(/<[^>]*>/g, ''))}">${renderHtml(config.description)}</div>` : ''}
          </div>
        </div>
        <div class="mcb-header-actions">
          <div class="mcb-user-wrapper" style="display: none;">
            <button type="button" class="mcb-user-avatar-btn" aria-label="User account" title="User account" aria-expanded="false" aria-haspopup="true">
              <span class="mcb-user-initial">U</span>
            </button>
            <div class="mcb-user-dropdown" role="menu">
              <div class="mcb-user-dropdown-header">
                <div class="mcb-user-dropdown-avatar">
                  <span class="mcb-user-dropdown-initial">U</span>
                </div>
                <div class="mcb-user-dropdown-info">
                  <div class="mcb-user-dropdown-name">User</div>
                  <div class="mcb-user-dropdown-email"></div>
                  <div class="mcb-user-dropdown-status"><span class="mcb-status-dot"></span> Logged in</div>
                </div>
              </div>
              <div class="mcb-user-dropdown-divider"></div>
              <button type="button" class="mcb-user-dropdown-logout" role="menuitem" aria-label="Log out">
                ${LOGOUT_SVG}
                <span>Log Out</span>
              </button>
            </div>
          </div>
          <button class="mcb-new-chat" aria-label="Start a new chat" title="Start a new chat">＋</button>
          <button class="mcb-close" aria-label="Close">✕</button>
        </div>
      </div>
      ${
        config.note
          ? `<div class="mcb-note-banner">
        <span>${renderHtml(config.note)}</span>
        <button class="mcb-note-close" aria-label="Dismiss">✕</button>
      </div>`
          : ''
      }
      <div class="mcb-messages" role="log" aria-live="polite" aria-atomic="false"></div>
      ${
        config.enabled
          ? `<div class="mcb-input-row">
        <div class="mcb-input-wrapper">
          <input type="text" placeholder="Enter a message…" />
          <button class="mcb-voice-type" aria-label="Voice Typing (Dictation)" title="Voice Typing (Dictation)">
            ${MIC_SVG}
          </button>
        </div>
        <div class="mcb-input-actions">
          ${
            config.voiceEnabled
              ? `<button class="mcb-voice-agent" aria-label="Voice Agent (Live voice conversation)" title="Voice Agent (Live voice conversation)">
            ${WAVEFORM_SVG}
          </button>`
              : ''
          }
          <button class="mcb-send" aria-label="Send" disabled>
            ${SEND_SVG}
          </button>
        </div>
      </div>`
          : `<div class="mcb-unavailable">${renderHtml(config.unavailableMessage)}</div>`
      }
      ${config.poweredByText ? `<div class="mcb-powered-by">${renderHtml(config.poweredByText)}</div>` : ''}
      ${
        config.voiceEnabled
          ? `<div class="mcb-voice-overlay">
        <div class="mcb-voice-visual">
          <div class="mcb-voice-ring mcb-voice-ring-outer"></div>
          <div class="mcb-voice-ring mcb-voice-ring-inner"></div>
          <div class="mcb-voice-mic-icon">
            ${MIC_LARGE_SVG}
          </div>
        </div>
        <div class="mcb-voice-status">Listening…</div>
        <div class="mcb-voice-caption"></div>
        <div class="mcb-voice-actions">
          <button class="mcb-voice-stop">Stop &amp; send</button>
          <button class="mcb-voice-back">Back to chat</button>
        </div>
      </div>`
          : ''
      }
      <div class="mcb-confirm-overlay">
        <div class="mcb-confirm-modal">
          <div class="mcb-confirm-icon">
            ${REFRESH_SVG}
          </div>
          <div class="mcb-confirm-title">Start a new chat?</div>
          <div class="mcb-confirm-body">This clears your current conversation.</div>
          <div class="mcb-confirm-actions">
            <button class="mcb-confirm-cancel">Keep chatting</button>
            <button class="mcb-confirm-ok">Start new chat</button>
          </div>
        </div>
      </div>

      <div class="mcb-auth-modal-overlay">
        <div class="mcb-auth-modal">
          <div class="mcb-auth-modal-header">
            <div class="mcb-auth-modal-title">
              <span class="mcb-auth-modal-icon">${USER_SVG}</span>
              <span class="mcb-auth-modal-heading">Welcome</span>
            </div>
            <button class="mcb-auth-modal-close" aria-label="Close">✕</button>
          </div>

          <div class="mcb-auth-tabs">
            <button type="button" class="mcb-auth-tab active" data-tab="signup">Sign Up</button>
            <button type="button" class="mcb-auth-tab" data-tab="login">Log In</button>
          </div>

          <div class="mcb-auth-error-banner" style="display: none;"></div>

          <form class="mcb-auth-form mcb-signup-form">
            <div class="mcb-form-field">
              <label>Your Name</label>
              <input type="text" class="mcb-input-signup-name" placeholder="Alex Smith" required />
            </div>
            <div class="mcb-form-field">
              <label>Email Address</label>
              <input type="email" class="mcb-input-signup-email" placeholder="you@example.com" required />
            </div>
            <div class="mcb-form-field">
              <label>Password</label>
              <input type="password" class="mcb-input-signup-password" placeholder="••••••••" required />
            </div>
            <button type="submit" class="mcb-auth-submit-btn">
              <span>Create Account</span>
            </button>
          </form>

          <form class="mcb-auth-form mcb-login-form" style="display: none;">
            <div class="mcb-form-field">
              <label>Email Address</label>
              <input type="email" class="mcb-input-login-email" placeholder="you@example.com" required />
            </div>
            <div class="mcb-form-field">
              <label>Password</label>
              <input type="password" class="mcb-input-login-password" placeholder="••••••••" required />
            </div>
            <button type="submit" class="mcb-auth-submit-btn">
              <span>Log In</span>
            </button>
          </form>
        </div>
      </div>
    `;

    const userWrapper = win.querySelector('.mcb-user-wrapper') as HTMLDivElement;
    const userAvatarBtn = win.querySelector('.mcb-user-avatar-btn') as HTMLButtonElement;
    const userInitialEl = win.querySelector('.mcb-user-initial') as HTMLSpanElement;
    const userDropdown = win.querySelector('.mcb-user-dropdown') as HTMLDivElement;
    const userDropdownName = win.querySelector('.mcb-user-dropdown-name') as HTMLDivElement;
    const userDropdownEmail = win.querySelector('.mcb-user-dropdown-email') as HTMLDivElement;
    const userDropdownInitial = win.querySelector('.mcb-user-dropdown-initial') as HTMLSpanElement;
    const userDropdownLogoutBtn = win.querySelector('.mcb-user-dropdown-logout') as HTMLButtonElement;

    return {
      bubble,
      window: win,
      headerAvatar: win.querySelector('.mcb-header-avatar') as HTMLDivElement,
      messagesEl: win.querySelector('.mcb-messages') as HTMLDivElement,
      inputEl: win.querySelector('.mcb-input-wrapper input') as HTMLInputElement | null,
      sendBtn: win.querySelector('.mcb-send') as HTMLButtonElement | null,
      voiceTypeBtn: win.querySelector('.mcb-voice-type') as HTMLButtonElement | null,
      voiceAgentBtn: win.querySelector('.mcb-voice-agent') as HTMLButtonElement | null,
      voiceOverlay: win.querySelector('.mcb-voice-overlay') as HTMLDivElement | null,
      voiceRingInner: win.querySelector('.mcb-voice-ring-inner') as HTMLDivElement | null,
      voiceStatusEl: win.querySelector('.mcb-voice-status') as HTMLDivElement | null,
      voiceCaptionEl: win.querySelector('.mcb-voice-caption') as HTMLDivElement | null,
      voiceStopBtn: win.querySelector('.mcb-voice-stop') as HTMLButtonElement | null,
      voiceBackBtn: win.querySelector('.mcb-voice-back') as HTMLButtonElement | null,
      closeBtn: win.querySelector('.mcb-close') as HTMLButtonElement,
      newChatBtn: win.querySelector('.mcb-new-chat') as HTMLButtonElement,
      confirmOverlay: win.querySelector('.mcb-confirm-overlay') as HTMLDivElement,
      confirmCancelBtn: win.querySelector('.mcb-confirm-cancel') as HTMLButtonElement,
      confirmOkBtn: win.querySelector('.mcb-confirm-ok') as HTMLButtonElement,
      noteBanner: win.querySelector('.mcb-note-banner') as HTMLDivElement | null,
      userWrapper,
      userAvatarBtn,
      userInitialEl,
      userDropdown,
      userDropdownName,
      userDropdownEmail,
      userDropdownInitial,
      userDropdownLogoutBtn,
      userChip: userWrapper,
      userNameEl: userDropdownName,
      userLogoutBtn: userDropdownLogoutBtn,
      authOverlay: win.querySelector('.mcb-auth-modal-overlay') as HTMLDivElement,
      authModalClose: win.querySelector('.mcb-auth-modal-close') as HTMLButtonElement,
      authTabs: win.querySelectorAll('.mcb-auth-tab') as NodeListOf<HTMLButtonElement>,
      signupForm: win.querySelector('.mcb-signup-form') as HTMLFormElement,
      loginForm: win.querySelector('.mcb-login-form') as HTMLFormElement,
      authErrorBanner: win.querySelector('.mcb-auth-error-banner') as HTMLDivElement,
      signupNameInput: win.querySelector('.mcb-input-signup-name') as HTMLInputElement,
      signupEmailInput: win.querySelector('.mcb-input-signup-email') as HTMLInputElement,
      signupPasswordInput: win.querySelector('.mcb-input-signup-password') as HTMLInputElement,
      loginEmailInput: win.querySelector('.mcb-input-login-email') as HTMLInputElement,
      loginPasswordInput: win.querySelector('.mcb-input-login-password') as HTMLInputElement,
    };
  }

  public static addMessage(
    container: HTMLDivElement,
    text: string,
    role: 'user' | 'bot',
    icon?: string,
    iconSvg?: string,
    source?: string | null,
    /** When the message was sent/received; defaults to now. Only the time of day is shown. */
    at?: Date | string,
  ): HTMLDivElement {
    const row = document.createElement('div');
    row.className = `mcb-row ${role}`;
    if (role === 'bot') {
      const avatar = document.createElement('div');
      avatar.className = 'mcb-avatar';
      avatar.innerHTML = renderAvatarHtml(icon, iconSvg);
      row.appendChild(avatar);
    }
    const el = document.createElement('div');
    const sourceClass = role === 'bot' && source ? ` source-${source}` : (role === 'bot' ? ' source-llm' : '');
    el.className = `mcb-msg ${role}${sourceClass}`;

    if (role === 'bot') {
      const sourceKey = source || 'llm';
      el.setAttribute('data-source', sourceKey);

      const tooltips: Record<string, string> = {
        llm: 'LLM Response',
        cache: 'Cached Response',
        'chunk-fallback': 'Fallback — Related Content',
        faq: 'Knowledge Base Response',
        'no-match': 'No direct match found',
      };
      const tooltip = tooltips[sourceKey] || 'AI Assistant Response';
      el.setAttribute('title', tooltip);
      el.innerHTML = formatChatMarkdown(text);
    } else {
      el.textContent = text;
    }

    const stamp = formatMessageTime(at);
    if (stamp) {
      const time = document.createElement('span');
      time.className = 'mcb-time';
      time.textContent = stamp;
      el.appendChild(time);
    }

    row.appendChild(el);
    container.appendChild(row);
    container.scrollTop = container.scrollHeight;
    return el;
  }

  public static addErrorMessage(container: HTMLDivElement, text: string, onRetry?: () => void): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'mcb-row bot';
    const avatar = document.createElement('div');
    avatar.className = 'mcb-avatar mcb-avatar-error';
    avatar.innerHTML = ALERT_SVG;
    row.appendChild(avatar);
    const el = document.createElement('div');
    el.className = 'mcb-msg error';
    const textEl = document.createElement('div');
    textEl.className = 'mcb-error-text';
    textEl.textContent = text;
    el.appendChild(textEl);
    if (onRetry) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mcb-error-retry';
      btn.textContent = '↻ Try again';
      btn.addEventListener('click', () => {
        btn.remove();
        onRetry();
      });
      el.appendChild(btn);
    }
    row.appendChild(el);
    container.appendChild(row);
    container.scrollTop = container.scrollHeight;
    return el;
  }

  public static addStoppedMessage(
    container: HTMLDivElement,
    label = 'Response stopped by user',
    icon?: string,
    iconSvg?: string,
  ): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'mcb-row bot stopped';
    const avatar = document.createElement('div');
    avatar.className = 'mcb-avatar';
    avatar.innerHTML = renderAvatarHtml(icon, iconSvg);
    row.appendChild(avatar);

    const el = document.createElement('div');
    el.className = 'mcb-msg bot stopped';
    el.innerHTML = `<span class="mcb-stopped-icon">⏹</span> <span>${escapeHtml(label)}</span>`;
    row.appendChild(el);

    container.appendChild(row);
    container.scrollTop = container.scrollHeight;
    return el;
  }

  public static addAuthGatePrompt(
    container: HTMLDivElement,
    options: {
      title?: string;
      message?: string;
      signupUrl?: string;
      loginUrl?: string;
      allowPublicSignup?: boolean;
      icon?: string;
      iconSvg?: string;
    } = {},
  ): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'mcb-row bot mcb-auth-row';
    const avatar = document.createElement('div');
    avatar.className = 'mcb-avatar';
    avatar.innerHTML = renderAvatarHtml(options.icon, options.iconSvg);
    row.appendChild(avatar);

    const card = document.createElement('div');
    card.className = 'mcb-msg bot mcb-auth-card';

    const allowPublicSignup = options.allowPublicSignup !== false;
    const defaultTitle = allowPublicSignup ? 'Sign up or Log in to continue' : 'Log in to continue';
    const defaultMessage = allowPublicSignup
      ? 'Please create an account or sign in to ask questions and receive instant AI answers.'
      : 'Please log in with your assigned account to chat with our AI assistant.';

    const title = options.title || defaultTitle;
    const message = options.message || defaultMessage;

    const actionsHtml = allowPublicSignup
      ? `<button type="button" class="mcb-auth-btn mcb-auth-signup" data-auth-action="signup">Sign Up</button>
         <button type="button" class="mcb-auth-btn mcb-auth-login" data-auth-action="login">Log In</button>`
      : `<button type="button" class="mcb-auth-btn mcb-auth-login" style="width: 100%;" data-auth-action="login">Log In to Chat</button>`;

    card.innerHTML = `
      <div class="mcb-auth-card-header">
        <span class="mcb-auth-card-badge">${LOCK_SVG}</span>
        <div class="mcb-auth-card-title">${escapeHtml(title)}</div>
      </div>
      <div class="mcb-auth-card-msg">${renderHtml(message)}</div>
      <div class="mcb-auth-card-actions">
        ${actionsHtml}
      </div>
    `;

    row.appendChild(card);
    container.appendChild(row);
    container.scrollTop = container.scrollHeight;
    return card;
  }

  public static createTypingRow(
    label = 'Typing…',
    icon?: string,
    iconSvg?: string,
  ): { row: HTMLDivElement; remove: () => void } {
    const row = document.createElement('div');
    row.className = 'mcb-row bot';
    const avatar = document.createElement('div');
    avatar.className = 'mcb-avatar';
    avatar.innerHTML = renderAvatarHtml(icon, iconSvg);
    const typingEl = document.createElement('div');
    typingEl.className = 'mcb-msg bot typing';
    typingEl.setAttribute('aria-label', label);
    typingEl.innerHTML = '<span class="mcb-typing-dot"></span><span class="mcb-typing-dot"></span><span class="mcb-typing-dot"></span>';
    row.appendChild(avatar);
    row.appendChild(typingEl);
    return {
      row,
      remove: () => row.remove(),
    };
  }

  public static renderQuickReplies(
    container: HTMLDivElement,
    replies: { label: string; message: string }[],
    onSelect: (message: string) => void,
  ): HTMLDivElement | null {
    if (!replies || replies.length === 0) return null;
    const wrap = document.createElement('div');
    wrap.className = 'mcb-quick-replies';
    for (const reply of replies) {
      const chip = document.createElement('button');
      chip.className = 'mcb-quick-reply';
      chip.type = 'button';
      chip.textContent = reply.label;
      chip.addEventListener('click', () => {
        wrap.remove();
        onSelect(reply.message);
      });
      wrap.appendChild(chip);
    }
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
    return wrap;
  }
}
