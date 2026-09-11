// Auth Modal Component for Supabase Authentication in Piuccia Games

import { authManager } from '../core/AuthManager.js';
import { soundFx } from '../core/SoundFx.js';

export class AuthModal {
  constructor() {
    this.modal = null;
    this.currentTab = 'login'; // 'login' | 'register'
    this.onAuthenticatedCallback = null;
    this.initDOM();
  }

  initDOM() {
    let existing = document.getElementById('app-auth-dialog');
    if (existing) {
      this.modal = existing;
      return;
    }

    const dialog = document.createElement('dialog');
    dialog.className = 'app-dialog auth-dialog';
    dialog.id = 'app-auth-dialog';
    dialog.innerHTML = `
      <div class="dialog-content auth-dialog-card">
        <button class="auth-close-x-btn" id="auth-close-x-btn" title="Chiudi">&times;</button>
        
        <div class="auth-header">
          <div class="auth-logo-badge">
            <img src="/icons/icon-192.png" alt="Piuccia Games Logo" class="auth-logo-img" />
          </div>
          <h2 class="dialog-title auth-title">Piuccia Games</h2>
          <p class="auth-subtitle" id="auth-dialog-subtitle">Accedi o registrati per scendere al tavolo da gioco!</p>
        </div>

        <div class="auth-tabs-nav">
          <button type="button" class="auth-tab-btn active" id="tab-login-btn">Accedi</button>
          <button type="button" class="auth-tab-btn" id="tab-register-btn">Registrati</button>
        </div>

        <!-- Alert / Feedback Banner -->
        <div class="auth-alert hidden" id="auth-alert-box"></div>

        <!-- Login Form -->
        <form class="auth-form" id="auth-login-form">
          <div class="auth-input-group">
            <label for="login-email">Email</label>
            <div class="input-with-icon">
              <span class="input-icon">✉️</span>
              <input type="email" id="login-email" name="email" placeholder="esempio@email.com" required autocomplete="email" />
            </div>
          </div>

          <div class="auth-input-group">
            <label for="login-password">Password</label>
            <div class="input-with-icon">
              <span class="input-icon">🔒</span>
              <input type="password" id="login-password" name="password" placeholder="La tua password" required autocomplete="current-password" />
            </div>
          </div>

          <button type="submit" class="auth-submit-btn" id="login-submit-btn">
            <span class="submit-text">Accedi e Gioca</span>
            <span class="submit-spinner hidden"></span>
          </button>
        </form>

        <!-- Register Form -->
        <form class="auth-form hidden" id="auth-register-form">
          <div class="auth-input-group">
            <label for="register-nickname">Nome Giocatore / Nickname</label>
            <div class="input-with-icon">
              <span class="input-icon">👤</span>
              <input type="text" id="register-nickname" name="nickname" placeholder="es. Piuccia, Mario..." required autocomplete="nickname" maxlength="24" />
            </div>
          </div>

          <div class="auth-input-group">
            <label for="register-email">Email</label>
            <div class="input-with-icon">
              <span class="input-icon">✉️</span>
              <input type="email" id="register-email" name="email" placeholder="esempio@email.com" required autocomplete="email" />
            </div>
          </div>

          <div class="auth-input-group">
            <label for="register-password">Password (min. 6 caratteri)</label>
            <div class="input-with-icon">
              <span class="input-icon">🔒</span>
              <input type="password" id="register-password" name="password" placeholder="Crea una password sicura" minlength="6" required autocomplete="new-password" />
            </div>
          </div>

          <div class="auth-input-group">
            <label for="register-confirm-password">Conferma Password</label>
            <div class="input-with-icon">
              <span class="input-icon">🔐</span>
              <input type="password" id="register-confirm-password" name="confirmPassword" placeholder="Ripeti la password" minlength="6" required autocomplete="new-password" />
            </div>
          </div>

          <button type="submit" class="auth-submit-btn" id="register-submit-btn">
            <span class="submit-text">Crea Account e Gioca</span>
            <span class="submit-spinner hidden"></span>
          </button>
        </form>

        <div class="auth-footer-note">
          <p>I tuoi dati sono protetti e crittografati con Supabase Auth.</p>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);
    this.modal = dialog;
    this.attachEvents();
  }

  attachEvents() {
    const tabLogin = this.modal.querySelector('#tab-login-btn');
    const tabRegister = this.modal.querySelector('#tab-register-btn');
    const closeBtn = this.modal.querySelector('#auth-close-x-btn');

    tabLogin.addEventListener('click', () => this.switchTab('login'));
    tabRegister.addEventListener('click', () => this.switchTab('register'));
    closeBtn.addEventListener('click', () => this.close());

    // Close on backdrop click
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.close();
      }
    });

    // Login submit
    const loginForm = this.modal.querySelector('#auth-login-form');
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleLogin();
    });

    // Register submit
    const registerForm = this.modal.querySelector('#auth-register-form');
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleRegister();
    });
  }

  switchTab(tab) {
    soundFx.playSnap();
    this.currentTab = tab;
    this.clearAlert();

    const tabLogin = this.modal.querySelector('#tab-login-btn');
    const tabRegister = this.modal.querySelector('#tab-register-btn');
    const loginForm = this.modal.querySelector('#auth-login-form');
    const registerForm = this.modal.querySelector('#auth-register-form');
    const subtitle = this.modal.querySelector('#auth-dialog-subtitle');

    if (tab === 'login') {
      tabLogin.classList.add('active');
      tabRegister.classList.remove('active');
      loginForm.classList.remove('hidden');
      registerForm.classList.add('hidden');
      subtitle.textContent = 'Bentornato! Accedi per giocare subito a carte.';
    } else {
      tabRegister.classList.add('active');
      tabLogin.classList.remove('active');
      registerForm.classList.remove('hidden');
      loginForm.classList.add('hidden');
      subtitle.textContent = 'Registrati gratuitamente per unirti al circolo Piuccia Games!';
    }
  }

  showAlert(message, type = 'error') {
    const alertBox = this.modal.querySelector('#auth-alert-box');
    alertBox.className = `auth-alert ${type}`;
    alertBox.textContent = message;
    alertBox.classList.remove('hidden');
  }

  clearAlert() {
    const alertBox = this.modal.querySelector('#auth-alert-box');
    alertBox.className = 'auth-alert hidden';
    alertBox.textContent = '';
  }

  setLoading(isLoading, btnId) {
    const btn = this.modal.querySelector(btnId);
    if (!btn) return;
    const text = btn.querySelector('.submit-text');
    const spinner = btn.querySelector('.submit-spinner');
    btn.disabled = isLoading;
    if (isLoading) {
      text.classList.add('hidden');
      spinner.classList.remove('hidden');
    } else {
      text.classList.remove('hidden');
      spinner.classList.add('hidden');
    }
  }

  async handleLogin() {
    const email = this.modal.querySelector('#login-email').value;
    const password = this.modal.querySelector('#login-password').value;

    this.clearAlert();
    this.setLoading(true, '#login-submit-btn');

    try {
      await authManager.signIn({ email, password });
      soundFx.playWin();
      this.showAlert('Accesso eseguito! Benvenuto al tavolo.', 'success');
      setTimeout(() => {
        this.close();
        if (this.onAuthenticatedCallback) {
          this.onAuthenticatedCallback();
          this.onAuthenticatedCallback = null;
        }
      }, 500);
    } catch (err) {
      soundFx.playSnap();
      this.showAlert(err.message || 'Errore durante l\'accesso. Riprova.', 'error');
    } finally {
      this.setLoading(false, '#login-submit-btn');
    }
  }

  async handleRegister() {
    const nickname = this.modal.querySelector('#register-nickname').value;
    const email = this.modal.querySelector('#register-email').value;
    const password = this.modal.querySelector('#register-password').value;
    const confirmPassword = this.modal.querySelector('#register-confirm-password').value;

    if (password !== confirmPassword) {
      this.showAlert('Le due password inserite non coincidono.', 'error');
      return;
    }

    if (password.length < 6) {
      this.showAlert('La password deve contenere almeno 6 caratteri.', 'error');
      return;
    }

    this.clearAlert();
    this.setLoading(true, '#register-submit-btn');

    try {
      const res = await authManager.signUp({ email, password, nickname });
      soundFx.playWin();

      if (res.autoLoggedIn) {
        this.showAlert(`Benvenuto ${nickname || ''}! Account creato con successo.`, 'success');
        setTimeout(() => {
          this.close();
          if (this.onAuthenticatedCallback) {
            this.onAuthenticatedCallback();
            this.onAuthenticatedCallback = null;
          }
        }, 600);
      } else {
        // Confirmation email case
        this.showAlert(
          'Registrazione completata! Ti abbiamo inviato un\'email di conferma. Apri la tua posta e clicca sul link di verifica per attivare l\'account prima di accedere.', 
          'success'
        );
        // Switch to login tab after 3 seconds
        setTimeout(() => {
          this.switchTab('login');
          const loginEmailInput = this.modal.querySelector('#login-email');
          if (loginEmailInput) loginEmailInput.value = email;
        }, 3500);
      }
    } catch (err) {
      soundFx.playSnap();
      this.showAlert(err.message || 'Errore durante la registrazione.', 'error');
    } finally {
      this.setLoading(false, '#register-submit-btn');
    }
  }

  open({ mode = 'login', onAuthenticated = null, notice = null } = {}) {
    soundFx.playSnap();
    this.onAuthenticatedCallback = onAuthenticated;
    this.switchTab(mode);
    if (notice) {
      this.showAlert(notice, 'info');
    }
    this.modal.showModal();
  }

  close() {
    this.clearAlert();
    this.modal.close();
  }
}

export const authModal = new AuthModal();
