import type { WidgetConfig, WidgetInitOptions } from '../types/widget.types';
import type { WidgetApiService } from '../services/widgetApi';
import type { WidgetStorageService } from '../services/widgetStorage';
import { WidgetDomRenderer, type WidgetDomElements } from '../ui/widgetDom';

/** What the sign-in feature needs from the widget — nothing more, so it can be understood and changed on its own. */
export interface VisitorAuthHost {
  getConfig(): WidgetConfig;
  elements: WidgetDomElements;
  /** The script-tag options; signing in or out updates `authToken` / `userId` on it so later requests carry them. */
  options: WidgetInitOptions;
  apiService: WidgetApiService;
  storageService: WidgetStorageService;
}

/**
 * Visitor sign-up, login and logout: the pop-up form, the avatar menu, restoring a saved session, and the
 * "please sign in" buttons that appear inside the chat. The chat itself only asks `isAuthenticated`.
 */
export class VisitorAuth {
  constructor(private readonly host: VisitorAuthHost) {}

  private get config(): WidgetConfig {
    return this.host.getConfig();
  }
  private get elements(): WidgetDomElements {
    return this.host.elements;
  }
  private get options(): WidgetInitOptions {
    return this.host.options;
  }
  private get apiService(): WidgetApiService {
    return this.host.apiService;
  }
  private get storageService(): WidgetStorageService {
    return this.host.storageService;
  }

  private visitorUser: { id: string; name: string; email: string } | null = null;

  public setup(): void {
    // Rehydrate saved visitor session
    const savedToken = this.storageService.getVisitorToken();
    const savedUser = this.storageService.getVisitorUser();
    if (savedToken && savedUser) {
      this.options.authToken = savedToken;
      this.options.userId = savedUser.id;
      this.updateVisitorUserState(savedUser);
    }

    // If public signup is disabled, hide the signup tab button
    if (this.config.allowPublicSignup === false) {
      const signupTab = this.elements.authOverlay.querySelector('[data-tab="signup"]') as HTMLElement | null;
      if (signupTab) signupTab.style.display = 'none';
    }

    // Modal tabs switching
    this.elements.authTabs.forEach((tabBtn) => {
      tabBtn.addEventListener('click', () => {
        const tab = tabBtn.getAttribute('data-tab') as 'signup' | 'login';
        this.switchAuthTab(tab);
      });
    });

    // Close buttons
    this.elements.authModalClose.addEventListener('click', () => this.closeAuthModal());
    this.elements.authOverlay.addEventListener('click', (e) => {
      if (e.target === this.elements.authOverlay) this.closeAuthModal();
    });

    // Form handlers
    this.elements.signupForm.addEventListener('submit', (e) => void this.handleVisitorSignup(e));
    this.elements.loginForm.addEventListener('submit', (e) => void this.handleVisitorLogin(e));

    // User avatar dropdown toggle
    this.elements.userAvatarBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = this.elements.userDropdown.classList.contains('open');
      if (isOpen) {
        this.closeUserDropdown();
      } else {
        this.openUserDropdown();
      }
    });

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (!this.elements.userWrapper.contains(e.target as Node)) {
        this.closeUserDropdown();
      }
    });

    // Logout
    this.elements.userDropdownLogoutBtn.addEventListener('click', () => {
      this.closeUserDropdown();
      this.handleVisitorLogout();
    });

    // Delegated click on auth prompt buttons inside chat
    this.elements.messagesEl.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-auth-action]') as HTMLElement | null;
      if (!btn) return;
      e.preventDefault();
      const action = btn.getAttribute('data-auth-action') as 'signup' | 'login';
      this.openAuthModal(action || 'signup');
    });
  }

  private openUserDropdown(): void {
    this.elements.userDropdown.classList.add('open');
    this.elements.userAvatarBtn.setAttribute('aria-expanded', 'true');
    this.elements.userAvatarBtn.classList.add('active');
  }

  private closeUserDropdown(): void {
    this.elements.userDropdown.classList.remove('open');
    this.elements.userAvatarBtn.setAttribute('aria-expanded', 'false');
    this.elements.userAvatarBtn.classList.remove('active');
  }

  public openAuthModal(tab: 'signup' | 'login' = 'signup'): void {
    const effectiveTab = this.config.allowPublicSignup === false ? 'login' : tab;
    this.switchAuthTab(effectiveTab);
    this.clearAuthError();
    this.elements.authOverlay.classList.add('open');
    if (effectiveTab === 'signup') {
      this.elements.signupNameInput.focus();
    } else {
      this.elements.loginEmailInput.focus();
    }
  }

  public closeAuthModal(): void {
    this.elements.authOverlay.classList.remove('open');
    this.clearAuthError();
    this.elements.inputEl?.focus();
  }

  private switchAuthTab(tab: 'signup' | 'login'): void {
    this.clearAuthError();
    this.elements.authTabs.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
    });
    if (tab === 'signup') {
      this.elements.signupForm.style.display = 'flex';
      this.elements.loginForm.style.display = 'none';
      const heading = this.elements.authOverlay.querySelector('.mcb-auth-modal-heading');
      if (heading) heading.textContent = 'Create Account';
    } else {
      this.elements.signupForm.style.display = 'none';
      this.elements.loginForm.style.display = 'flex';
      const heading = this.elements.authOverlay.querySelector('.mcb-auth-modal-heading');
      if (heading) heading.textContent = 'Welcome Back';
    }
  }

  private showAuthError(message: string): void {
    this.elements.authErrorBanner.textContent = message;
    this.elements.authErrorBanner.style.display = 'block';
  }

  private clearAuthError(): void {
    this.elements.authErrorBanner.textContent = '';
    this.elements.authErrorBanner.style.display = 'none';
  }

  private async handleVisitorSignup(e: Event): Promise<void> {
    e.preventDefault();
    const name = this.elements.signupNameInput.value.trim();
    const email = this.elements.signupEmailInput.value.trim();
    const password = this.elements.signupPasswordInput.value;

    if (!email || !password) {
      this.showAuthError('Please fill in all required fields.');
      return;
    }

    const submitBtn = this.elements.signupForm.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    if (submitBtn) submitBtn.disabled = true;

    try {
      const data = await this.apiService.visitorSignup(name, email, password);
      this.storageService.setVisitorToken(data.token);
      this.storageService.setVisitorUser(data.user);
      this.options.authToken = data.token;
      this.options.userId = data.user.id;
      this.updateVisitorUserState(data.user);
      this.closeAuthModal();

      WidgetDomRenderer.addMessage(
        this.elements.messagesEl,
        `Welcome **${data.user.name || 'friend'}**! Your account has been created. You can now chat with our AI without interruption.`,
        'bot',
        this.config.icon,
        this.config.iconSvg,
      );
    } catch (err: any) {
      this.showAuthError(err.message || 'Registration failed. Please try again.');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  private async handleVisitorLogin(e: Event): Promise<void> {
    e.preventDefault();
    const email = this.elements.loginEmailInput.value.trim();
    const password = this.elements.loginPasswordInput.value;

    if (!email || !password) {
      this.showAuthError('Please enter your email and password.');
      return;
    }

    const submitBtn = this.elements.loginForm.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    if (submitBtn) submitBtn.disabled = true;

    try {
      const data = await this.apiService.visitorLogin(email, password);
      this.storageService.setVisitorToken(data.token);
      this.storageService.setVisitorUser(data.user);
      this.options.authToken = data.token;
      this.options.userId = data.user.id;
      this.updateVisitorUserState(data.user);
      this.closeAuthModal();

      WidgetDomRenderer.addMessage(
        this.elements.messagesEl,
        `Welcome back **${data.user.name || data.user.email}**! You are logged in.`,
        'bot',
        this.config.icon,
        this.config.iconSvg,
      );
    } catch (err: any) {
      this.showAuthError(err.message || 'Invalid email or password.');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  private handleVisitorLogout(): void {
    this.storageService.clearVisitorToken();
    this.options.authToken = undefined;
    this.options.userId = undefined;
    this.updateVisitorUserState(null);
    WidgetDomRenderer.addMessage(
      this.elements.messagesEl,
      'You have been logged out.',
      'bot',
      this.config.icon,
      this.config.iconSvg,
    );
  }

  /** True when the visitor is signed in (a saved session, or credentials supplied through the script tag). */
  public get isAuthenticated(): boolean {
    return Boolean(this.visitorUser || this.options.authToken || this.options.userId);
  }

  private updateVisitorUserState(user: { id: string; name: string; email: string } | null): void {
    this.visitorUser = user;
    if (user) {
      this.elements.userWrapper.style.display = 'inline-flex';
      const displayName = user.name?.trim() || user.email?.trim() || 'User';
      const initial = (displayName.charAt(0) || 'U').toUpperCase();
      this.elements.userInitialEl.textContent = initial;
      this.elements.userDropdownInitial.textContent = initial;
      this.elements.userDropdownName.textContent = displayName;
      this.elements.userDropdownEmail.textContent = user.email || '';
      this.elements.userAvatarBtn.title = user.name ? `${user.name} (${user.email})` : user.email;
      this.elements.messagesEl.querySelectorAll('.mcb-auth-row').forEach((el) => el.remove());
    } else {
      this.elements.userWrapper.style.display = 'none';
      this.closeUserDropdown();
      this.elements.userInitialEl.textContent = 'U';
      this.elements.userDropdownInitial.textContent = 'U';
      this.elements.userDropdownName.textContent = '';
      this.elements.userDropdownEmail.textContent = '';
      this.elements.userAvatarBtn.removeAttribute('title');
    }
  }
}
