// Dedicated Full-Screen Onboarding & Authentication View for Piuccia Games

import { authManager } from '../core/AuthManager.js';
import { gameManager } from '../core/GameManager.js';
import { soundFx } from '../core/SoundFx.js';

export class AuthView {
  constructor(container) {
    this.container = container;
    this.currentTab = 'register'; // New users see registration by default
  }

  render() {
    this.container.innerHTML = `
      <div class="auth-view-screen">
        <!-- Ambient Glowing Background Pattern -->
        <div class="auth-view-backdrop-glow"></div>

        <div class="auth-view-container">
          <div class="auth-view-card">
            
            <!-- Brand Crest & Header -->
            <header class="auth-view-header">
              <div class="auth-view-avatar-wrap">
                <img src="/icons/icon-192.png?v=2" alt="Piuccia Games" class="auth-view-avatar-img" />
              </div>
              <h1 class="auth-view-brand-title">Piuccia Games</h1>
              <p class="auth-view-tagline">I grandi classici della tradizione da tavolo e di carte</p>
            </header>

            <!-- Navigation Tabs -->
            <div class="auth-view-tabs" role="tablist">
              <button type="button" class="auth-view-tab-btn ${this.currentTab === 'register' ? 'active' : ''}" id="auth-tab-register">
                <span>Registrati</span>
              </button>
              <button type="button" class="auth-view-tab-btn ${this.currentTab === 'login' ? 'active' : ''}" id="auth-tab-login">
                <span>Accedi</span>
              </button>
            </div>

            <!-- Feedback / Alert Banner -->
            <div class="auth-view-alert hidden" id="auth-view-alert"></div>

            <!-- REGISTRATION FORM -->
            <form class="auth-view-form ${this.currentTab === 'register' ? '' : 'hidden'}" id="auth-view-register-form">
              <p class="auth-view-form-intro">Crea il tuo profilo giocatore per accedere al circolo:</p>
              
              <div class="auth-field-group">
                <label for="view-reg-nickname">Nome Giocatore / Nickname</label>
                <div class="auth-field-input-box">
                  <span class="auth-field-icon">👤</span>
                  <input type="text" id="view-reg-nickname" name="nickname" placeholder="es. Piuccia, Mario..." required autocomplete="nickname" maxlength="24" />
                </div>
              </div>

              <div class="auth-field-group">
                <label for="view-reg-email">Indirizzo Email</label>
                <div class="auth-field-input-box">
                  <span class="auth-field-icon">✉️</span>
                  <input type="email" id="view-reg-email" name="email" placeholder="nome@esempio.it" required autocomplete="email" />
                </div>
              </div>

              <div class="auth-field-group">
                <label for="view-reg-password">Password (almeno 6 caratteri)</label>
                <div class="auth-field-input-box">
                  <span class="auth-field-icon">🔒</span>
                  <input type="password" id="view-reg-password" name="password" placeholder="Crea una password sicura" minlength="6" required autocomplete="new-password" />
                </div>
              </div>

              <div class="auth-field-group">
                <label for="view-reg-confirm">Conferma Password</label>
                <div class="auth-field-input-box">
                  <span class="auth-field-icon">🔐</span>
                  <input type="password" id="view-reg-confirm" name="confirmPassword" placeholder="Ripeti la password" minlength="6" required autocomplete="new-password" />
                </div>
              </div>

              <button type="submit" class="auth-view-submit-btn" id="view-reg-submit">
                <span class="btn-label">Registrati ed Entra</span>
                <span class="btn-spinner hidden"></span>
              </button>
            </form>

            <!-- LOGIN FORM -->
            <form class="auth-view-form ${this.currentTab === 'login' ? '' : 'hidden'}" id="auth-view-login-form">
              <p class="auth-view-form-intro">Inserisci le tue credenziali per accedere al tuo profilo:</p>

              <div class="auth-field-group">
                <label for="view-log-email">Indirizzo Email</label>
                <div class="auth-field-input-box">
                  <span class="auth-field-icon">✉️</span>
                  <input type="email" id="view-log-email" name="email" placeholder="nome@esempio.it" required autocomplete="email" />
                </div>
              </div>

              <div class="auth-field-group">
                <label for="view-log-password">Password</label>
                <div class="auth-field-input-box">
                  <span class="auth-field-icon">🔒</span>
                  <input type="password" id="view-log-password" name="password" placeholder="La tua password" required autocomplete="current-password" />
                </div>
              </div>

              <button type="submit" class="auth-view-submit-btn" id="view-log-submit">
                <span class="btn-label">Accedi ed Entra</span>
                <span class="btn-spinner hidden"></span>
              </button>
            </form>

            <footer class="auth-view-footer">
              <p class="auth-view-security-badge">
                <span>🛡️</span> Accesso sicuro e crittografato con Supabase
              </p>
            </footer>

          </div>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  attachEventListeners() {
    const regTabBtn = document.getElementById('auth-tab-register');
    const logTabBtn = document.getElementById('auth-tab-login');
    const regForm = document.getElementById('auth-view-register-form');
    const logForm = document.getElementById('auth-view-login-form');

    regTabBtn?.addEventListener('click', () => {
      soundFx.playSnap();
      this.currentTab = 'register';
      regTabBtn.classList.add('active');
      logTabBtn.classList.remove('active');
      regForm.classList.remove('hidden');
      logForm.classList.add('hidden');
      this.clearAlert();
    });

    logTabBtn?.addEventListener('click', () => {
      soundFx.playSnap();
      this.currentTab = 'login';
      logTabBtn.classList.add('active');
      regTabBtn.classList.remove('active');
      logForm.classList.remove('hidden');
      regForm.classList.add('hidden');
      this.clearAlert();
    });

    // Handle Registration
    regForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleRegister();
    });

    // Handle Login
    logForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleLogin();
    });
  }

  showAlert(msg, type = 'error') {
    const alertBox = document.getElementById('auth-view-alert');
    if (!alertBox) return;
    alertBox.className = `auth-view-alert ${type}`;
    alertBox.textContent = msg;
    alertBox.classList.remove('hidden');
  }

  clearAlert() {
    const alertBox = document.getElementById('auth-view-alert');
    if (!alertBox) return;
    alertBox.className = 'auth-view-alert hidden';
    alertBox.textContent = '';
  }

  setLoading(btnId, isLoading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const label = btn.querySelector('.btn-label');
    const spinner = btn.querySelector('.btn-spinner');
    btn.disabled = isLoading;
    if (isLoading) {
      label?.classList.add('hidden');
      spinner?.classList.remove('hidden');
    } else {
      label?.classList.remove('hidden');
      spinner?.classList.add('hidden');
    }
  }

  async handleRegister() {
    const nickname = document.getElementById('view-reg-nickname').value;
    const email = document.getElementById('view-reg-email').value;
    const password = document.getElementById('view-reg-password').value;
    const confirm = document.getElementById('view-reg-confirm').value;

    if (password !== confirm) {
      soundFx.playSnap();
      this.showAlert('Le due password inserite non coincidono.', 'error');
      return;
    }

    if (password.length < 6) {
      soundFx.playSnap();
      this.showAlert('La password deve contenere almeno 6 caratteri.', 'error');
      return;
    }

    this.clearAlert();
    this.setLoading('view-reg-submit', true);

    try {
      const res = await authManager.signUp({ email, password, nickname });
      soundFx.playWin();

      if (res.autoLoggedIn) {
        this.showAlert(`Benvenuto ${nickname}! Entro nel circolo dei giochi...`, 'success');
        setTimeout(() => {
          gameManager.setView('lobby');
        }, 600);
      } else {
        // Confirmation email notification
        this.showAlert(
          'Registrazione effettuata! Ti abbiamo inviato una email di conferma. Apri la posta e clicca sul link di conferma, poi accedi qui con la tua email.',
          'success'
        );
        setTimeout(() => {
          const logTabBtn = document.getElementById('auth-tab-login');
          logTabBtn?.click();
          const emailInput = document.getElementById('view-log-email');
          if (emailInput) emailInput.value = email;
        }, 4000);
      }
    } catch (err) {
      soundFx.playSnap();
      this.showAlert(err.message || 'Errore durante la registrazione. Riprova.', 'error');
    } finally {
      this.setLoading('view-reg-submit', false);
    }
  }

  async handleLogin() {
    const email = document.getElementById('view-log-email').value;
    const password = document.getElementById('view-log-password').value;

    this.clearAlert();
    this.setLoading('view-log-submit', true);

    try {
      await authManager.signIn({ email, password });
      soundFx.playWin();
      this.showAlert('Accesso confermato! Apertura del tavolo da gioco...', 'success');
      setTimeout(() => {
        gameManager.setView('lobby');
      }, 500);
    } catch (err) {
      soundFx.playSnap();
      this.showAlert(err.message || 'Errore durante l\'accesso. Controlla email e password.', 'error');
    } finally {
      this.setLoading('view-log-submit', false);
    }
  }
}
