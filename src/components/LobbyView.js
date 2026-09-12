import { gameManager } from '../core/GameManager.js';
import { soundFx } from '../core/SoundFx.js';
import { pwaManager } from '../core/PwaManager.js';
import { authManager } from '../core/AuthManager.js';
import { authModal } from './AuthModal.js';
import { friendsModal } from './FriendsModal.js';
import { friendsManager } from '../core/FriendsManager.js';
import { icons } from '../utils/icons.js';

export class LobbyView {
  constructor(container) {
    this.container = container;
    this.pwaUnsub = null;
    this.friendsUnsub = null;
    this.joinedSessionId = null;
    this.authUnsub = authManager.onAuthChange(() => {
      if (gameManager.getView() === 'lobby') {
        this.render();
      }
    });
  }

  render() {
    this.joinedSessionId = null;
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
                <span class="user-avatar-icon">${icons.user({ size: 16 })}</span>
                <span class="user-nickname">${nickname}</span>
              </div>
              <button class="nav-btn friends-nav-btn" id="lobby-friends-btn" title="Circolo Amici & Sfide">
                <span class="friends-btn-icon">${icons.users({ size: 16 })}</span>
                <span>Amici</span>
                <span class="friends-pulse-badge hidden" id="lobby-friends-badge">0</span>
              </button>
              <button class="nav-btn auth-nav-btn logout-btn" id="lobby-logout-btn" title="Disconnettiti">
                ${icons.logOut({ size: 16 })}
                <span>Esci</span>
              </button>
            ` : `
              <button class="nav-btn auth-nav-btn login-btn" id="lobby-login-btn" title="Accedi o registrati">
                ${icons.key({ size: 16 })}
                <span>Accedi</span>
              </button>
            `}
            <button class="nav-btn install-app-btn ${isStandalone ? 'hidden' : ''}" id="lobby-install-btn" title="Installa l'applicazione sulla schermata Home">
              <span class="install-pulse-dot"></span>
              <span class="install-btn-icon">${icons.smartphone({ size: 16 })}</span>
              <span class="install-btn-label">Installa App</span>
            </button>
            <button class="nav-btn" id="lobby-stats-btn" title="Statistiche">
              ${icons.chart({ size: 16 })}
              <span>Statistiche</span>
            </button>
            <button class="nav-btn" id="lobby-rules-btn" title="Come si gioca">
              ${icons.bookOpen({ size: 16 })}
              <span>Guida</span>
            </button>
            <button class="nav-btn icon-only" id="lobby-sound-btn" title="Audio">
              <span id="lobby-sound-icon">${soundFx.isMuted() ? icons.volumeX({ size: 18 }) : icons.volume2({ size: 18 })}</span>
            </button>
          </div>
        </header>

        <!-- Live Challenges & Social Invites Banner -->
        <div class="lobby-challenges-container" id="lobby-challenges-container"></div>
        <div class="lobby-challenges-container" id="lobby-active-session-container"></div>

        <!-- Main Hero Showcase Section -->
        <main class="lobby-content">
          <div class="hero-arena-card" id="card-scopa">
            <!-- Left Side: Visual Card Fan with Real Dal Negro Neapolitan Cards -->
            <div class="hero-visual-showcase">
              <div class="cards-fan-container">
                <div class="fan-card fan-card-1">
                  <img src="/carte/31_Asso_di_bastoni.jpg" alt="Asso di Bastoni" class="fan-card-img" />
                </div>
                <div class="fan-card fan-card-2">
                  <img src="/carte/07_Sette_di_denari.jpg" alt="Il Settebello" class="fan-card-img" />
                  <div class="fan-card-badge">Settebello</div>
                </div>
                <div class="fan-card fan-card-3">
                  <img src="/carte/20_Dieci_di_coppe.jpg" alt="Re di Coppe" class="fan-card-img" />
                </div>
              </div>
              <div class="hero-authenticity-badge">
                <span class="badge-dot"></span>
                <span>Carte Napoletane Dal Negro • Tavolo Ufficiale</span>
              </div>
            </div>

            <!-- Right Side: Game Presentation & Launch Controls -->
            <div class="hero-controls-panel">
              <div class="hero-title-group">
                <div class="hero-tag-row">
                  <span class="hero-tag">Classico d'Autore</span>
                  <span class="hero-status-tag"><span class="status-live-dot"></span>Tavolo Attivo</span>
                </div>
                <h2 class="hero-game-title">Scopa Tradizionale</h2>
                <p class="hero-game-desc">
                  Il grande classico delle carte italiane. Cattura dal tavolo con singole o somme, conquista Settebello, Primiera, Denari e fai piazza pulita per gridare <strong>Scopa!</strong>
                </p>
              </div>

              <!-- Match Target Settings -->
              <div class="hero-settings-box">
                <div class="settings-label-row">
                  <span class="settings-title">${icons.target({ size: 16 })} Obiettivo Partita:</span>
                </div>
                <div class="mode-options" id="scopa-target-options">
                  <button class="mode-btn ${gameManager.settings.targetPoints === 11 ? 'active' : ''}" data-target="11">
                    <span class="mode-pts">11 Punti</span>
                    <span class="mode-sub">Classica</span>
                  </button>
                  <button class="mode-btn ${gameManager.settings.targetPoints === 21 ? 'active' : ''}" data-target="21">
                    <span class="mode-pts">21 Punti</span>
                    <span class="mode-sub">Lunga</span>
                  </button>
                  <button class="mode-btn ${gameManager.settings.targetPoints === 1 ? 'active' : ''}" data-target="1">
                    <span class="mode-pts">1 Smazzata</span>
                    <span class="mode-sub">Rapida</span>
                  </button>
                </div>
              </div>

              <!-- Quick Action Play Buttons -->
              <div class="hero-actions-row">
                <button class="hero-play-btn primary-btn" id="start-scopa-btn">
                  <span class="btn-icon-wrapper">${icons.play({ size: 22 })}</span>
                  <div class="btn-text-block">
                    <span class="btn-primary-text">Gioca Locale</span>
                    <span class="btn-secondary-text">Sfida l'Intelligenza Artificiale</span>
                  </div>
                </button>
                <button class="hero-multiplayer-btn secondary-btn" id="hero-multiplayer-btn">
                  <span class="btn-icon-wrapper">${icons.users({ size: 22 })}</span>
                  <div class="btn-text-block">
                    <span class="btn-primary-text">Sfida un Amico</span>
                    <span class="btn-secondary-text">Partita Online Privata</span>
                  </div>
                </button>
              </div>

              <!-- Real-Time Player Stats Strip -->
              <div class="hero-stats-strip">
                <div class="stat-pill">
                  <span class="stat-pill-num">${stats.matchesPlayed}</span>
                  <span class="stat-pill-lbl">Partite</span>
                </div>
                <div class="stat-pill">
                  <span class="stat-pill-num">${stats.matchesWon}</span>
                  <span class="stat-pill-lbl">Vittorie (${winRate}%)</span>
                </div>
                <div class="stat-pill">
                  <span class="stat-pill-num">${stats.totalScope}</span>
                  <span class="stat-pill-lbl">Scope</span>
                </div>
                <div class="stat-pill">
                  <span class="stat-pill-num">${stats.totalSettebelli}</span>
                  <span class="stat-pill-lbl">Settebelli</span>
                </div>
              </div>
            </div>
          </div>
        </main>

        <!-- Stats Dialog -->
        <dialog class="app-dialog" id="lobby-stats-dialog">
          <div class="dialog-content">
            <div class="dialog-header-row">
              <div class="dialog-title-with-icon">
                ${icons.chart({ size: 24, className: 'dialog-title-svg' })}
                <h2 class="dialog-title">Statistiche Giocatore</h2>
              </div>
              <button class="dialog-close-icon-btn" id="close-stats-icon-btn" title="Chiudi">${icons.close({ size: 20 })}</button>
            </div>
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
            <div class="dialog-header-row">
              <div class="dialog-title-with-icon">
                ${icons.bookOpen({ size: 24, className: 'dialog-title-svg' })}
                <h2 class="dialog-title">Regole Ufficiali della Scopa</h2>
              </div>
              <button class="dialog-close-icon-btn" id="close-lobby-rules-icon-btn" title="Chiudi">${icons.close({ size: 20 })}</button>
            </div>
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

    // Friends Modal Button
    document.getElementById('lobby-friends-btn')?.addEventListener('click', () => {
      soundFx.playSnap();
      friendsModal.open('friends');
    });

    // Subscribe to social updates and challenges
    if (this.friendsUnsub) this.friendsUnsub();
    this.friendsUnsub = friendsManager.subscribe((state) => {
      // Update badge in header
      const badge = document.getElementById('lobby-friends-badge');
      if (badge) {
        if (state.pendingBadgeCount > 0) {
          badge.textContent = state.pendingBadgeCount;
          badge.classList.remove('hidden');
        } else {
          badge.classList.add('hidden');
        }
      }

      // Render incoming game challenge banner
      const challengesBox = document.getElementById('lobby-challenges-container');
      if (challengesBox) {
        // Verifica se c'è una partita online in sospeso da mostrare come opzione (non forzata)
        this.updateActiveSessionBanner();

        if (state.incomingInvites.length === 0) {
          challengesBox.innerHTML = '';
        } else {
          challengesBox.innerHTML = state.incomingInvites.map(inv => `
            <div class="lobby-challenge-card" data-invite-id="${inv.id}">
              <div class="challenge-card-info">
                <span class="challenge-sword-icon">${icons.spade({ size: 22, color: '#f5c542' })}</span>
                <div class="challenge-text-box">
                  <span class="challenge-title">Nuova Sfida Ricevuta!</span>
                  <p class="challenge-msg"><strong>${inv.fromUsername}</strong> ti ha invitato a giocare a Scopa!</p>
                </div>
              </div>
              <div class="challenge-card-actions">
                <button class="challenge-play-btn" data-action="accept" data-invite-id="${inv.id}">
                  ${icons.check({ size: 16 })}
                  <span>Accetta e Gioca</span>
                </button>
                <button class="challenge-refuse-btn" data-action="decline" data-invite-id="${inv.id}">
                  ${icons.close({ size: 16 })}
                  <span>Rifiuta</span>
                </button>
              </div>
            </div>
          `).join('');

          challengesBox.querySelectorAll('button[data-action="accept"]').forEach(btn => {
            btn.addEventListener('click', async () => {
              const invId = btn.getAttribute('data-invite-id');
              soundFx.playWin();
              btn.disabled = true;
              btn.innerHTML = '<span>Avvio partita...</span>';

              try {
                const sessionId = await friendsManager.acceptGameInvite(invId);
                this.joinedSessionId = sessionId;
                friendsManager.handleSessionAutoJoin(sessionId);
              } catch (err) {
                alert(err.message || 'Impossibile avviare la partita.');
                btn.disabled = false;
                btn.innerHTML = '<span>Accetta e Gioca</span>';
              }
            });
          });

          challengesBox.querySelectorAll('button[data-action="decline"]').forEach(btn => {
            btn.addEventListener('click', async () => {
              const invId = btn.getAttribute('data-invite-id');
              soundFx.playSnap();
              btn.disabled = true;
              await friendsManager.respondToGameInvite(invId, false);
            });
          });
        }
      }
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

    // Hero Multiplayer Button (Challenge a friend online)
    document.getElementById('hero-multiplayer-btn')?.addEventListener('click', () => {
      soundFx.playSnap();
      if (!authManager.isAuthenticated()) {
        authModal.open({
          mode: 'register',
          notice: 'Per sfidare un amico online, registrati o accedi al tuo account!',
          onAuthenticated: () => {
            friendsModal.open();
          }
        });
        return;
      }
      friendsModal.open();
    });

    // Stats Dialog
    const statsBtn = document.getElementById('lobby-stats-btn');
    const statsDialog = document.getElementById('lobby-stats-dialog');
    const closeStatsBtn = document.getElementById('close-stats-btn');
    const closeStatsIconBtn = document.getElementById('close-stats-icon-btn');
    statsBtn?.addEventListener('click', () => statsDialog?.showModal());
    closeStatsBtn?.addEventListener('click', () => statsDialog?.close());
    closeStatsIconBtn?.addEventListener('click', () => statsDialog?.close());

    // Rules Dialog
    const rulesBtn = document.getElementById('lobby-rules-btn');
    const rulesDialog = document.getElementById('lobby-rules-dialog');
    const closeRulesBtn = document.getElementById('close-lobby-rules-btn');
    const closeRulesIconBtn = document.getElementById('close-lobby-rules-icon-btn');
    rulesBtn?.addEventListener('click', () => rulesDialog?.showModal());
    closeRulesBtn?.addEventListener('click', () => rulesDialog?.close());
    closeRulesIconBtn?.addEventListener('click', () => rulesDialog?.close());

    // Sound Toggle
    const soundBtn = document.getElementById('lobby-sound-btn');
    soundBtn?.addEventListener('click', () => {
      const isMuted = soundFx.toggleMute();
      const soundIcon = document.getElementById('lobby-sound-icon');
      if (soundIcon) soundIcon.innerHTML = isMuted ? icons.volumeX({ size: 18 }) : icons.volume2({ size: 18 });
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

  async updateActiveSessionBanner() {
    const activeBox = document.getElementById('lobby-active-session-container');
    if (!activeBox) return;

    if (!authManager.isAuthenticated()) {
      activeBox.innerHTML = '';
      return;
    }

    try {
      const sessionId = await friendsManager.findActiveSession();
      if (!sessionId || gameManager.getView() !== 'lobby') {
        activeBox.innerHTML = '';
        return;
      }

      activeBox.innerHTML = `
        <div class="lobby-challenge-card active-session-card">
          <div class="challenge-card-info">
            <span class="challenge-sword-icon">${icons.play({ size: 22, color: '#f5c542' })}</span>
            <div class="challenge-text-box">
              <span class="challenge-title">Partita Online in Sospeso</span>
              <p class="challenge-msg">Hai una partita a Scopa attiva non conclusa. Vuoi riprenderla o chiuderla?</p>
            </div>
          </div>
          <div class="challenge-card-actions">
            <button class="challenge-play-btn" id="btn-resume-active-session">
              ${icons.play({ size: 16 })}
              <span>Riprendi Partita</span>
            </button>
            <button class="challenge-refuse-btn" id="btn-abandon-active-session">
              ${icons.abandon({ size: 16, color: '#ff6b6b' })}
              <span>Abbandona / Chiudi</span>
            </button>
          </div>
        </div>
      `;

      document.getElementById('btn-resume-active-session')?.addEventListener('click', () => {
        soundFx.playSnap();
        gameManager.setView('scopa', { sessionId });
      });

      document.getElementById('btn-abandon-active-session')?.addEventListener('click', async () => {
        if (!confirm('Vuoi davvero abbandonare questa partita? Verrà considerata persa a tavolino.')) return;
        soundFx.playSnap();
        activeBox.innerHTML = '';
        await friendsManager.abandonSession(sessionId);
      });
    } catch (err) {
      console.warn('[LobbyView] Errore verifica sessione attiva:', err);
      activeBox.innerHTML = '';
    }
  }

  cleanup() {
    if (this.friendsUnsub) {
      this.friendsUnsub();
      this.friendsUnsub = null;
    }
  }
}
