// Auth Modal Component for Supabase Authentication in Piuccia Games

import { authManager } from '../core/AuthManager.js';
import { soundFx } from '../core/SoundFx.js';
import { validatePassword, validateUsername } from '../utils/validators.js';
import { icons } from '../utils/icons.js';

export class AuthModal {
  constructor() {
    this.modal = null;
    this.currentMode = 'login'; // 'login' or 'register'
    this.onAuthenticatedCallback = null;
    this.render();
  }

  render() {
    if (this.modal) return;

    const dialog = document.createElement('dialog');
    dialog.className = 'app-dialog auth-dialog';
    dialog.id = 'auth-modal-dialog';
    dialog.innerHTML = `
      <div class="dialog-content auth-dialog-content">
        <div class="auth-dialog-header">
          <div class="auth-brand-badge">
            <img src="/icons/icon-192.png?v=2" alt="Piuccia Games" class="auth-badge-icon" />
          </div>
          <h2 class="dialog-title" id="auth-modal-title">Benvenuto su Piuccia Games</h2>
          <p class="auth-subtitle" id="auth-modal-subtitle">Accedi per salvare il tuo profilo, le tue statistiche e giocare!</p>
          <button class="dialog-close-x" id="auth-close-x" title="Chiudi finestra">${icons.close({ size: 20 })}</button>
        </div>

        <div class="auth-tabs" role="tablist">
          <button type="button" class="auth-tab-btn active" id="tab-login" role="tab" aria-selected="true">
            <span>Accedi</span>
          </button>
          <button type="button" class="auth-tab-btn" id="tab-register" role="tab" aria-selected="false">
            <span>Registrati</span>
          </button>
        </div>

        <div class="auth-feedback-banner hidden" id="auth-feedback-banner"></div>

        <!-- Login Form -->
        <form class="auth-form" id="auth-login-form">
          <div class="auth-input-group">
            <label for="login-email">Email</label>
            <div class="input-with-icon">
              <span class="input-icon">${icons.mail({ size: 18 })}</span>
              <input type="email" id="login-email" name="email" placeholder="nome@esempio.it" required autocomplete="email" />
            </div>
          </div>

          <div class="auth-input-group">
            <label for="login-password">Password</label>
            <div class="input-with-icon">
              <span class="input-icon">${icons.lock({ size: 18 })}</span>
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
              <span class="input-icon">${icons.user({ size: 18 })}</span>
              <input type="text" id="register-nickname" name="nickname" placeholder="es. Piuccia, Mario..." required autocomplete="nickname" maxlength="20" />
            </div>
            <div class="field-feedback" id="modal-reg-nick-feedback"></div>
          </div>

          <div class="auth-input-group">
            <label for="register-email">Email</label>
            <div class="input-with-icon">
              <span class="input-icon">${icons.mail({ size: 18 })}</span>
              <input type="email" id="register-email" name="email" placeholder="esempio@email.com" required autocomplete="email" />
            </div>
          </div>

          <div class="auth-input-group">
            <label for="register-password">Password (almeno 8 caratteri)</label>
            <div class="input-with-icon">
              <span class="input-icon">${icons.lock({ size: 18 })}</span>
              <input type="password" id="register-password" name="password" placeholder="Crea una password sicura" minlength="8" required autocomplete="new-password" />
            </div>

            <!-- Password checklist -->
            <div class="pw-checklist" id="modal-pw-checklist">
              <div class="pw-check-item" id="mchk-len"><span class="pw-icon">${icons.close({ size: 12 })}</span> Minimo 8 caratteri</div>
              <div class="pw-check-item" id="mchk-lower"><span class="pw-icon">${icons.close({ size: 12 })}</span> Lettera minuscola (a-z)</div>
              <div class="pw-check-item" id="mchk-upper"><span class="pw-icon">${icons.close({ size: 12 })}</span> Lettera maiuscola (A-Z)</div>
              <div class="pw-check-item" id="mchk-num"><span class="pw-icon">${icons.close({ size: 12 })}</span> Almeno un numero (0-9)</div>
              <div class="pw-check-item" id="mchk-spec"><span class="pw-icon">${icons.close({ size: 12 })}</span> Simbolo speciale (!?#@...)</div>
            </div>
          </div>

          <div class="auth-input-group">
            <label for="register-confirm-password">Conferma Password</label>
            <div class="input-with-icon">
              <span class="input-icon">${icons.lock({ size: 18 })}</span>
              <input type="password" id="register-confirm-password" name="confirmPassword" placeholder="Ripeti la password" minlength="8" required autocomplete="new-password" />
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
    const tabLogin = this.modal.querySelector('#tab-login');
    const tabRegister = this.modal.querySelector('#tab-register');
    const closeBtn = this.modal.querySelector('#auth-close-x');

    tabLogin?.addEventListener('click', () => this.switchTab('login'));
    tabRegister?.addEventListener('click', () => this.switchTab('register'));
    closeBtn?.addEventListener('click', () => this.close());

    // Close on backdrop click
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.close();
      }
    });

    // Real-time Username Availability Checking
    const nickInput = this.modal.querySelector('#register-nickname');
    const nickFeedback = this.modal.querySelector('#modal-reg-nick-feedback');
    let nickDebounce = null;

    nickInput?.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      if (nickDebounce) clearTimeout(nickDebounce);

      if (!val) {
        if (nickFeedback) {
          nickFeedback.textContent = '';
          nickFeedback.className = 'field-feedback';
        }
        return;
      }

      const format = validateUsername(val);
      if (!format.isValid) {
        if (nickFeedback) {
          nickFeedback.textContent = `⚠️ ${format.errorMsg}`;
          nickFeedback.className = 'field-feedback feedback-invalid';
        }
        return;
      }

      if (nickFeedback) {
        nickFeedback.textContent = '🔄 Verifica disponibilità...';
        nickFeedback.className = 'field-feedback feedback-checking';
      }

      nickDebounce = setTimeout(async () => {
        const res = await authManager.checkUsernameAvailability(val);
        if (!nickFeedback) return;
        if (res.available) {
          nickFeedback.textContent = '✅ Username disponibile!';
          nickFeedback.className = 'field-feedback feedback-available';
        } else {
          nickFeedback.textContent = `❌ ${res.message}`;
          nickFeedback.className = 'field-feedback feedback-taken';
        }
      }, 350);
    });

    // Real-time Password Checklist Updater
    const pwInput = this.modal.querySelector('#register-password');
    const chkLen = this.modal.querySelector('#mchk-len');
    const chkLower = this.modal.querySelector('#mchk-lower');
    const chkUpper = this.modal.querySelector('#mchk-upper');
    const chkNum = this.modal.querySelector('#mchk-num');
    const chkSpec = this.modal.querySelector('#mchk-spec');

    const updateCheckItem = (el, isValid, text) => {
      if (!el) return;
      if (isValid) {
        el.className = 'pw-check-item valid';
        el.innerHTML = `<span class="pw-icon">${icons.check({ size: 12 })}</span> ${text}`;
      } else {
        el.className = 'pw-check-item';
        el.innerHTML = `<span class="pw-icon">${icons.close({ size: 12 })}</span> ${text}`;
      }
    };

    pwInput?.addEventListener('input', (e) => {
      const val = e.target.value;
      const res = validatePassword(val);

      updateCheckItem(chkLen, res.minLength, 'Minimo 8 caratteri');
      updateCheckItem(chkLower, res.hasLower, 'Lettera minuscola (a-z)');
      updateCheckItem(chkUpper, res.hasUpper, 'Lettera maiuscola (A-Z)');
      updateCheckItem(chkNum, res.hasNumber, 'Almeno un numero (0-9)');
      updateCheckItem(chkSpec, res.hasSpecial, 'Simbolo speciale (!?#@...)');
    });

    // Login submit
    const loginForm = this.modal.querySelector('#auth-login-form');
    loginForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleLogin();
    });

    // Register submit
    const registerForm = this.modal.querySelector('#auth-register-form');
    registerForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleRegister();
    });
  }

  switchTab(tab) {
    soundFx.playSnap();
    this.currentMode = tab;
    this.clearAlert();

    const tabLogin = this.modal.querySelector('#tab-login');
    const tabRegister = this.modal.querySelector('#tab-register');
    const loginForm = this.modal.querySelector('#auth-login-form');
    const registerForm = this.modal.querySelector('#auth-register-form');
    const subtitle = this.modal.querySelector('#auth-modal-subtitle');

    if (tab === 'login') {
      tabLogin?.classList.add('active');
      tabRegister?.classList.remove('active');
      loginForm?.classList.remove('hidden');
      registerForm?.classList.add('hidden');
      if (subtitle) subtitle.textContent = 'Bentornato! Accedi per giocare subito a carte.';
    } else {
      tabRegister?.classList.add('active');
      tabLogin?.classList.remove('active');
      registerForm?.classList.remove('hidden');
      loginForm?.classList.add('hidden');
      if (subtitle) subtitle.textContent = 'Registrati per unirti al circolo Piuccia Games!';
    }
  }

  showAlert(message, type = 'error') {
    const alertBox = this.modal.querySelector('#auth-feedback-banner');
    if (!alertBox) return;
    alertBox.className = `auth-feedback-banner ${type}`;
    alertBox.textContent = message;
    alertBox.classList.remove('hidden');
  }

  clearAlert() {
    const alertBox = this.modal.querySelector('#auth-feedback-banner');
    if (!alertBox) return;
    alertBox.className = 'auth-feedback-banner hidden';
    alertBox.textContent = '';
  }

  setLoading(isLoading, btnId) {
    const btn = this.modal.querySelector(btnId);
    if (!btn) return;
    const text = btn.querySelector('.submit-text');
    const spinner = btn.querySelector('.submit-spinner');
    btn.disabled = isLoading;
    if (isLoading) {
      text?.classList.add('hidden');
      spinner?.classList.remove('hidden');
    } else {
      text?.classList.remove('hidden');
      spinner?.classList.add('hidden');
    }
  }

  async handleLogin() {
    const email = this.modal.querySelector('#login-email').value.trim();
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
    const nickname = this.modal.querySelector('#register-nickname').value.trim();
    const email = this.modal.querySelector('#register-email').value.trim();
    const password = this.modal.querySelector('#register-password').value;
    const confirmPassword = this.modal.querySelector('#register-confirm-password').value;

    const userVal = validateUsername(nickname);
    if (!userVal.isValid) {
      soundFx.playSnap();
      this.showAlert(userVal.errorMsg, 'error');
      return;
    }

    const pwVal = validatePassword(password);
    if (!pwVal.isValid) {
      soundFx.playSnap();
      this.showAlert(pwVal.errorMsg, 'error');
      return;
    }

    if (password !== confirmPassword) {
      soundFx.playSnap();
      this.showAlert('Le due password inserite non coincidono.', 'error');
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
