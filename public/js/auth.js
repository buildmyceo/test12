/**
 * L'AURA RESTAURANT - Supabase Email Authentication System
 * Supports:
 *  - Passwordless Email Magic Link / 6-Digit OTP Code
 *  - Email & Password Sign In
 *  - Account Registration with Email Verification
 *  - Password Recovery & Reset Flow
 *  - Persistent Session Management & Navbar User Menu
 */

const SUPABASE_CONFIG = {
  url: 'https://tzgpxjblmtyosrgjobju.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6Z3B4amJsbXR5b3NyZ2pvYmp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5MDgwMTksImV4cCI6MjEwNzQ4NDAxOX0.tmLj6o_SLCLm9uLSMCI9-Gflu8kULn8VCFejPlDLUqE'
};

// Global Auth Manager
class SupabaseAuthManager {
  constructor() {
    this.client = null;
    this.currentUser = null;
    this.currentSession = null;
    this.otpPendingEmail = '';
    this.resendTimer = null;
    this.resendSecondsLeft = 0;
    this.initPromise = this.init();
  }

  async init() {
    // Ensure supabase library is ready
    if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
      console.warn('Supabase JS library not yet loaded. Retrying...');
      await this.loadSupabaseScript();
    }

    // Fetch dynamic configuration from backend (supports Vercel secret ANON_KEY)
    try {
      const configRes = await fetch('/api/config');
      if (configRes.ok) {
        const remoteCfg = await configRes.json();
        if (remoteCfg.supabaseUrl) SUPABASE_CONFIG.url = remoteCfg.supabaseUrl;
        if (remoteCfg.anonKey) SUPABASE_CONFIG.anonKey = remoteCfg.anonKey;
      }
    } catch (cfgErr) {
      console.warn('Backend config fetch bypassed; utilizing fallback defaults:', cfgErr.message);
    }

    try {
      this.client = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });
    } catch (err) {
      console.error('Failed to initialize Supabase client:', err);
      return;
    }

    // Check existing session
    try {
      const { data: { session }, error } = await this.client.auth.getSession();
      if (!error && session) {
        this.currentSession = session;
        this.currentUser = session.user;
        this.unlockGate();
      } else {
        const hasUrlAuth = window.location.hash.includes('access_token=') || window.location.search.includes('code=');
        if (!hasUrlAuth) {
          this.lockGate();
        }
      }
    } catch (err) {
      console.warn('Could not retrieve active Supabase session:', err);
      this.lockGate();
    }

    // Listen to Auth State Changes
    this.client.auth.onAuthStateChange((event, session) => {
      console.log('Supabase Auth Event:', event, session?.user?.email);
      this.currentSession = session;
      this.currentUser = session ? session.user : null;
      this.updateNavbarUI();
      this.syncPageFields();

      if (event === 'SIGNED_IN') {
        this.unlockGate();
        if (typeof showToast === 'function') {
          const name = this.getUserDisplayName();
          showToast(`Welcome back, ${name}! Access granted.`, 'success');
        }
        this.closeModal();
      } else if (event === 'SIGNED_OUT') {
        this.lockGate();
        if (typeof showToast === 'function') {
          showToast('You have been signed out.', 'info');
        }
        this.closeModal();
      } else if (event === 'PASSWORD_RECOVERY') {
        this.openModal('recovery');
        if (typeof showToast === 'function') {
          showToast('Please enter your new password.', 'info');
        }
      }
    });

    // Handle hash fragments (e.g. recovery or confirmation)
    if (window.location.hash.includes('type=recovery')) {
      setTimeout(() => this.openModal('recovery'), 300);
    }

    // Inject Auth UI and Modal into DOM
    const setupDOM = () => {
      this.injectSiteGate();
      this.injectModalHTML();
      this.injectNavbarButtons();
      this.updateNavbarUI();
      this.syncPageFields();

      if (this.currentUser) {
        this.unlockGate();
      } else {
        const hasUrlAuth = window.location.hash.includes('access_token=') || window.location.search.includes('code=');
        if (!hasUrlAuth) {
          this.lockGate();
        }
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setupDOM);
    } else {
      setupDOM();
    }
  }

  loadSupabaseScript() {
    return new Promise((resolve) => {
      if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
        return resolve();
      }
      const existing = document.getElementById('supabase-js-cdn');
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => resolve());
        return;
      }
      const script = document.createElement('script');
      script.id = 'supabase-js-cdn';
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      script.onload = () => resolve();
      script.onerror = () => {
        console.error('Failed to load Supabase from CDN.');
        resolve();
      };
      document.head.appendChild(script);
    });
  }

  // --- AUTH METHODS ---

  /**
   * Send Passwordless Magic Link / 6-digit OTP code to email
   */
  async sendMagicLink(email) {
    if (!this.client) throw new Error('Supabase client not initialized');
    const cleanEmail = email.trim().toLowerCase();

    const { data, error } = await this.client.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        emailRedirectTo: window.location.origin
      }
    });

    if (error) throw error;
    this.otpPendingEmail = cleanEmail;
    return data;
  }

  /**
   * Verify the 6-digit OTP code sent to user email
   */
  async verifyOtpCode(email, token) {
    if (!this.client) throw new Error('Supabase client not initialized');
    const cleanEmail = (email || this.otpPendingEmail).trim().toLowerCase();
    const cleanToken = token.trim();

    const { data, error } = await this.client.auth.verifyOtp({
      email: cleanEmail,
      token: cleanToken,
      type: 'email'
    });

    if (error) throw error;
    return data;
  }

  /**
   * Sign in with Google OAuth
   */
  async signInWithGoogle() {
    if (!this.client) throw new Error('Supabase client not initialized');
    const { data, error } = await this.client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.href.split('#')[0]
      }
    });

    if (error) throw error;
    return data;
  }

  /**
   * Sign in with traditional Email and Password
   */
  async signInWithPassword(email, password) {
    if (!this.client) throw new Error('Supabase client not initialized');
    const { data, error } = await this.client.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password
    });

    if (error) throw error;
    return data;
  }

  /**
   * Create new account with Email and Password
   */
  async signUp(email, password, fullName = '') {
    if (!this.client) throw new Error('Supabase client not initialized');
    const cleanEmail = email.trim().toLowerCase();

    const { data, error } = await this.client.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          full_name: fullName.trim()
        },
        emailRedirectTo: window.location.origin
      }
    });

    if (error) throw error;
    return data;
  }

  /**
   * Send Password Recovery link to user email
   */
  async resetPasswordForEmail(email) {
    if (!this.client) throw new Error('Supabase client not initialized');
    const cleanEmail = email.trim().toLowerCase();

    const { data, error } = await this.client.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: window.location.origin + '/login#type=recovery'
    });

    if (error) throw error;
    return data;
  }

  /**
   * Update password for authenticated or recovery session
   */
  async updatePassword(newPassword) {
    if (!this.client) throw new Error('Supabase client not initialized');
    const { data, error } = await this.client.auth.updateUser({
      password: newPassword
    });

    if (error) throw error;
    return data;
  }

  /**
   * Sign out current user
   */
  async signOut() {
    if (!this.client) return;
    try {
      await this.client.auth.signOut();
    } catch (err) {
      console.warn('Sign out warning:', err);
    }
    this.currentUser = null;
    this.currentSession = null;
    this.updateNavbarUI();
    this.lockGate();
  }

  // --- HELPERS ---

  getUserAvatarUrl() {
    if (!this.currentUser) return null;
    return this.currentUser.user_metadata?.avatar_url || this.currentUser.user_metadata?.picture || null;
  }

  getUserDisplayName() {
    if (!this.currentUser) return 'Guest';
    if (this.currentUser.user_metadata?.full_name) {
      return this.currentUser.user_metadata.full_name;
    }
    if (this.currentUser.user_metadata?.name) {
      return this.currentUser.user_metadata.name;
    }
    if (this.currentUser.email) {
      return this.currentUser.email.split('@')[0];
    }
    return 'Guest';
  }

  getUserInitials() {
    const name = this.getUserDisplayName();
    if (!name) return 'L';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  // --- MANDATORY ACCESS GATE (Google/Gmail Lock) ---

  lockGate() {
    document.documentElement.classList.add('gate-locked');
    if (document.body) {
      document.body.classList.add('gate-locked');
    }
    const gate = document.getElementById('siteAuthGate');
    if (gate) {
      gate.classList.remove('gate-unlocked');
    }
  }

  unlockGate() {
    document.documentElement.classList.remove('gate-locked');
    if (document.body) {
      document.body.classList.remove('gate-locked');
    }
    const gate = document.getElementById('siteAuthGate');
    if (gate) {
      gate.classList.add('gate-unlocked');
    }
  }

  injectSiteGate() {
    if (document.getElementById('siteAuthGate')) {
      this.bindGateEvents();
      return;
    }

    const gate = document.createElement('div');
    gate.id = 'siteAuthGate';
    gate.className = 'site-auth-gate';
    gate.setAttribute('aria-modal', 'true');
    gate.setAttribute('role', 'dialog');
    gate.setAttribute('aria-label', 'Private Dining Member Access');

    gate.innerHTML = `
      <div class="gate-card">
        <div class="gate-monogram">L</div>
        <div class="gate-brand-title">L'AURA</div>
        <div class="gate-brand-sub">Brasserie &amp; Botanicals • San Francisco</div>

        <div class="gate-badge-row">
          <span class="gate-badge">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            Private Guest Verification
          </span>
        </div>

        <h2 class="gate-heading">Sign In with Google to Enter</h2>
        <p class="gate-desc">
          Welcome to L'AURA. Our dining menus, cellar reserve, and table reservations are reserved for verified guests. Please sign in with your Google / Gmail account to enter the website.
        </p>

        <!-- Alert Box -->
        <div class="auth-alert" id="gateAlertBox" style="display: none;"></div>

        <!-- Google 1-Click Sign-In Button -->
        <button type="button" class="gate-google-btn" id="gateGoogleLoginBtn">
          <svg class="google-icon" width="20" height="20" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          <span>Continue with Google (Gmail)</span>
        </button>

        <div class="auth-divider">
          <span>or sign in with email</span>
        </div>

        <button type="button" class="gate-toggle-email-btn" id="gateToggleEmailBtn">
          Need to sign in with email OTP instead? Click here
        </button>

        <div class="gate-email-box" id="gateEmailBox" style="display: none;">
          <form id="gateEmailForm">
            <div class="form-group" style="margin-bottom: 0.75rem;">
              <label class="form-label" for="gateEmailInput" style="font-size: 0.8rem;">Enter your Gmail or Email</label>
              <input type="email" id="gateEmailInput" class="form-control" placeholder="name@gmail.com" required autocomplete="email">
            </div>
            <button type="submit" class="btn btn-primary btn-sm" id="gateEmailSubmitBtn" style="width: 100%; justify-content: center;">
              Send Sign-In Code
            </button>
          </form>
        </div>

        <div class="gate-footer-security">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
          <span>Secured by Google OAuth &amp; Supabase</span>
        </div>
      </div>
    `;

    document.body.prepend(gate);
    this.bindGateEvents();
  }

  bindGateEvents() {
    const googleBtn = document.getElementById('gateGoogleLoginBtn');
    const alertBox = document.getElementById('gateAlertBox');
    const toggleEmailBtn = document.getElementById('gateToggleEmailBtn');
    const emailBox = document.getElementById('gateEmailBox');
    const emailForm = document.getElementById('gateEmailForm');

    if (toggleEmailBtn && emailBox) {
      toggleEmailBtn.addEventListener('click', () => {
        const isHidden = emailBox.style.display === 'none';
        emailBox.style.display = isHidden ? 'block' : 'none';
        toggleEmailBtn.textContent = isHidden ? 'Hide email sign-in' : 'Need to sign in with email OTP instead? Click here';
      });
    }

    if (googleBtn) {
      googleBtn.addEventListener('click', async () => {
        this.setButtonLoading(googleBtn, true, 'Connecting to Google...');
        if (alertBox) alertBox.style.display = 'none';
        try {
          await this.signInWithGoogle();
        } catch (err) {
          console.error('Gate Google login error:', err);
          let msg = err.message || 'Failed to initialize Google login.';
          if (msg.includes('provider is not enabled') || msg.includes('Unsupported provider')) {
            msg = 'Google login is not enabled in your Supabase dashboard.';
          }
          if (alertBox) {
            alertBox.textContent = msg;
            alertBox.className = 'auth-alert error';
            alertBox.style.display = 'block';
          }
          this.setButtonLoading(googleBtn, false, 'Continue with Google (Gmail)');
        }
      });
    }

    if (emailForm) {
      emailForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const emailInput = document.getElementById('gateEmailInput');
        const submitBtn = document.getElementById('gateEmailSubmitBtn');
        const email = emailInput?.value?.trim();
        if (!email) return;

        this.setButtonLoading(submitBtn, true, 'Sending...');
        if (alertBox) alertBox.style.display = 'none';
        try {
          await this.sendOtp(email);
          this.openModal('otp');
          if (alertBox) {
            alertBox.textContent = '6-digit code sent to ' + email + '. Complete verification to unlock access.';
            alertBox.className = 'auth-alert success';
            alertBox.style.display = 'block';
          }
        } catch (err) {
          if (alertBox) {
            alertBox.textContent = err.message || 'Failed to send code.';
            alertBox.className = 'auth-alert error';
            alertBox.style.display = 'block';
          }
        } finally {
          this.setButtonLoading(submitBtn, false, 'Send Sign-In Code');
        }
      });
    }
  }

  // --- DOM INJECTION & UI LOGIC ---

  injectNavbarButtons() {
    // 1. Desktop Header: Place auth element right next to "Reserve a Table" button
    const headerActions = document.querySelector('.header-actions');
    if (headerActions && !document.getElementById('authNavSlot')) {
      const authSlot = document.createElement('div');
      authSlot.id = 'authNavSlot';
      authSlot.className = 'auth-nav-slot';

      // Insert right before the "Reserve a Table" anchor or button
      const reserveBtn = headerActions.querySelector('a[href="/reservations"]');
      if (reserveBtn) {
        headerActions.insertBefore(authSlot, reserveBtn);
      } else {
        headerActions.appendChild(authSlot);
      }
    }

    // 2. Mobile Nav Links: Add mobile auth item if not already present
    const navLinks = document.getElementById('navLinks');
    if (navLinks && !document.getElementById('mobileAuthItem')) {
      const mobileItem = document.createElement('div');
      mobileItem.id = 'mobileAuthItem';
      mobileItem.className = 'mobile-auth-wrapper';
      navLinks.appendChild(mobileItem);
    }
  }

  updateNavbarUI() {
    const authSlot = document.getElementById('authNavSlot');
    const mobileAuthItem = document.getElementById('mobileAuthItem');

    if (this.currentUser) {
      const name = this.getUserDisplayName();
      const email = this.currentUser.email || '';
      const initials = this.getUserInitials();
      const avatarUrl = this.getUserAvatarUrl();

      const avatarMarkup = avatarUrl
        ? `<img src="${avatarUrl}" class="user-avatar-img" alt="${name}">`
        : `<span class="user-avatar-badge">${initials}</span>`;

      const popoverAvatarMarkup = avatarUrl
        ? `<div class="user-popover-initials" style="padding: 0; overflow: hidden;"><img src="${avatarUrl}" alt="${name}"></div>`
        : `<div class="user-popover-initials">${initials}</div>`;

      // Desktop Signed-in UI
      if (authSlot) {
        authSlot.innerHTML = `
          <div class="user-menu-wrapper" id="userMenuDropdownWrapper">
            <button class="user-pill-btn" id="userDropdownTrigger" aria-label="Account Menu" aria-expanded="false">
              ${avatarMarkup}
              <span class="user-name-label">${name}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="dropdown-chevron"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </button>
            <div class="user-dropdown-popover" id="userDropdownPopover">
              <div class="user-popover-header">
                ${popoverAvatarMarkup}
                <div class="user-popover-meta">
                  <span class="user-popover-name">${name}</span>
                  <span class="user-popover-email">${email}</span>
                </div>
              </div>
              <div class="user-popover-badge-row">
                <span class="badge badge-sage">Verified Guest Account</span>
              </div>
              <div class="user-popover-divider"></div>
              <div class="user-popover-actions">
                <a href="/reservations" class="user-popover-item">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="18" y2="10"></line></svg>
                  <span>My Reservations</span>
                </a>
                <a href="/menu" class="user-popover-item">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8h1a4 4 0 0 1 0 8h-1"></path><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path><line x1="6" y1="1" x2="6" y2="4"></line><line x1="10" y1="1" x2="10" y2="4"></line><line x1="14" y1="1" x2="14" y2="4"></line></svg>
                  <span>Curated Tasting Menu</span>
                </a>
                <button type="button" class="user-popover-item signout-btn" id="authSignOutBtn">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        `;

        // Toggle Dropdown
        const trigger = document.getElementById('userDropdownTrigger');
        const popover = document.getElementById('userDropdownPopover');
        if (trigger && popover) {
          trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = popover.classList.toggle('open');
            trigger.setAttribute('aria-expanded', isOpen);
          });
        }

        const signOutBtn = document.getElementById('authSignOutBtn');
        if (signOutBtn) {
          signOutBtn.addEventListener('click', () => this.signOut());
        }
      }

      // Mobile Signed-in UI
      if (mobileAuthItem) {
        mobileAuthItem.innerHTML = `
          <div class="mobile-user-card">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              ${avatarUrl ? `<img src="${avatarUrl}" class="user-avatar-img" alt="${name}" style="width: 36px; height: 36px;">` : `<span class="user-avatar-badge">${initials}</span>`}
              <div>
                <strong style="display: block; font-size: 0.95rem;">${name}</strong>
                <span style="font-size: 0.8rem; color: var(--text-muted);">${email}</span>
              </div>
            </div>
            <button class="btn btn-outline btn-sm" id="mobileSignOutBtn" style="margin-top: 0.75rem; width: 100%;">Sign Out</button>
          </div>
        `;
        const mobileSignOut = document.getElementById('mobileSignOutBtn');
        if (mobileSignOut) {
          mobileSignOut.addEventListener('click', () => this.signOut());
        }
      }
    } else {
      // Desktop Signed-out UI
      if (authSlot) {
        authSlot.innerHTML = `
          <button class="btn btn-outline btn-sm auth-signin-nav-btn" id="navSignInBtn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            <span>Sign In</span>
          </button>
        `;
        const signInBtn = document.getElementById('navSignInBtn');
        if (signInBtn) {
          signInBtn.addEventListener('click', () => this.openModal('otp'));
        }
      }

      // Mobile Signed-out UI
      if (mobileAuthItem) {
        mobileAuthItem.innerHTML = `
          <div style="padding: 1rem 0; border-top: 1px solid var(--border-light); margin-top: 0.5rem;">
            <button class="btn btn-outline btn-sm" id="mobileNavSignInBtn" style="width: 100%; justify-content: center;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              <span>Sign In / Register</span>
            </button>
          </div>
        `;
        const mobileSignIn = document.getElementById('mobileNavSignInBtn');
        if (mobileSignIn) {
          mobileSignIn.addEventListener('click', () => this.openModal('otp'));
        }
      }
    }
  }

  // Pre-fill fields on reservation/contact pages
  syncPageFields() {
    if (!this.currentUser) return;
    const name = this.getUserDisplayName();
    const email = this.currentUser.email || '';

    const resName = document.getElementById('resName');
    const resEmail = document.getElementById('resEmail');
    if (resName && !resName.value) resName.value = name;
    if (resEmail && !resEmail.value) resEmail.value = email;

    const contactName = document.getElementById('contactName');
    const contactEmail = document.getElementById('contactEmail');
    if (contactName && !contactName.value) contactName.value = name;
    if (contactEmail && !contactEmail.value) contactEmail.value = email;

    // Check if on reservation page: highlight user's reservations
    const lookupInput = document.getElementById('lookupCodeInput');
    const lookupEmailHint = document.getElementById('lookupUserEmailHint');
    if (lookupEmailHint) {
      lookupEmailHint.textContent = `Logged in as ${email}`;
      lookupEmailHint.style.display = 'block';
    }
  }

  // Injects the complete Auth Modal into document.body
  injectModalHTML() {
    if (document.getElementById('supabaseAuthModal')) return;

    const modalMarkup = `
      <div class="auth-modal-overlay" id="supabaseAuthModal" role="dialog" aria-modal="true" aria-labelledby="authModalTitle">
        <div class="auth-modal-card">
          <button class="auth-modal-close" id="authModalCloseBtn" aria-label="Close dialog">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>

          <!-- Top Brand Header -->
          <div class="auth-modal-header">
            <div class="auth-monogram">L</div>
            <h2 class="auth-modal-title" id="authModalTitle">Welcome to L'AURA</h2>
            <p class="auth-modal-subtitle">Access your tasting reservations, private dining inquiries, and seasonal cellar notes.</p>
          </div>

          <!-- Alert Banner -->
          <div class="auth-alert" id="authAlertBox" style="display: none;"></div>

          <!-- Google 1-Click Sign-In -->
          <div class="oauth-section">
            <button type="button" class="google-auth-btn" id="modalGoogleLoginBtn">
              <svg class="google-icon" width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>Continue with Google</span>
            </button>
            <div class="auth-divider">
              <span>or continue with email</span>
            </div>
          </div>

          <!-- Auth Navigation Tabs -->
          <div class="auth-tabs-nav" id="authTabsNav">
            <button class="auth-tab-btn active" data-tab="otp">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
              <span>Email Code</span>
            </button>
            <button class="auth-tab-btn" data-tab="password">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              <span>Password</span>
            </button>
            <button class="auth-tab-btn" data-tab="signup">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>
              <span>Register</span>
            </button>
          </div>

          <!-- VIEW 1: Email Magic Link / OTP -->
          <div class="auth-tab-content active" id="tabContent-otp">
            <!-- Step 1: Input Email -->
            <form id="otpRequestForm" class="auth-form">
              <div class="form-group">
                <label for="otpEmailInput">Your Email Address</label>
                <div class="input-with-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                  <input type="email" id="otpEmailInput" placeholder="name@domain.com" required autocomplete="email">
                </div>
                <small class="form-hint">We'll dispatch a 6-digit confirmation code and instant magic link directly to your inbox. No password needed.</small>
              </div>
              <button type="submit" class="btn btn-primary auth-submit-btn" id="otpSendBtn">
                <span>Send Sign-In Code</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
              </button>
            </form>

            <!-- Step 2: Input Verification Code (Hidden initially) -->
            <div id="otpVerifySection" class="otp-verify-section" style="display: none;">
              <div class="otp-sent-banner">
                <div class="otp-sent-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"></path><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                </div>
                <div>
                  <h4 style="margin: 0 0 0.2rem 0; font-size: 1rem;">Code dispatched!</h4>
                  <p style="margin: 0; font-size: 0.85rem; color: var(--text-muted);">
                    Check <strong id="otpTargetEmailDisplay"></strong> for your 6-digit login code or click the magic link in your email.
                  </p>
                </div>
              </div>

              <form id="otpVerifyForm" class="auth-form" style="margin-top: 1.25rem;">
                <div class="form-group">
                  <label for="otpCodeInput">6-Digit Login Code</label>
                  <input type="text" id="otpCodeInput" class="otp-code-input" placeholder="• • • • • •" maxlength="6" inputmode="numeric" autocomplete="one-time-code" required>
                  <small class="form-hint">Enter the code from the email or click the magic link directly.</small>
                </div>
                <button type="submit" class="btn btn-primary auth-submit-btn" id="otpConfirmBtn">
                  <span>Verify & Sign In</span>
                </button>
              </form>

              <div class="otp-resend-row">
                <button type="button" class="text-link-btn" id="otpResendBtn">Resend code</button>
                <span class="dot-divider">•</span>
                <button type="button" class="text-link-btn" id="otpChangeEmailBtn">Use a different email</button>
              </div>
            </div>
          </div>

          <!-- VIEW 2: Email + Password Sign In -->
          <div class="auth-tab-content" id="tabContent-password">
            <form id="passwordLoginForm" class="auth-form">
              <div class="form-group">
                <label for="pwdLoginEmail">Email Address</label>
                <div class="input-with-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                  <input type="email" id="pwdLoginEmail" placeholder="name@domain.com" required autocomplete="username">
                </div>
              </div>

              <div class="form-group">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
                  <label for="pwdLoginPassword" style="margin-bottom: 0;">Password</label>
                  <button type="button" class="text-link-btn" id="authForgotPwdBtn" style="font-size: 0.8rem;">Forgot password?</button>
                </div>
                <div class="input-with-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                  <input type="password" id="pwdLoginPassword" placeholder="••••••••" required autocomplete="current-password">
                  <button type="button" class="toggle-password-btn" data-target="pwdLoginPassword" aria-label="Toggle password visibility">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                  </button>
                </div>
              </div>

              <button type="submit" class="btn btn-primary auth-submit-btn" id="pwdLoginSubmitBtn">
                <span>Sign In with Password</span>
              </button>
            </form>
          </div>

          <!-- VIEW 3: Create Account -->
          <div class="auth-tab-content" id="tabContent-signup">
            <form id="signupForm" class="auth-form">
              <div class="form-group">
                <label for="signupFullName">Full Name</label>
                <div class="input-with-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                  <input type="text" id="signupFullName" placeholder="Eleanor Vance" required autocomplete="name">
                </div>
              </div>

              <div class="form-group">
                <label for="signupEmail">Email Address</label>
                <div class="input-with-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                  <input type="email" id="signupEmail" placeholder="name@domain.com" required autocomplete="email">
                </div>
              </div>

              <div class="form-group">
                <label for="signupPassword">Create Password</label>
                <div class="input-with-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                  <input type="password" id="signupPassword" placeholder="Minimum 6 characters" minlength="6" required autocomplete="new-password">
                  <button type="button" class="toggle-password-btn" data-target="signupPassword" aria-label="Toggle password visibility">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                  </button>
                </div>
              </div>

              <button type="submit" class="btn btn-primary auth-submit-btn" id="signupSubmitBtn">
                <span>Create L'AURA Account</span>
              </button>
            </form>
          </div>

          <!-- VIEW 4: Forgot Password / Password Recovery -->
          <div class="auth-tab-content" id="tabContent-recovery" style="display: none;">
            <div id="recoveryRequestSection">
              <h3 style="font-size: 1.15rem; margin-bottom: 0.4rem;">Reset Your Password</h3>
              <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.25rem;">
                Enter your registered email address and we will dispatch a secure link to reset your account password.
              </p>
              <form id="recoveryRequestForm" class="auth-form">
                <div class="form-group">
                  <label for="recoveryEmail">Email Address</label>
                  <div class="input-with-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                    <input type="email" id="recoveryEmail" placeholder="name@domain.com" required>
                  </div>
                </div>
                <button type="submit" class="btn btn-primary auth-submit-btn" id="recoverySendBtn">
                  <span>Send Reset Link</span>
                </button>
                <button type="button" class="text-link-btn" id="backToLoginFromRecovery" style="margin-top: 0.75rem; text-align: center; width: 100%;">
                  Back to Sign In
                </button>
              </form>
            </div>

            <!-- Set New Password Form (active when type=recovery) -->
            <div id="recoveryUpdateSection" style="display: none;">
              <h3 style="font-size: 1.15rem; margin-bottom: 0.4rem;">Set New Password</h3>
              <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.25rem;">
                Please choose a fresh password for your account.
              </p>
              <form id="recoveryUpdateForm" class="auth-form">
                <div class="form-group">
                  <label for="recoveryNewPassword">New Password</label>
                  <div class="input-with-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                    <input type="password" id="recoveryNewPassword" placeholder="Minimum 6 characters" minlength="6" required autocomplete="new-password">
                  </div>
                </div>
                <button type="submit" class="btn btn-primary auth-submit-btn" id="recoverySaveBtn">
                  <span>Update Password & Log In</span>
                </button>
              </form>
            </div>
          </div>

          <!-- Bottom Security Footer -->
          <div class="auth-modal-footer">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
            <span>Secured via Supabase Mail Authentication & 256-bit SSL</span>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalMarkup);
    this.bindModalEvents();
  }

  bindModalEvents() {
    const modal = document.getElementById('supabaseAuthModal');
    const closeBtn = document.getElementById('authModalCloseBtn');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeModal());
    }

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.closeModal();
      });
    }

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal && modal.classList.contains('open')) {
        this.closeModal();
      }
    });

    // Close dropdowns on outside click
    document.addEventListener('click', (e) => {
      const popover = document.getElementById('userDropdownPopover');
      const trigger = document.getElementById('userDropdownTrigger');
      if (popover && popover.classList.contains('open') && !popover.contains(e.target) && !trigger?.contains(e.target)) {
        popover.classList.remove('open');
        trigger?.setAttribute('aria-expanded', 'false');
      }
    });

    // Google Sign-In button
    const googleBtn = document.getElementById('modalGoogleLoginBtn');
    if (googleBtn) {
      googleBtn.addEventListener('click', async () => {
        this.setButtonLoading(googleBtn, true, 'Connecting to Google...');
        this.clearAlert();
        try {
          await this.signInWithGoogle();
        } catch (err) {
          console.error('Google login error:', err);
          let msg = err.message || 'Failed to initialize Google login.';
          if (msg.includes('provider is not enabled') || msg.includes('Unsupported provider')) {
            msg = 'Google login is not yet enabled in your Supabase project dashboard. Please enable Google under Authentication -> Providers.';
          }
          this.showAlert(msg, 'error');
          this.setButtonLoading(googleBtn, false, 'Continue with Google');
        }
      });
    }

    // Tab buttons
    const tabBtns = document.querySelectorAll('.auth-tab-btn');
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetTab = btn.dataset.tab;
        this.switchTab(targetTab);
      });
    });

    // Toggle Password visibility
    const toggleBtns = document.querySelectorAll('.toggle-password-btn');
    toggleBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        const input = document.getElementById(targetId);
        if (input) {
          const isPassword = input.type === 'password';
          input.type = isPassword ? 'text' : 'password';
          btn.style.color = isPassword ? 'var(--accent-terracotta)' : 'var(--text-muted)';
        }
      });
    });

    // OTP Request Form
    const otpRequestForm = document.getElementById('otpRequestForm');
    if (otpRequestForm) {
      otpRequestForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const emailInput = document.getElementById('otpEmailInput');
        const submitBtn = document.getElementById('otpSendBtn');
        if (!emailInput || !submitBtn) return;

        this.setButtonLoading(submitBtn, true, 'Sending Code...');
        this.clearAlert();

        try {
          await this.sendMagicLink(emailInput.value);
          this.showOtpVerifyStep(emailInput.value);
          this.showAlert('We sent a 6-digit code and magic link to your email.', 'success');
        } catch (err) {
          console.error('OTP send error:', err);
          this.showAlert(err.message || 'Failed to dispatch email code. Please check the address.', 'error');
        } finally {
          this.setButtonLoading(submitBtn, false, 'Send Sign-In Code');
        }
      });
    }

    // OTP Verify Form
    const otpVerifyForm = document.getElementById('otpVerifyForm');
    if (otpVerifyForm) {
      otpVerifyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const codeInput = document.getElementById('otpCodeInput');
        const submitBtn = document.getElementById('otpConfirmBtn');
        if (!codeInput || !submitBtn) return;

        this.setButtonLoading(submitBtn, true, 'Verifying...');
        this.clearAlert();

        try {
          await this.verifyOtpCode(this.otpPendingEmail, codeInput.value);
          this.showAlert('Successfully verified! Signing you in...', 'success');
          // onAuthStateChange will handle closing modal and toast
        } catch (err) {
          console.error('OTP verify error:', err);
          this.showAlert(err.message || 'The code entered is invalid or expired. Please check your inbox.', 'error');
        } finally {
          this.setButtonLoading(submitBtn, false, 'Verify & Sign In');
        }
      });
    }

    // OTP Code Input auto-submit when 6 digits are typed
    const otpCodeInput = document.getElementById('otpCodeInput');
    if (otpCodeInput) {
      otpCodeInput.addEventListener('input', () => {
        const clean = otpCodeInput.value.replace(/\D/g, '');
        otpCodeInput.value = clean;
        if (clean.length === 6) {
          otpVerifyForm?.requestSubmit();
        }
      });
    }

    // Resend OTP
    const resendBtn = document.getElementById('otpResendBtn');
    if (resendBtn) {
      resendBtn.addEventListener('click', async () => {
        if (!this.otpPendingEmail) return;
        this.clearAlert();
        try {
          await this.sendMagicLink(this.otpPendingEmail);
          this.showAlert(`New code sent to ${this.otpPendingEmail}!`, 'success');
        } catch (err) {
          this.showAlert(err.message || 'Could not resend code. Please wait a moment.', 'error');
        }
      });
    }

    // Change Email back to Step 1
    const changeEmailBtn = document.getElementById('otpChangeEmailBtn');
    if (changeEmailBtn) {
      changeEmailBtn.addEventListener('click', () => {
        document.getElementById('otpRequestForm').style.display = 'block';
        document.getElementById('otpVerifySection').style.display = 'none';
        this.clearAlert();
      });
    }

    // Password Sign In Form
    const pwdForm = document.getElementById('passwordLoginForm');
    if (pwdForm) {
      pwdForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('pwdLoginEmail').value;
        const pwd = document.getElementById('pwdLoginPassword').value;
        const submitBtn = document.getElementById('pwdLoginSubmitBtn');

        this.setButtonLoading(submitBtn, true, 'Signing In...');
        this.clearAlert();

        try {
          await this.signInWithPassword(email, pwd);
          this.showAlert('Signed in successfully!', 'success');
        } catch (err) {
          console.error('Password login error:', err);
          this.showAlert(err.message || 'Invalid email or password.', 'error');
        } finally {
          this.setButtonLoading(submitBtn, false, 'Sign In with Password');
        }
      });
    }

    // Sign Up Form
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
      signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('signupFullName').value;
        const email = document.getElementById('signupEmail').value;
        const pwd = document.getElementById('signupPassword').value;
        const submitBtn = document.getElementById('signupSubmitBtn');

        this.setButtonLoading(submitBtn, true, 'Creating Account...');
        this.clearAlert();

        try {
          const data = await this.signUp(email, pwd, name);
          if (data?.session) {
            this.showAlert('Account created! Welcome to L\'AURA.', 'success');
          } else {
            this.showAlert(
              `Registration initiated! A verification link has been dispatched to ${email}. Please check your email to activate your account.`,
              'success'
            );
          }
        } catch (err) {
          console.error('Signup error:', err);
          this.showAlert(err.message || 'Could not create account. Please try again.', 'error');
        } finally {
          this.setButtonLoading(submitBtn, false, 'Create L\'AURA Account');
        }
      });
    }

    // Forgot password trigger
    const forgotBtn = document.getElementById('authForgotPwdBtn');
    if (forgotBtn) {
      forgotBtn.addEventListener('click', () => {
        const loginEmail = document.getElementById('pwdLoginEmail')?.value;
        if (loginEmail) {
          const recEmail = document.getElementById('recoveryEmail');
          if (recEmail) recEmail.value = loginEmail;
        }
        this.switchTab('recovery');
      });
    }

    // Recovery Request Form
    const recForm = document.getElementById('recoveryRequestForm');
    if (recForm) {
      recForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('recoveryEmail').value;
        const submitBtn = document.getElementById('recoverySendBtn');

        this.setButtonLoading(submitBtn, true, 'Sending Link...');
        this.clearAlert();

        try {
          await this.resetPasswordForEmail(email);
          this.showAlert(`A password reset link was sent to ${email}. Please check your inbox.`, 'success');
        } catch (err) {
          console.error('Recovery error:', err);
          this.showAlert(err.message || 'Failed to dispatch reset email.', 'error');
        } finally {
          this.setButtonLoading(submitBtn, false, 'Send Reset Link');
        }
      });
    }

    // Back to Login from Recovery
    const backBtn = document.getElementById('backToLoginFromRecovery');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        this.switchTab('password');
      });
    }

    // Recovery Update Form (new password)
    const updateForm = document.getElementById('recoveryUpdateForm');
    if (updateForm) {
      updateForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newPwd = document.getElementById('recoveryNewPassword').value;
        const submitBtn = document.getElementById('recoverySaveBtn');

        this.setButtonLoading(submitBtn, true, 'Updating...');
        this.clearAlert();

        try {
          await this.updatePassword(newPwd);
          this.showAlert('Password updated successfully! Welcome back.', 'success');
          setTimeout(() => this.closeModal(), 1200);
        } catch (err) {
          console.error('Password update error:', err);
          this.showAlert(err.message || 'Failed to update password.', 'error');
        } finally {
          this.setButtonLoading(submitBtn, false, 'Update Password & Log In');
        }
      });
    }
  }

  showOtpVerifyStep(email) {
    const reqForm = document.getElementById('otpRequestForm');
    const verifySec = document.getElementById('otpVerifySection');
    const emailDisplay = document.getElementById('otpTargetEmailDisplay');
    const codeInput = document.getElementById('otpCodeInput');

    if (reqForm) reqForm.style.display = 'none';
    if (verifySec) verifySec.style.display = 'block';
    if (emailDisplay) emailDisplay.textContent = email;
    if (codeInput) {
      codeInput.value = '';
      setTimeout(() => codeInput.focus(), 150);
    }
  }

  switchTab(tabId) {
    this.clearAlert();
    const tabBtns = document.querySelectorAll('.auth-tab-btn');
    const tabContents = document.querySelectorAll('.auth-tab-content');
    const tabsNav = document.getElementById('authTabsNav');

    tabBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    tabContents.forEach((content) => {
      content.classList.toggle('active', content.id === `tabContent-${tabId}`);
      if (content.id === `tabContent-${tabId}`) {
        content.style.display = 'block';
      } else {
        content.style.display = 'none';
      }
    });

    // Special handling for recovery tab
    if (tabId === 'recovery') {
      if (tabsNav) tabsNav.style.display = 'none';
      // Check if user came from reset link
      if (window.location.hash.includes('type=recovery')) {
        document.getElementById('recoveryRequestSection').style.display = 'none';
        document.getElementById('recoveryUpdateSection').style.display = 'block';
      } else {
        document.getElementById('recoveryRequestSection').style.display = 'block';
        document.getElementById('recoveryUpdateSection').style.display = 'none';
      }
    } else {
      if (tabsNav) tabsNav.style.display = 'grid';
    }
  }

  openModal(initialTab = 'otp') {
    const modal = document.getElementById('supabaseAuthModal');
    if (!modal) return;
    this.switchTab(initialTab);
    this.clearAlert();
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    // Focus primary input
    setTimeout(() => {
      if (initialTab === 'otp') {
        const inp = document.getElementById('otpEmailInput');
        if (inp && inp.offsetParent !== null) inp.focus();
      } else if (initialTab === 'password') {
        const inp = document.getElementById('pwdLoginEmail');
        if (inp) inp.focus();
      } else if (initialTab === 'signup') {
        const inp = document.getElementById('signupFullName');
        if (inp) inp.focus();
      }
    }, 150);
  }

  closeModal() {
    const modal = document.getElementById('supabaseAuthModal');
    if (modal) {
      modal.classList.remove('open');
      document.body.style.overflow = '';
      this.clearAlert();
    }
  }

  showAlert(msg, type = 'error') {
    const alertBox = document.getElementById('authAlertBox');
    if (!alertBox) return;
    alertBox.className = `auth-alert ${type}`;
    alertBox.textContent = msg;
    alertBox.style.display = 'block';
  }

  clearAlert() {
    const alertBox = document.getElementById('authAlertBox');
    if (alertBox) {
      alertBox.textContent = '';
      alertBox.style.display = 'none';
    }
  }

  setButtonLoading(btn, isLoading, text) {
    if (!btn) return;
    btn.disabled = isLoading;
    if (isLoading) {
      btn.dataset.originalText = btn.innerHTML;
      btn.innerHTML = `
        <svg class="spinner-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
          <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path>
        </svg>
        <span>${text}</span>
      `;
    } else {
      btn.innerHTML = btn.dataset.originalText || `<span>${text}</span>`;
    }
  }
}

// Instantiate and expose globally
window.authManager = new SupabaseAuthManager();
