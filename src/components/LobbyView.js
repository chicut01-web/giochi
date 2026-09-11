import { gameManager } from '../core/GameManager.js';
import { soundFx } from '../core/SoundFx.js';
import { pwaManager } from '../core/PwaManager.js';
import { authManager } from '../core/AuthManager.js';
import { authModal } from './AuthModal.js';

export class LobbyView {
  constructor(container) {
    this.container = container;
    this.pwaUnsub = null;
    this.authUnsub = authManager.onAuthChange(() => {
      if (gameManager.getView() === 'lobby') {
        this.render();
      }
    });
  }

  render() {
    const stats = gameManager.stats.scopa;
    const winRate = stats.matchesPlayed > 0 
      ? Math.round((stats.matchesWon / stats.matchesPlayed) * 100) 
      : 0;
    const isStandalone = pwaManager.checkIsStandalone();
    const isAuthenticated = authManager.isAuthenticated();
    const nickname = authManager.getNickname() || 'Giocatore';

    this.container.innerHTML = `
      <div class="lobby-container">
        <!-- Lobby Hero Header -->
        <header class="lobby-header">
          <div class="brand-badge">
            <div class="brand-avatar-wrapper">
              <img src="/icons/icon-192.png?v=2" alt="Piuccia Games" class="brand-avatar-img" />
            </div>
            <div class="brand-text">
              <h1 class="brand-title">Piuccia Games</h1>
              <p class="brand-tagline">I grandi classici della tradizione da tavolo e di carte</p>
            </div>
          </div>

          <div class="lobby-header-actions">
            ${isAuthenticated ? `
              <div class="user-profile-badge" id="lobby-user-badge" title="Giocatore Connesso: ${authManager.getUserEmail()}">
                <span class="user-avatar-icon">👤</span>
                <span class="user-nickname">${nickname}</span>
              </div>
              <button class="nav-btn auth-nav-btn logout-btn" id="lobby-logout-btn" title="Disconnettiti">
                <span>🚪 Esci</span>
              </button>
            ` : `
              <button class="nav-btn auth-nav-btn login-btn" id="lobby-login-btn" title="Accedi o registrati">
                <span>🔑 Accedi</span>
              </button>
            `}
            <button class="nav-btn install-app-btn ${isStandalone ? 'hidden' : ''}" id="lobby-install-btn" title="Installa l'applicazione sulla schermata Home">
              <span class="install-pulse-dot"></span>
              <span class="install-btn-icon">📲</span>
              <span class="install-btn-label">Installa App</span>
            </button>
            <button class="nav-btn" id="lobby-stats-btn" title="Statistiche">
              <span>📊 Statistiche</span>
            </button>
            <button class="nav-btn" id="lobby-rules-btn" title="Come si gioca">
              <span>📖 Guida</span>
            </button>
            <button class="nav-btn icon-only" id="lobby-sound-btn" title="Audio">
              <span id="lobby-sound-icon">${soundFx.isMuted() ? '🔇' : '🔊'}</span>
            </button>
          </div>
        </header>

        <!-- Main Catalog Section -->
        <main class="lobby-content">
          <div class="section-heading">
            <h2 class="section-title">Scegli il tuo Gioco</h2>
            <p class="section-desc">Seleziona una sala e sfida l'Intelligenza Artificiale.</p>
          </div>

          <div class="games-grid">
            <!-- GAME 1: SCOPA (ACTIVE) -->
            <article class="game-card active-game" id="card-scopa">
              <div class="card-status-pill status-ready">🟢 Disponibile Ora</div>
              
              <div class="game-card-banner banner-scopa">
                <div class="card-art-illustration">
                  <span class="scopa-pip pip-denari">🪙 7</span>
                  <span class="scopa-pip pip-coppe">🍷 1</span>
                  <span class="scopa-pip pip-spade">⚔️ R</span>
                </div>
                <div class="scopa-card-title-box">
                  <h3 class="game-title">Scopa</h3>
                  <span class="game-category">Carte Tradizionali Italiane</span>
                </div>
              </div>

              <div class="game-card-body">
                <p class="game-summary">
                  Il re indiscusso delle osterie e dei salotti italiani. Prendi a terra con singole e somme, conquista il Settebello e fai piazza pulita per gridare <strong>Scopa!</strong>
                </p>

                <!-- Game Config Selector -->
                <div class="game-mode-selector">
                  <label class="mode-label">Punteggio Partita:</label>
                  <div class="mode-options" id="scopa-target-options">
                    <button class="mode-btn ${gameManager.settings.targetPoints === 11 ? 'active' : ''}" data-target="11">11 Punti</button>
                    <button class="mode-btn ${gameManager.settings.targetPoints === 21 ? 'active' : ''}" data-target="21">21 Punti</button>
                    <button class="mode-btn ${gameManager.settings.targetPoints === 1 ? 'active' : ''}" data-target="1">1 Smazzata</button>
                  </div>
                </div>

                <div class="card-footer">
                  <button class="play-btn primary-btn" id="start-scopa-btn">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    <span>Gioca Ora a Scopa</span>
                  </button>
                </div>
              </div>
            </article>

            <!-- GAME 2: BRISCOLA (UPCOMING) -->
            <article class="game-card upcoming-game">
              <div class="card-status-pill status-upcoming">⏳ Prossimamente</div>
              <div class="game-card-banner banner-briscola">
                <div class="card-art-illustration">
                  <span class="scopa-pip">⚔️ Asso</span>
                  <span class="scopa-pip">🏆 Tre</span>
                </div>
                <div class="scopa-card-title-box">
                  <h3 class="game-title">Briscola</h3>
                  <span class="game-category">Prese & Strategia</span>
                </div>
              </div>
              <div class="game-card-body">
                <p class="game-summary">
                  Il gioco di prese più amato d'Italia. Gestisci i carichi, sfrutta il seme di briscola e porta a casa la vittoria fino a 61 punti.
                </p>
                <div class="card-footer">
                  <button class="play-btn disabled-btn" disabled>In Sviluppo</button>
                </div>
              </div>
            </article>

            <!-- GAME 3: TRESETTE (UPCOMING) -->
            <article class="game-card upcoming-game">
              <div class="card-status-pill status-upcoming">⏳ Prossimamente</div>
              <div class="game-card-banner banner-tresette">
                <div class="card-art-illustration">
                  <span class="scopa-pip">🪵 3</span>
                  <span class="scopa-pip">🍷 2</span>
                </div>
                <div class="scopa-card-title-box">
                  <h3 class="game-title">Tresette</h3>
                  <span class="game-category">Strategia Pura</span>
                </div>
              </div>
              <div class="game-card-body">
                <p class="game-summary">
                  Niente fortuna, solo memoria di ferro e intuito. Rispetta il palo, dichiara le accuse e conquista l'ultima presa per vincere.
                </p>
                <div class="card-footer">
                  <button class="play-btn disabled-btn" disabled>In Sviluppo</button>
                </div>
              </div>
            </article>

            <!-- GAME 4: SETTE E MEZZO (UPCOMING) -->
            <article class="game-card upcoming-game">
              <div class="card-status-pill status-upcoming">⏳ Prossimamente</div>
              <div class="game-card-banner banner-settemezzo">
                <div class="card-art-illustration">
                  <span class="scopa-pip">🪙 Re Bello</span>
                  <span class="scopa-pip">½</span>
                </div>
                <div class="scopa-card-title-box">
                  <h3 class="game-title">Sette e Mezzo</h3>
                  <span class="game-category">Banco & Rischio</span>
                </div>
              </div>
              <div class="game-card-body">
                <p class="game-summary">
                  Sfida il banco nel blackjack della tradizione italiana. Chiedi carta o stai attento a non sballare oltre il magico 7 e ½!
                </p>
                <div class="card-footer">
                  <button class="play-btn disabled-btn" disabled>In Sviluppo</button>
                </div>
              </div>
            </article>
          </div>
        </main>

        <!-- Stats Dialog -->
        <dialog class="app-dialog" id="lobby-stats-dialog">
          <div class="dialog-content">
            <h2 class="dialog-title">Statistiche Giocatore</h2>
            <div class="stats-grid">
              <div class="stat-card">
                <span class="stat-num">${stats.matchesPlayed}</span>
                <span class="stat-label">Partite Giocate</span>
              </div>
              <div class="stat-card">
                <span class="stat-num">${stats.matchesWon}</span>
                <span class="stat-label">Vittorie (${winRate}%)</span>
              </div>
              <div class="stat-card">
                <span class="stat-num">${stats.totalScope}</span>
                <span class="stat-label">Scope Totali</span>
              </div>
              <div class="stat-card">
                <span class="stat-num">${stats.totalSettebelli}</span>
                <span class="stat-label">Settebelli Conquistati</span>
              </div>
              <div class="stat-card">
                <span class="stat-num">${stats.highScore}</span>
                <span class="stat-label">Record Punti</span>
              </div>
            </div>
            <button class="dialog-cancel-btn" id="close-stats-btn">Chiudi</button>
          </div>
        </dialog>

        <!-- Rules Dialog -->
        <dialog class="app-dialog rules-dialog" id="lobby-rules-dialog">
          <div class="dialog-content">
            <h2 class="dialog-title">Regole Ufficiali della Scopa</h2>
            <div class="rules-body">
              <section>
                <h4>Obiettivo del Gioco</h4>
                <p>Cattura carte dal tavolo abbinando le carte della tua mano per conquistare punti a fine smazzata e realizzare Scope.</p>
              </section>
              <section>
                <h4>Regola di Presa Obbligatoria su Carta Singola</h4>
                <p>Se sul tavolo è presente una carta con valore identico a quella giocata, <strong>è obbligatorio prendere la carta singola</strong> (non è consentito prendere combinazioni di carte che sommano allo stesso valore).</p>
              </section>
              <section>
                <h4>Presa a Somma</h4>
                <p>Se e solo se non c'è una carta singola dello stesso valore, puoi prendere due o più carte la cui somma matematica equivale al valore della tua carta.</p>
              </section>
              <section>
                <h4>Punteggi a Fine Smazzata</h4>
                <ul>
                  <li><strong>Carte (1 pt):</strong> Chi ha preso più di 20 carte.</li>
                  <li><strong>Denari (1 pt):</strong> Chi ha preso più di 5 carte di denari.</li>
                  <li><strong>Settebello (1 pt):</strong> Chi ha preso il 7 di denari.</li>
                  <li><strong>Primiera (1 pt):</strong> Miglior combinazione con i 4 semi (7=21 pt, 6=18 pt, Asso=16 pt, 5=15 pt...).</li>
                  <li><strong>Scope (1 pt ciascuna):</strong> Ogni volta che svuoti il tavolo (tranne l'ultima presa).</li>
                </ul>
              </section>
            </div>
            <button class="dialog-cancel-btn" id="close-lobby-rules-btn">Chiudi</button>
          </div>
        </dialog>

        <!-- PWA Install Guide Dialog -->
        <dialog class="app-dialog pwa-install-dialog" id="lobby-install-dialog">
          <div class="dialog-content pwa-dialog-card">
            <div class="pwa-dialog-header">
              <img src="/icons/icon-192.png?v=2" alt="Icona App" class="pwa-dialog-badge-icon" />
              <div class="pwa-dialog-header-text">
                <h2 class="dialog-title">Installa sulla Schermata Home</h2>
                <p class="pwa-dialog-subtext">Gioca a tutto schermo senza la barra del browser, come una vera App nativa!</p>
              </div>
            </div>

            <div class="pwa-instructions" id="pwa-instructions-content">
              <!-- Rendered dynamically for iOS vs Android/Desktop -->
            </div>

            <div class="pwa-dialog-footer">
              <button class="dialog-cancel-btn" id="close-install-dialog-btn">Ho Capito</button>
            </div>
          </div>
        </dialog>
      </div>
    `;

    this.attachEventListeners();
  }

  attachEventListeners() {
    // Mode Buttons for Scopa target score
    const targetBtns = document.querySelectorAll('#scopa-target-options .mode-btn');
    targetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        targetBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const target = parseInt(btn.getAttribute('data-target'), 10);
        gameManager.saveSettings({ targetPoints: target });
      });
    });

    // Auth Buttons
    document.getElementById('lobby-login-btn')?.addEventListener('click', () => {
      soundFx.playSnap();
      authModal.open({ mode: 'login' });
    });

    document.getElementById('lobby-logout-btn')?.addEventListener('click', async () => {
      soundFx.playSnap();
      await authManager.signOut();
      this.render();
    });

    // Start Scopa Button (Enforce Login / Registration)
    document.getElementById('start-scopa-btn')?.addEventListener('click', () => {
      soundFx.playSnap();
      if (!authManager.isAuthenticated()) {
        authModal.open({
          mode: 'register',
          notice: 'Per iniziare a giocare a Scopa, registrati o accedi al tuo account!',
          onAuthenticated: () => {
            gameManager.setView('scopa');
          }
        });
        return;
      }
      gameManager.setView('scopa');
    });

    // Stats Dialog
    const statsBtn = document.getElementById('lobby-stats-btn');
    const statsDialog = document.getElementById('lobby-stats-dialog');
    const closeStatsBtn = document.getElementById('close-stats-btn');
    statsBtn?.addEventListener('click', () => statsDialog?.showModal());
    closeStatsBtn?.addEventListener('click', () => statsDialog?.close());

    // Rules Dialog
    const rulesBtn = document.getElementById('lobby-rules-btn');
    const rulesDialog = document.getElementById('lobby-rules-dialog');
    const closeRulesBtn = document.getElementById('close-lobby-rules-btn');
    rulesBtn?.addEventListener('click', () => rulesDialog?.showModal());
    closeRulesBtn?.addEventListener('click', () => rulesDialog?.close());

    // Sound Toggle
    const soundBtn = document.getElementById('lobby-sound-btn');
    soundBtn?.addEventListener('click', () => {
      const isMuted = soundFx.toggleMute();
      const soundIcon = document.getElementById('lobby-sound-icon');
      if (soundIcon) soundIcon.textContent = isMuted ? '🔇' : '🔊';
    });

    // PWA Install Action & Dialog
    const installBtn = document.getElementById('lobby-install-btn');
    const installDialog = document.getElementById('lobby-install-dialog');
    const closeInstallDialogBtn = document.getElementById('close-install-dialog-btn');
    const instructionsContent = document.getElementById('pwa-instructions-content');

    const updateInstallButtonVisibility = () => {
      const isStandalone = pwaManager.checkIsStandalone();
      if (installBtn) {
        if (isStandalone) {
          installBtn.classList.add('hidden');
        } else {
          installBtn.classList.remove('hidden');
        }
      }
    };

    installBtn?.addEventListener('click', async () => {
      soundFx.playSnap();
      const result = await pwaManager.promptInstall();
      
      if (result.method === 'native' && result.success) {
        updateInstallButtonVisibility();
        return;
      }

      // If iOS or manual browser guide needed, show dialog
      if (instructionsContent) {
        if (pwaManager.isIOS()) {
          instructionsContent.innerHTML = `
            <div class="pwa-steps-list">
              <div class="pwa-step-item">
                <div class="pwa-step-badge">1</div>
                <div class="pwa-step-desc">
                  Tocca il tasto <strong>Condividi</strong> 
                  <span class="ios-inline-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                      <polyline points="16 6 12 2 8 6"/>
                      <line x1="12" y1="2" x2="12" y2="15"/>
                    </svg>
                  </span>
                  nella barra in basso (o in alto su iPad) di Safari.
                </div>
              </div>
              <div class="pwa-step-item">
                <div class="pwa-step-badge">2</div>
                <div class="pwa-step-desc">
                  Scorri il menu e tocca <strong>"Aggiungi alla schermata Home"</strong> 
                  <span class="ios-inline-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="4"/>
                      <line x1="12" y1="8" x2="12" y2="16"/>
                      <line x1="8" y1="12" x2="16" y2="12"/>
                    </svg>
                  </span>.
                </div>
              </div>
              <div class="pwa-step-item">
                <div class="pwa-step-badge">3</div>
                <div class="pwa-step-desc">
                  Tocca <strong>"Aggiungi"</strong> in alto a destra. L'icona dell'app apparirà sulla tua Home e si aprirà a schermo intero senza barre!
                </div>
              </div>
            </div>
          `;
        } else {
          instructionsContent.innerHTML = `
            <div class="pwa-steps-list">
              <div class="pwa-step-item">
                <div class="pwa-step-badge">1</div>
                <div class="pwa-step-desc">
                  Apri il menu delle opzioni del browser (i <strong>3 puntini ⋮</strong> in alto o in basso).
                </div>
              </div>
              <div class="pwa-step-item">
                <div class="pwa-step-badge">2</div>
                <div class="pwa-step-desc">
                  Seleziona <strong>"Installa app"</strong> o <strong>"Aggiungi a schermata Home"</strong>.
                </div>
              </div>
              <div class="pwa-step-item">
                <div class="pwa-step-badge">3</div>
                <div class="pwa-step-desc">
                  Conferma per installarla sul dispositivo: si aprirà subito come una vera app!
                </div>
              </div>
            </div>
          `;
        }
      }

      installDialog?.showModal();
    });

    closeInstallDialogBtn?.addEventListener('click', () => {
      installDialog?.close();
    });

    // Subscribe to PWA changes
    if (this.pwaUnsub) this.pwaUnsub();
    this.pwaUnsub = pwaManager.subscribe(() => {
      updateInstallButtonVisibility();
    });
  }
}
