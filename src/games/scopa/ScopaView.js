import { ScopaEngine } from './ScopaEngine.js';
import { LocalMatchController } from './LocalMatchController.js';
import { OnlineMatchController } from './OnlineMatchController.js';
import { renderCardSvg, renderCardBackSvg } from './ScopaCards.js';
import { soundFx } from '../../core/SoundFx.js';
import { gameManager } from '../../core/GameManager.js';
import { authManager } from '../../core/AuthManager.js';
import { authModal } from '../../components/AuthModal.js';

export class ScopaView {
  constructor(container) {
    this.container = container;
    this.match = null;
    this.view = null;
    this.unsubscribe = null;
    this.pendingMoves = [];
    this.lastProcessedMoveKey = null;
    this.currentTurnKey = null;
    this.isSubmittingMove = false;
    this.isAnimatingQueue = false;
    this.timerSeconds = 10;
    this.timerInterval = null;
    this.timerRole = null;
    this.isTimerPaused = false;
  }

  cleanup() {
    this.stopTurnTimer();
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.match) {
      this.match.destroy();
      this.match = null;
    }
    this.view = null;
    this.pendingMoves = [];
    this.lastProcessedMoveKey = null;
    this.currentTurnKey = null;
    this.isSubmittingMove = false;
    this.isAnimatingQueue = false;
    document.querySelectorAll('.flying-card-live').forEach(el => el.remove());
  }

  init(options = {}) {
    if (!authManager.isAuthenticated()) {
      gameManager.setView('lobby');
      authModal.open({
        mode: 'register',
        notice: 'Per giocare a Scopa, registrati o accedi con il tuo account!',
        onAuthenticated: () => {
          gameManager.setView('scopa', options);
        }
      });
      return;
    }

    const target = options.targetScore || gameManager.settings.targetPoints || 11;
    this.cleanup();

    this.match = options.sessionId
      ? new OnlineMatchController({ sessionId: options.sessionId })
      : new LocalMatchController({
          targetScore: target,
          username: authManager.getNickname() || 'Tu'
        });

    this.unsubscribe = this.match.onChange(view => this.onMatchUpdate(view));
    this.renderLayout();
    this.match.start();
  }

  getMoveKey(view) {
    if (!view || !view.lastMove) return null;
    const lm = view.lastMove;
    const cardId = lm.card?.id || 'none';
    const caps = (lm.capturedCards || []).map(c => c.id).sort().join('-');
    const ver = view.version !== undefined ? `v${view.version}` : 'v0';
    return `${ver}_seat${lm.seat}_c${cardId}_cap[${caps}]_scopa${lm.isScopa ? 1 : 0}_rnd${view.roundNumber}`;
  }

  onMatchUpdate(view) {
    this.view = view;
    if (!view) return;

    // Se la partita è stata abbandonata da un giocatore
    if (view.status === 'abandoned') {
      this.stopTurnTimer();
      this.isSubmittingMove = false;
      this.isAnimatingQueue = false;
      const isWinner = view.matchWinnerSeat === view.you?.seat;
      this.showAbandonedModal(isWinner);
      return;
    }

    // Se la partita è terminata
    if (view.status === 'finished' && view.isMatchOver) {
      this.stopTurnTimer();
      this.isSubmittingMove = false;
      this.isAnimatingQueue = false;
      this.updateBoard();
      if (view.roundResult) {
        setTimeout(() => this.showRoundSummary(view.roundResult), 600);
      }
      return;
    }

    const moveKey = this.getMoveKey(view);

    // Primo aggiornamento della vista: sincronizza il tavolo senza rianimare mosse passate
    if (this.lastProcessedMoveKey === null) {
      this.lastProcessedMoveKey = moveKey;
      this.updateBoard();
      this.syncTurnState();
      return;
    }

    // Nuova mossa effettiva ricevuta
    if (moveKey && moveKey !== this.lastProcessedMoveKey) {
      this.lastProcessedMoveKey = moveKey;
      this.pendingMoves.push(view.lastMove);
      this.drainMoveQueue();
      return;
    }

    // Poll periodico o duplicato: aggiorna solo se non c'è un'animazione in volo
    if (this.isAnimatingQueue) return;
    this.updateBoard();
    this.syncTurnState();
  }

  async drainMoveQueue() {
    if (this.isAnimatingQueue) return;
    this.isAnimatingQueue = true;

    try {
      while (this.pendingMoves.length > 0) {
        const move = this.pendingMoves.shift();
        await this.playMoveSequence(move);
        if (this.view && (this.view.isRoundOver || this.view.isMatchOver)) break;
      }
    } finally {
      this.isAnimatingQueue = false;
      this.updateBoard();
      this.syncTurnState();
    }
  }

  syncTurnState() {
    if (!this.view || this.view.status !== 'active') return;

    if (this.view.isRoundOver || this.view.isMatchOver) {
      this.stopTurnTimer();
      return;
    }

    const role = this.view.isYourTurn ? 'player' : 'cpu';
    const turnKey = `${this.view.version || 0}_${this.view.isYourTurn ? 1 : 2}_rnd${this.view.roundNumber}`;

    if (this.currentTurnKey === turnKey && this.timerInterval) {
      // Il turno è già attivo: sincronizza solo in caso di drift server > 2s
      if (this.view.turnDeadline) {
        const remainingMs = new Date(this.view.turnDeadline).getTime() - Date.now();
        const serverSec = Math.max(0, Math.ceil(remainingMs / 1000));
        if (Math.abs(this.timerSeconds - serverSec) > 2) {
          this.timerSeconds = serverSec;
          this.updateTimerDisplay();
        }
      }
      return;
    }

    this.currentTurnKey = turnKey;
    this.startTurnTimer(role);

    if (this.view.isYourTurn) {
      this.setNarrator('👤', `È il tuo turno: seleziona una carta da giocare (${this.timerSeconds}s)`);
    } else {
      this.setNarrator(
        this.view.mode === 'local' ? '🤖' : '👤',
        `Turno di ${this.view.opponent.username}...`
      );
    }
  }

  showAbandonedModal(isWinner) {
    const existing = document.getElementById('abandon-result-dialog');
    if (existing) existing.remove();

    const dialog = document.createElement('dialog');
    dialog.id = 'abandon-result-dialog';
    dialog.className = 'app-dialog';
    dialog.innerHTML = `
      <div class="dialog-content">
        <h2 class="dialog-title ${isWinner ? 'winner-title' : 'loser-title'}">
          ${isWinner ? '🏆 Vittoria a Tavolino!' : 'Partita Terminata'}
        </h2>
        <p class="dialog-desc">
          ${isWinner 
            ? `${this.view?.opponent?.username || 'L\'avversario'} ha abbandonato la partita. Hai vinto!` 
            : 'Hai abbandonato la partita.'}
        </p>
        <div class="modal-actions">
          <button class="primary-btn" id="abandon-back-lobby-btn">Torna alla Lobby</button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);
    dialog.showModal();

    document.getElementById('abandon-back-lobby-btn')?.addEventListener('click', () => {
      dialog.close();
      dialog.remove();
      this.cleanup();
      gameManager.setView('lobby');
    });
  }

  renderLayout() {
    const target = this.match?.targetScore || gameManager.settings.targetPoints || 11;
    this.container.innerHTML = `
      <div class="scopa-arena" id="scopa-arena">
        <!-- Top Navigation, Score Bar, and Turn Timer -->
        <header class="scopa-header">
          <button class="scopa-btn icon-btn" id="scopa-back-btn" title="Torna alla Lobby">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            <span class="btn-text">Lobby</span>
          </button>

          <div class="scoreboard-pill">
            <div class="score-team player-team">
              <span class="team-label" id="player-label">Tu</span>
              <span class="team-score" id="score-player">0</span>
            </div>
            <div class="score-divider">
              <span class="target-badge" id="target-badge"><span class="target-label">Obiettivo: </span>${target} pt</span>
            </div>
            <div class="score-team cpu-team">
              <span class="team-score" id="score-cpu">0</span>
              <span class="team-label" id="cpu-label">CPU</span>
            </div>
          </div>

          <!-- 10/25-Second Turn Timer Pill -->
          <div class="turn-timer-pill" id="turn-timer-pill" title="Tempo rimanente per la giocata">
            <div class="timer-circle-wrap">
              <svg viewBox="0 0 36 36" class="timer-svg">
                <path class="timer-track" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                <path class="timer-fill" id="timer-fill" stroke-dasharray="100, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              </svg>
              <span class="timer-seconds" id="timer-seconds">10</span>
            </div>
            <div class="timer-info">
              <span class="timer-role" id="timer-role">Turno Tuo</span>
              <span class="timer-sub" id="timer-sub-seconds">10s max</span>
            </div>
          </div>

          <div class="header-actions">
            <button class="abandon-match-btn hidden" id="abandon-match-btn" title="Abbandona la partita">Abbandona</button>
            <span class="reconnect-notice hidden" id="reconnect-notice">Riconnessione…</span>
            <button class="scopa-btn icon-btn" id="scopa-sound-btn" title="Attiva/Disattiva Audio">
              <span id="sound-icon">${soundFx.isMuted() ? '🔇' : '🔊'}</span>
            </button>
            <button class="scopa-btn icon-btn" id="scopa-rules-btn" title="Regole della Scopa">
              <span class="btn-icon">📖</span>
              <span class="btn-text">Regole</span>
            </button>
          </div>
        </header>

        <!-- Main Felt Table -->
        <main class="felt-table" id="felt-table">
          <!-- Opponent Zone (CPU or Friend) -->
          <div class="player-zone cpu-zone">
            <div class="avatar-badge">
              <div class="avatar-icon cpu-avatar" id="opponent-avatar-icon">🤖</div>
              <div class="avatar-info">
                <span class="avatar-name" id="opponent-name">CPU Master</span>
                <span class="avatar-sub" id="cpu-scope-count">Scope: 0</span>
              </div>
            </div>

            <div class="hand-container cpu-hand" id="cpu-hand">
              <!-- Opponent Cards Face Down -->
            </div>

            <div class="capture-pile cpu-pile" id="cpu-pile" title="Mazzo prese avversario">
              <div class="pile-card-stack" id="cpu-pile-stack">
                <div class="empty-pile-placeholder">0</div>
              </div>
              <span class="pile-count" id="cpu-pile-count">Prese: 0</span>
            </div>
          </div>

          <!-- Central Table Area -->
          <div class="table-center-zone">
            <!-- Deck stack on left -->
            <div class="deck-container" id="deck-container">
              <div class="deck-stack" id="deck-stack">
                <div class="deck-card-back">
                  ${renderCardBackSvg()}
                </div>
              </div>
              <span class="deck-counter" id="deck-counter">Mazzo: 30</span>
            </div>

            <!-- Active Table Cards -->
            <div class="table-cards-field" id="table-cards-field">
              <!-- Table Cards go here -->
            </div>

            <!-- Played Card Spotlight (Focal Center Stage) -->
            <div class="played-card-spotlight" id="played-card-spotlight" style="display: none;">
              <div class="spotlight-badge" id="spotlight-badge">Carta Giocata</div>
              <div class="spotlight-card-wrap" id="spotlight-card-wrap"></div>
            </div>

            <!-- Action Narrator Banner & Turn Box -->
            <div class="table-info-box">
              <div class="action-narrator" id="action-narrator">
                <span class="narrator-icon" id="narrator-icon">🎯</span>
                <span class="narrator-text" id="narrator-text">È il tuo turno: seleziona una carta</span>
              </div>
            </div>
          </div>

          <!-- Player Zone -->
          <div class="player-zone user-zone">
            <div class="avatar-badge">
              <div class="avatar-icon user-avatar">👤</div>
              <div class="avatar-info">
                <span class="avatar-name" id="player-name">${authManager.getNickname() || 'Tu'}</span>
                <span class="avatar-sub" id="player-scope-count">Scope: 0</span>
              </div>
            </div>

            <div class="hand-container player-hand" id="player-hand">
              <!-- Player Cards Face Up Interactive -->
            </div>

            <div class="capture-pile player-pile" id="player-pile" title="Le tue prese">
              <div class="pile-card-stack" id="player-pile-stack">
                <div class="empty-pile-placeholder">0</div>
              </div>
              <span class="pile-count" id="player-pile-count">Prese: 0</span>
            </div>
          </div>

          <!-- Scopa Celebration Splash Banner -->
          <div class="scopa-banner" id="scopa-banner">
            <div class="scopa-banner-glow"></div>
            <div class="scopa-banner-text">✨ SCOPA! ✨</div>
            <div class="scopa-banner-sub">+1 PUNTO</div>
          </div>
        </main>

        <!-- Modal Dialog: Capture Choice Selector -->
        <dialog class="app-dialog" id="capture-choice-dialog">
          <div class="dialog-content">
            <h3 class="dialog-title">Scegli la Presa</h3>
            <p class="dialog-desc">Hai più combinazioni possibili di somma per questa carta. Scegli quali carte raccogliere:</p>
            <div class="capture-options-grid" id="capture-options-grid"></div>
            <button class="dialog-cancel-btn" id="cancel-capture-choice-btn">Annulla Mossa</button>
          </div>
        </dialog>

        <!-- Modal Dialog: Round Score Recap -->
        <dialog class="app-dialog round-modal" id="round-score-dialog">
          <div class="dialog-content">
            <h2 class="dialog-title" id="round-modal-title">Fine Smazzata</h2>
            <div class="round-scores-table" id="round-scores-table"></div>
            <div class="modal-actions">
              <button class="primary-btn" id="next-round-btn">Continua la Partita</button>
            </div>
          </div>
        </dialog>

        <!-- Modal Dialog: Rules Guide -->
        <dialog class="app-dialog rules-dialog" id="scopa-rules-dialog">
          <div class="dialog-content">
            <h2 class="dialog-title">Regole della Scopa</h2>
            <div class="rules-body">
              <section>
                <h4>Obiettivo & Tempo di Turno</h4>
                <p>Cattura le carte sul tavolo abbinando una carta della tua mano. Ogni giocatore ha un tempo limite per effettuare la giocata (10s locale, 25s online). Se il tempo scade, viene eseguita una mossa automatica.</p>
              </section>
              <section>
                <h4>Regole di Presa Ufficiali</h4>
                <ul>
                  <li><strong>Presa Diretta:</strong> Se hai una carta dello stesso valore di una sul tavolo, sei <em>obbligato</em> a prendere quella singola carta (non puoi prendere la somma).</li>
                  <li><strong>Presa a Somma:</strong> Se non c'è una carta singola con lo stesso valore, puoi prendere due o più carte la cui somma è pari al valore giocato.</li>
                  <li><strong>Scarto:</strong> Se non puoi prendere nulla, la tua carta resta a terra sul tavolo.</li>
                </ul>
              </section>
              <section>
                <h4>La "Scopa!" (+1 punto)</h4>
                <p>Se con una presa svuoti completamente il tavolo, fai <strong>Scopa!</strong> e guadagni 1 punto. L'ultima presa dell'ultima mano non conta come scopa.</p>
              </section>
              <section>
                <h4>Conteggio Punti a Fine Smazzata</h4>
                <ul>
                  <li><strong>Carte:</strong> 1 punto a chi ha preso più di 20 carte.</li>
                  <li><strong>Denari (Ori):</strong> 1 punto a chi ha preso più di 5 carte di Denari.</li>
                  <li><strong>Settebello:</strong> 1 punto a chi ha preso il 7 di Denari.</li>
                  <li><strong>Primiera:</strong> 1 punto per la migliore combinazione dei 4 semi (7=21, 6=18, Asso=16, 5=15...).</li>
                  <li><strong>Scope:</strong> 1 punto per ogni scopa realizzata durante il gioco.</li>
                </ul>
              </section>
            </div>
            <button class="dialog-cancel-btn" id="close-rules-btn">Chiudi</button>
          </div>
        </dialog>
      </div>
    `;

    this.attachEventListeners();
  }

  attachEventListeners() {
    // Back to Lobby
    document.getElementById('scopa-back-btn')?.addEventListener('click', () => {
      if (this.view?.mode === 'online' && this.view?.status === 'active' && !this.view?.isMatchOver) {
        if (!confirm('Tornare alla Lobby? La partita rimarrà attiva e potrai riprenderla dalla Lobby, oppure puoi abbandonarla con "Abbandona".')) {
          return;
        }
      }
      this.cleanup();
      gameManager.setView('lobby');
    });

    // Abandon match button (multiplayer online)
    document.getElementById('abandon-match-btn')?.addEventListener('click', async () => {
      if (!confirm('Vuoi abbandonare la partita? Il tuo avversario vincerà a tavolino.')) return;
      soundFx.playSnap();
      await this.match?.concede();
      this.cleanup();
      gameManager.setView('lobby');
    });

    // Sound Toggle
    const soundBtn = document.getElementById('scopa-sound-btn');
    soundBtn?.addEventListener('click', () => {
      const isMuted = soundFx.toggleMute();
      const soundIcon = document.getElementById('sound-icon');
      if (soundIcon) soundIcon.textContent = isMuted ? '🔇' : '🔊';
    });

    // Rules Dialog
    const rulesBtn = document.getElementById('scopa-rules-btn');
    const rulesDialog = document.getElementById('scopa-rules-dialog');
    const closeRulesBtn = document.getElementById('close-rules-btn');
    rulesBtn?.addEventListener('click', () => {
      this.pauseTimer();
      rulesDialog?.showModal();
    });
    closeRulesBtn?.addEventListener('click', () => {
      rulesDialog?.close();
      this.resumeTimer();
    });

    // Next Round Button
    document.getElementById('next-round-btn')?.addEventListener('click', async () => {
      const dialog = document.getElementById('round-score-dialog');
      dialog?.close();
      this.isSubmittingMove = false;
      this.stopTurnTimer();

      if (this.view?.isMatchOver) {
        this.cleanup();
        gameManager.setView('lobby');
      } else {
        soundFx.playDeal();
        await this.match?.nextRound();
      }
    });

    // Cancel Capture Choice Button & Dialog Escape
    const choiceDialog = document.getElementById('capture-choice-dialog');
    document.getElementById('cancel-capture-choice-btn')?.addEventListener('click', () => {
      choiceDialog?.close();
      this.isSubmittingMove = false;
      this.resumeTimer();
    });
    choiceDialog?.addEventListener('cancel', () => {
      this.isSubmittingMove = false;
      this.resumeTimer();
    });
  }

  /* =========================================================================
     TURN TIMER MANAGEMENT
     ========================================================================= */

  startTurnTimer(role) {
    this.stopTurnTimer();
    if (!this.view || this.view.isRoundOver || this.view.isMatchOver) return;

    this.timerRole = role;

    if (this.view.turnDeadline) {
      const remainingMs = new Date(this.view.turnDeadline).getTime() - Date.now();
      this.timerSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    } else {
      this.timerSeconds = this.view.turnSeconds || 10;
    }

    this.updateTimerDisplay();

    this.timerInterval = setInterval(() => {
      if (this.isTimerPaused) return;

      if (this.view?.turnDeadline) {
        const remainingMs = new Date(this.view.turnDeadline).getTime() - Date.now();
        this.timerSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
      } else {
        this.timerSeconds -= 1;
      }

      this.updateTimerDisplay();

      if (this.timerSeconds <= 0) {
        this.stopTurnTimer();
        this.onTimerExpired();
      }
    }, 1000);
  }

  stopTurnTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  pauseTimer() {
    this.isTimerPaused = true;
  }

  resumeTimer() {
    this.isTimerPaused = false;
  }

  updateTimerDisplay() {
    const secEl = document.getElementById('timer-seconds');
    const fillEl = document.getElementById('timer-fill');
    const roleEl = document.getElementById('timer-role');
    const pillEl = document.getElementById('turn-timer-pill');
    const subSecEl = document.getElementById('timer-sub-seconds');
    if (!secEl || !fillEl || !pillEl) return;

    const maxSec = this.view?.turnSeconds || 10;
    if (subSecEl) subSecEl.textContent = `${maxSec}s max`;

    secEl.textContent = Math.max(0, this.timerSeconds);
    const pct = Math.max(0, (this.timerSeconds / maxSec) * 100);
    fillEl.setAttribute('stroke-dasharray', `${pct}, 100`);

    if (this.timerRole === 'player') {
      roleEl.textContent = 'Turno Tuo';
      pillEl.className = `turn-timer-pill timer-player ${this.timerSeconds <= 3 ? 'timer-urgent' : ''}`;
    } else {
      const oppName = this.view?.mode === 'local' ? 'CPU' : (this.view?.opponent?.username || 'Avversario');
      roleEl.textContent = `Turno ${oppName}`;
      pillEl.className = `turn-timer-pill timer-cpu ${this.timerSeconds <= 3 ? 'timer-urgent' : ''}`;
    }
  }

  onTimerExpired() {
    if (!this.view || this.view.status !== 'active' || this.view.isRoundOver) return;

    this.isSubmittingMove = false;
    const choiceDialog = document.getElementById('capture-choice-dialog');
    if (choiceDialog?.open) choiceDialog.close();

    this.setNarrator('⌛', 'Tempo scaduto! Mossa automatica...');
    this.match?.claimTimeout();
  }

  /* =========================================================================
     BOARD RENDERING
     ========================================================================= */

  updateBoard() {
    if (!this.view) return;
    if (!this.isAnimatingQueue) {
      document.querySelectorAll('.flying-card-live').forEach(el => el.remove());
    }

    // Aggiornamento nomi e avatar avversario
    const oppName = document.getElementById('opponent-name');
    if (oppName) oppName.textContent = this.view.opponent.username;

    const oppIcon = document.getElementById('opponent-avatar-icon');
    if (oppIcon) oppIcon.textContent = this.view.mode === 'local' ? '🤖' : '👤';

    const oppLabel = document.getElementById('cpu-label');
    if (oppLabel) oppLabel.textContent = this.view.mode === 'local' ? 'CPU' : this.view.opponent.username;

    const oppSub = document.getElementById('cpu-scope-count');
    if (oppSub) oppSub.textContent = `Scope: ${this.view.opponent.scope}`;

    // Scores
    const pScoreEl = document.getElementById('score-player');
    const cScoreEl = document.getElementById('score-cpu');
    if (pScoreEl) pScoreEl.textContent = this.view.you.matchScore;
    if (cScoreEl) cScoreEl.textContent = this.view.opponent.matchScore;

    // Scope counts
    const pScopeEl = document.getElementById('player-scope-count');
    if (pScopeEl) pScopeEl.textContent = `Scope: ${this.view.you.scope}`;

    // Deck Count
    const deckCountEl = document.getElementById('deck-counter');
    const deckStackEl = document.getElementById('deck-stack');
    if (deckCountEl) deckCountEl.textContent = `Mazzo: ${this.view.deckCount}`;
    if (deckStackEl) {
      deckStackEl.style.opacity = this.view.deckCount > 0 ? '1' : '0.2';
    }

    // Target badge
    const targetBadge = document.getElementById('target-badge');
    if (targetBadge && this.match?.targetScore) {
      targetBadge.innerHTML = `<span class="target-label">Obiettivo: </span>${this.match.targetScore} pt`;
    }

    // Multiplayer controls
    const abandonBtn = document.getElementById('abandon-match-btn');
    if (abandonBtn) abandonBtn.classList.toggle('hidden', this.view.mode !== 'online');

    const notice = document.getElementById('reconnect-notice');
    if (notice) notice.classList.toggle('hidden', this.view.connected !== false);

    // Capture piles
    this.updateCapturePiles();

    // Table Cards
    this.renderTableCards();

    // Hands
    this.renderCpuHand();
    this.renderPlayerHand();
  }

  updateCapturePiles() {
    const pPileStack = document.getElementById('player-pile-stack');
    const cPileStack = document.getElementById('cpu-pile-stack');
    const pPileCount = document.getElementById('player-pile-count');
    const cPileCount = document.getElementById('cpu-pile-count');

    if (pPileCount) pPileCount.textContent = `Prese: ${this.view.you.captureCount}`;
    if (cPileCount) cPileCount.textContent = `Prese: ${this.view.opponent.captureCount}`;

    if (pPileStack) {
      if (this.view.you.captureCount > 0) {
        pPileStack.innerHTML = `
          <div class="captured-card-top">
            ${renderCardBackSvg()}
            <div class="pile-badge">${this.view.you.captureCount}</div>
          </div>
        `;
      } else {
        pPileStack.innerHTML = '<div class="empty-pile-placeholder">0</div>';
      }
    }

    if (cPileStack) {
      if (this.view.opponent.captureCount > 0) {
        cPileStack.innerHTML = `
          <div class="captured-card-top">
            ${renderCardBackSvg()}
            <div class="pile-badge">${this.view.opponent.captureCount}</div>
          </div>
        `;
      } else {
        cPileStack.innerHTML = '<div class="empty-pile-placeholder">0</div>';
      }
    }
  }

  renderTableCards() {
    const field = document.getElementById('table-cards-field');
    if (!field) return;

    if (!this.view.tableCards || this.view.tableCards.length === 0) {
      field.innerHTML = '<div class="empty-table-msg">Il tavolo è sgombro</div>';
      return;
    }

    field.innerHTML = this.view.tableCards.map((card, idx) => {
      const rotation = ((card.value * 5 + idx * 7) % 7) - 3;
      return `
        <div class="card-wrapper table-card" 
             id="table-card-${card.id}" 
             data-card-id="${card.id}"
             style="transform: rotate(${rotation}deg);">
          ${renderCardSvg(card, true)}
        </div>
      `;
    }).join('');
  }

  renderCpuHand() {
    const container = document.getElementById('cpu-hand');
    if (!container) return;

    const count = this.view.opponent.handCount || 0;
    container.innerHTML = Array.from({ length: count }).map((_, idx) => {
      const rot = (idx - (count - 1) / 2) * 2.5;
      return `
        <div class="card-wrapper cpu-card" style="transform: rotate(${rot}deg);">
          ${renderCardBackSvg()}
        </div>
      `;
    }).join('');
  }

  renderPlayerHand() {
    const container = document.getElementById('player-hand');
    if (!container) return;

    const hand = this.view.you.hand || [];
    container.innerHTML = hand.map((card, idx) => {
      const total = hand.length;
      const rot = (idx - (total - 1) / 2) * 2.5;
      const isTurn = this.view.isYourTurn && !this.isSubmittingMove && !this.isAnimatingQueue;

      return `
        <button class="card-wrapper player-card ${isTurn ? 'card-playable' : 'card-disabled'}" 
                id="player-card-${card.id}" 
                data-card-id="${card.id}" 
                title="${card.name}"
                style="--fan-rot: ${rot}deg;"
                ${!isTurn ? 'disabled' : ''}>
          ${renderCardSvg(card, true)}
        </button>
      `;
    }).join('');

    container.querySelectorAll('.player-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const cardId = btn.getAttribute('data-card-id');
        this.onPlayerCardClick(cardId);
      });
    });
  }

  setNarrator(icon, text) {
    const iconEl = document.getElementById('narrator-icon');
    const textEl = document.getElementById('narrator-text');
    if (iconEl) iconEl.textContent = icon;
    if (textEl) textEl.textContent = text;
  }

  /* =========================================================================
     PLAYER INTERACTIONS & CAPTURE CHOICE
     ========================================================================= */

  async onPlayerCardClick(cardId) {
    if (this.isSubmittingMove || this.isAnimatingQueue) return;
    if (!this.view || this.view.isRoundOver || this.view.isMatchOver) return;

    if (!this.view.isYourTurn) {
      this.setNarrator('⏳', 'Non è il tuo turno! Attendi l\'avversario.');
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(15); } catch (e) {}
    }

    const card = this.view.you.hand.find(c => c.id === cardId);
    if (!card) return;

    const probe = ScopaEngine.deserialize({ tableCards: this.view.tableCards });
    const captureOptions = probe.getCaptureOptions(card, this.view.tableCards);

    // If multiple sum combinations exist, show selection dialog
    if (captureOptions.type === 'sum' && captureOptions.options.length > 1) {
      this.pauseTimer();
      this.promptCaptureChoice(card, captureOptions.options);
      return;
    }

    const chosenCombo = captureOptions.options.length > 0 ? captureOptions.options[0] : null;
    this.isSubmittingMove = true;
    try {
      const res = await this.match.playCard(card.id, chosenCombo);
      if (!res.ok) {
        this.handleMoveError(res.error);
      }
    } finally {
      this.isSubmittingMove = false;
    }
  }

  handleMoveError(error) {
    if (error === 'not_your_turn') {
      this.setNarrator('⏳', 'Non è il tuo turno! Attendi l\'avversario.');
    } else if (error === 'version_conflict') {
      this.setNarrator('🔄', 'Partita risincronizzata dal server, riprova la mossa.');
    } else if (error === 'card_not_in_hand') {
      this.setNarrator('⚠️', 'Questa carta non è più disponibile nella tua mano.');
    } else if (error === 'match_not_active') {
      this.setNarrator('🏁', 'La partita non è più attiva.');
    } else {
      this.setNarrator('⚠️', 'Mossa non valida, riprova.');
    }
  }

  promptCaptureChoice(playedCard, options) {
    const dialog = document.getElementById('capture-choice-dialog');
    const grid = document.getElementById('capture-options-grid');
    if (!dialog || !grid) return;

    grid.innerHTML = options.map((combo, idx) => {
      const cardsHtml = combo.map(c => `
        <div class="mini-card-preview">
          ${renderCardSvg(c, true)}
        </div>
      `).join('');

      return `
        <div class="capture-choice-card" data-option-idx="${idx}">
          <div class="choice-cards-row">${cardsHtml}</div>
          <button class="choice-select-btn primary-btn">Prendi questa combinazione</button>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('.capture-choice-card').forEach(cardEl => {
      cardEl.addEventListener('click', async () => {
        const idx = parseInt(cardEl.getAttribute('data-option-idx'), 10);
        dialog.close();
        this.resumeTimer();
        this.isSubmittingMove = true;
        try {
          const res = await this.match.playCard(playedCard.id, options[idx]);
          if (!res.ok) {
            this.handleMoveError(res.error);
          }
        } finally {
          this.isSubmittingMove = false;
        }
      });
    });

    if (!dialog.open) dialog.showModal();
  }

  /* =========================================================================
     STEP-BY-STEP PLAY & CAPTURE ANIMATION SEQUENCE
     ========================================================================= */

  async playMoveSequence(lastMove) {
    this.stopTurnTimer();
    this.isProcessing = true;

    try {
      const { seat, card, capturedCards, isScopa, dealtNewHands } = lastMove;
      const isMine = seat === this.view.you.seat;
      const actorName = isMine ? 'Tu' : this.view.opponent.username;
      const isCapture = capturedCards.length > 0;
      const role = isMine ? 'player' : 'cpu';

      this.setNarrator(isMine ? '👤' : (this.view.mode === 'local' ? '🤖' : '👤'), `${actorName} gioca ${card.name}...`);

      // 1. Animate card play
      const playedFlyEl = await this.animateCardPlay(role, card);

      // 2. Animate capture or place on table
      if (isCapture) {
        capturedCards.forEach(c => {
          const tableCardEl = document.getElementById(`table-card-${c.id}`);
          if (tableCardEl) {
            tableCardEl.classList.add('card-target-capture');
          }
        });

        const targetsDesc = capturedCards.map(c => c.name).join(' + ');
        this.setNarrator('🎯', `Presa! ${card.name} raccoglie ${targetsDesc}`);

        soundFx.playCapture();
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try { navigator.vibrate(28); } catch (e) {}
        }
        if (capturedCards.some(c => c.isSettebello || c.suit === 'denari') || card.isSettebello) {
          soundFx.playCoin();
        }

        await new Promise(r => setTimeout(r, 680));
        await this.animateCaptureToPile(role, playedFlyEl, capturedCards);
      } else {
        this.setNarrator('🌱', `${actorName} cala ${card.name}: resta sul tavolo`);
        await new Promise(r => setTimeout(r, 650));
        await this.animateCardJoinTable(playedFlyEl, card);
      }

      // 3. Update board with fresh state
      this.updateBoard();

      if (playedFlyEl && playedFlyEl.parentNode) {
        playedFlyEl.remove();
      }

      // 4. Scopa celebration
      if (isScopa) {
        this.triggerScopaCelebration(isMine ? '✨ Hai fatto Scopa! (+1) ✨' : `✨ ${actorName} ha fatto Scopa! (+1) ✨`);
        await new Promise(r => setTimeout(r, 1200));
      }

      // 5. Deal new hands notice
      if (dealtNewHands) {
        soundFx.playDeal();
        this.setNarrator('🎴', 'Nuova mano di 3 carte distribuita dal mazzo');
        await new Promise(r => setTimeout(r, 600));
        this.updateBoard();
      }

      // 6. Round over check
      this.isProcessing = false;
      this.updateBoard();

      if (this.view.isRoundOver) {
        this.stopTurnTimer();
        setTimeout(() => this.showRoundSummary(this.view.roundResult), 1000);
        return;
      }
    } catch (err) {
      console.error('Errore durante playMoveSequence:', err);
      this.isProcessing = false;
      document.querySelectorAll('.flying-card-live').forEach(el => el.remove());
      this.updateBoard();
    }
  }

  /* Physics-based Smooth Card Throw Animation onto Open Green Felt */
  async animateCardPlay(role, card) {
    const isPlayer = role === 'player';
    const centerZone = document.querySelector('.table-center-zone');
    const centerRect = centerZone 
      ? centerZone.getBoundingClientRect() 
      : { left: window.innerWidth / 2 - 150, top: window.innerHeight / 2 - 80, width: 300, height: 160 };

    const tableField = document.getElementById('table-cards-field');
    const tableCards = Array.from(tableField ? tableField.querySelectorAll('.table-card') : []);

    let startRect = null;
    let sourceEl = null;

    if (isPlayer) {
      sourceEl = document.getElementById(`player-card-${card.id}`);
      if (sourceEl) {
        startRect = sourceEl.getBoundingClientRect();
        sourceEl.style.opacity = '0';
      }
    } else {
      sourceEl = document.querySelector('#cpu-hand .cpu-card');
      if (sourceEl) {
        startRect = sourceEl.getBoundingClientRect();
        sourceEl.style.opacity = '0';
      }
    }

    const cardWidth = startRect?.width || 56;
    const cardHeight = startRect?.height || 92;

    if (!startRect || startRect.width === 0) {
      startRect = {
        left: window.innerWidth / 2 - cardWidth / 2,
        top: isPlayer ? window.innerHeight - 120 : 60,
        width: cardWidth,
        height: cardHeight
      };
    }

    let targetX = centerRect.left + centerRect.width / 2 - cardWidth / 2;
    let targetY = centerRect.top + centerRect.height / 2 - cardHeight / 2;

    if (tableCards.length > 0) {
      const existingRects = tableCards.map(el => el.getBoundingClientRect());
      const minCardTop = Math.min(...existingRects.map(r => r.top));
      const maxCardBottom = Math.max(...existingRects.map(r => r.bottom));
      const maxCardRight = Math.max(...existingRects.map(r => r.right));
      const minCardLeft = Math.min(...existingRects.map(r => r.left));

      const spaceBelow = centerRect.bottom - maxCardBottom;
      const spaceAbove = minCardTop - centerRect.top;

      if (isPlayer) {
        if (spaceBelow >= cardHeight * 0.7) {
          targetY = maxCardBottom + 10;
        } else if (maxCardRight + cardWidth + 14 < centerRect.right - 10) {
          targetX = maxCardRight + 14;
          targetY = minCardTop;
        } else {
          targetY = maxCardBottom - cardHeight * 0.35;
          targetX = centerRect.left + centerRect.width / 2 - cardWidth / 2 + 25;
        }
      } else {
        if (spaceAbove >= cardHeight * 0.7) {
          targetY = minCardTop - cardHeight - 10;
        } else if (minCardLeft - cardWidth - 14 > centerRect.left + 50) {
          targetX = minCardLeft - cardWidth - 14;
          targetY = minCardTop;
        } else {
          targetY = minCardTop - cardHeight * 0.45;
          targetX = centerRect.left + centerRect.width / 2 - cardWidth / 2 - 25;
        }
      }
    }

    targetX = Math.max(centerRect.left + 10, Math.min(targetX, centerRect.right - cardWidth - 10));
    targetY = Math.max(centerRect.top + 6, Math.min(targetY, centerRect.bottom - cardHeight - 6));

    const dx = targetX - startRect.left;
    const dy = targetY - startRect.top;
    const landingRot = ((card.value * 4) % 5) - 2;

    const flyEl = document.createElement('div');
    flyEl.className = 'card-wrapper flying-card-live played-on-green-felt';
    flyEl.innerHTML = renderCardSvg(card, true);
    flyEl.style.left = `${startRect.left}px`;
    flyEl.style.top = `${startRect.top}px`;
    flyEl.style.width = `${cardWidth}px`;
    flyEl.style.height = `${cardHeight}px`;
    document.body.appendChild(flyEl);

    soundFx.playSnap();

    if (isPlayer) {
      const anim = flyEl.animate([
        { transform: 'translate(0, 0) scale(1) rotate(0deg)' },
        { 
          transform: `translate(${dx * 0.45}px, ${dy * 0.35 - 30}px) scale(1.08) rotate(${(Math.random() - 0.5) * 4}deg)`,
          offset: 0.45 
        },
        { transform: `translate(${dx}px, ${dy}px) scale(1) rotate(${landingRot}deg)` }
      ], {
        duration: 520,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'forwards'
      });
      await Promise.race([
        anim.finished.catch(() => {}),
        new Promise(r => setTimeout(r, 580))
      ]);
    } else {
      const anim = flyEl.animate([
        { transform: 'translate(0, 0) scale(0.88) rotateY(180deg)', opacity: 0.8 },
        { 
          transform: `translate(${dx * 0.45}px, ${dy * 0.45 + 24}px) scale(1.08) rotateY(90deg)`, 
          opacity: 1, 
          offset: 0.45 
        },
        { transform: `translate(${dx}px, ${dy}px) scale(1) rotateY(0deg) rotate(${landingRot}deg)`, opacity: 1 }
      ], {
        duration: 540,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'forwards'
      });
      await Promise.race([
        anim.finished.catch(() => {}),
        new Promise(r => setTimeout(r, 600))
      ]);
    }

    flyEl.style.left = `${targetX}px`;
    flyEl.style.top = `${targetY}px`;
    flyEl.style.transform = `rotate(${landingRot}deg)`;
    flyEl.dataset.landingRot = `${landingRot}`;
    try {
      flyEl.getAnimations().forEach(a => a.cancel());
    } catch (e) {}

    return flyEl;
  }

  /* Smoothly slide the played card from the green space into the table cards line */
  async animateCardJoinTable(playedFlyEl, card) {
    if (!playedFlyEl || !playedFlyEl.parentNode) return;

    const tableField = document.getElementById('table-cards-field');
    if (!tableField) {
      playedFlyEl.remove();
      return;
    }

    const emptyMsg = tableField.querySelector('.empty-table-msg');
    if (emptyMsg) emptyMsg.style.display = 'none';

    const dummy = document.createElement('div');
    dummy.className = 'card-wrapper table-card';
    dummy.style.visibility = 'hidden';
    dummy.style.pointerEvents = 'none';
    dummy.innerHTML = renderCardSvg(card, true);
    tableField.appendChild(dummy);

    const destRect = dummy.getBoundingClientRect();
    dummy.remove();
    if (emptyMsg) emptyMsg.style.display = '';

    const currentRect = playedFlyEl.getBoundingClientRect();
    const slideDx = destRect.left - currentRect.left;
    const slideDy = destRect.top - currentRect.top;

    const tableIdx = this.view?.tableCards?.length || 0;
    const finalRot = ((card.value * 5 + tableIdx * 7) % 7) - 3;
    const startRot = parseFloat(playedFlyEl.dataset.landingRot || 0);

    soundFx.playDeal();
    const slideAnim = playedFlyEl.animate([
      { 
        transform: `translate(0px, 0px) rotate(${startRot}deg) scale(1)`,
        boxShadow: '0 16px 36px rgba(0, 0, 0, 0.7), 0 0 22px rgba(245, 197, 66, 0.5)'
      },
      { 
        transform: `translate(${slideDx * 0.5}px, ${slideDy * 0.5 - 6}px) rotate(${startRot * 0.5 + finalRot * 0.5}deg) scale(1.02)`,
        offset: 0.5 
      },
      { 
        transform: `translate(${slideDx}px, ${slideDy}px) rotate(${finalRot}deg) scale(1)`,
        boxShadow: '0 8px 20px rgba(0, 0, 0, 0.45)'
      }
    ], {
      duration: 500,
      easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
      fill: 'forwards'
    });

    await Promise.race([
      slideAnim.finished.catch(() => {}),
      new Promise(r => setTimeout(r, 550))
    ]);
  }

  /* Smooth Dynamic Vector Flight into the Player or CPU Capture Pile */
  async animateCaptureToPile(role, playedFlyEl, capturedCards) {
    const isPlayer = role === 'player';
    const pileId = isPlayer ? 'player-pile-stack' : 'cpu-pile-stack';
    const pileEl = document.getElementById(pileId);
    const pileRect = pileEl 
      ? pileEl.getBoundingClientRect() 
      : { left: window.innerWidth - 65, top: isPlayer ? window.innerHeight - 80 : 80, width: 45, height: 70 };

    const elementsToFly = [];

    if (playedFlyEl && playedFlyEl.parentNode) {
      elementsToFly.push(playedFlyEl);
    }

    capturedCards.forEach(c => {
      const tableCardEl = document.getElementById(`table-card-${c.id}`);
      if (tableCardEl) {
        const rect = tableCardEl.getBoundingClientRect();
        const clone = document.createElement('div');
        clone.className = 'card-wrapper flying-card-live';
        clone.innerHTML = tableCardEl.innerHTML;
        clone.style.left = `${rect.left}px`;
        clone.style.top = `${rect.top}px`;
        clone.style.width = `${rect.width}px`;
        clone.style.height = `${rect.height}px`;
        document.body.appendChild(clone);
        tableCardEl.style.opacity = '0';
        elementsToFly.push(clone);
      }
    });

    const targetCenterX = pileRect.left + pileRect.width / 2;
    const targetCenterY = pileRect.top + pileRect.height / 2;

    const animations = elementsToFly.map((el, index) => {
      const r = el.getBoundingClientRect();
      const currentX = r.left;
      const currentY = r.top;
      const dx = targetCenterX - (currentX + r.width / 2);
      const dy = targetCenterY - (currentY + r.height / 2);
      const rot = (index - 1) * 8 + (Math.random() - 0.5) * 10;

      const anim = el.animate([
        { transform: el.style.transform || 'translate(0, 0) scale(1)', opacity: 1 },
        { 
          transform: `translate(${dx * 0.55}px, ${dy * 0.45 - 20}px) scale(0.72) rotate(${rot * 0.6}deg)`, 
          opacity: 0.95, 
          offset: 0.55 
        },
        { transform: `translate(${dx}px, ${dy}px) scale(0.3) rotate(${rot}deg)`, opacity: 0.2 }
      ], {
        duration: 620,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'forwards'
      });

      return Promise.race([
        anim.finished.catch(() => {}),
        new Promise(r => setTimeout(r, 680))
      ]);
    });

    await Promise.all(animations);

    elementsToFly.forEach(el => {
      if (el && el.parentNode) {
        el.remove();
      }
    });

    if (pileEl) {
      pileEl.classList.add('pile-bump');
      setTimeout(() => pileEl.classList.remove('pile-bump'), 400);
    }
  }

  // Scopa celebration fanfare
  triggerScopaCelebration(text) {
    soundFx.playScopa();
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate([60, 40, 60, 40, 120]); } catch (e) {}
    }
    const banner = document.getElementById('scopa-banner');
    if (banner) {
      const sub = banner.querySelector('.scopa-banner-sub');
      if (sub) sub.textContent = text;
      banner.classList.add('banner-active');
      setTimeout(() => {
        banner.classList.remove('banner-active');
      }, 2200);
    }
  }

  // Round summary dialog
  showRoundSummary(scoreData) {
    if (!scoreData) return;
    this.stopTurnTimer();

    const isMatchOver = scoreData.isMatchOver || this.view?.isMatchOver;
    const playerWon = scoreData.isWinner !== null && scoreData.isWinner !== undefined 
      ? scoreData.isWinner 
      : (this.view?.matchWinnerSeat === this.view?.you?.seat);

    if (isMatchOver) {
      if (playerWon) soundFx.playWin();
      gameManager.recordScopaMatch({
        won: playerWon,
        scopeMade: scoreData.scope.you ?? scoreData.scope.player,
        gotSettebello: (scoreData.settebello.points?.you ?? scoreData.settebello.points?.player) === 1,
        gotPrimiera: (scoreData.primiera.points?.you ?? scoreData.primiera.points?.player) === 1,
        finalScore: scoreData.matchScore.you ?? scoreData.matchScore.player
      });
    }

    const dialog = document.getElementById('round-score-dialog');
    const title = document.getElementById('round-modal-title');
    const tableContainer = document.getElementById('round-scores-table');
    const nextBtn = document.getElementById('next-round-btn');
    if (!dialog || !tableContainer) return;

    const oppName = this.view?.mode === 'local' ? 'CPU' : (this.view?.opponent?.username || 'Avversario');

    if (isMatchOver) {
      title.textContent = playerWon ? '🏆 Vittoria! Hai Vinto la Partita!' : `Partita Terminata - Ha Vinto ${oppName}!`;
      title.className = `dialog-title ${playerWon ? 'winner-title' : 'loser-title'}`;
      if (nextBtn) nextBtn.textContent = 'Torna alla Lobby';
    } else {
      title.textContent = `Fine Smazzata ${this.view?.roundNumber || 1}`;
      title.className = 'dialog-title';
      if (nextBtn) nextBtn.textContent = 'Prossima Smazzata';
    }

    const { carte, denari, settebello, primiera, scope, roundTotal, matchScore } = scoreData;

    tableContainer.innerHTML = `
      <table class="score-breakdown-table">
        <thead>
          <tr>
            <th>Punteggio</th>
            <th>Tu</th>
            <th>${oppName}</th>
            <th>Punti Assegnati</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Carte</strong> (>20)</td>
            <td>${carte.you}</td>
            <td>${carte.opponent}</td>
            <td><span class="pts-badge">${carte.points.you > carte.points.opponent ? 'Tu (+1)' : carte.points.opponent > carte.points.you ? oppName + ' (+1)' : 'Parità (0)'}</span></td>
          </tr>
          <tr>
            <td><strong>Denari</strong> (>5)</td>
            <td>${denari.you}</td>
            <td>${denari.opponent}</td>
            <td><span class="pts-badge">${denari.points.you > denari.points.opponent ? 'Tu (+1)' : denari.points.opponent > denari.points.you ? oppName + ' (+1)' : 'Parità (0)'}</span></td>
          </tr>
          <tr>
            <td><strong>Settebello</strong> (7 Denari)</td>
            <td>${settebello.you ? '⭐ Preso' : '—'}</td>
            <td>${settebello.opponent ? '⭐ Preso' : '—'}</td>
            <td><span class="pts-badge">${settebello.points.you ? 'Tu (+1)' : settebello.points.opponent ? oppName + ' (+1)' : '—'}</span></td>
          </tr>
          <tr>
            <td><strong>Primiera</strong></td>
            <td>${primiera.you} pt</td>
            <td>${primiera.opponent} pt</td>
            <td><span class="pts-badge">${primiera.points.you > primiera.points.opponent ? 'Tu (+1)' : primiera.points.opponent > primiera.points.you ? oppName + ' (+1)' : 'Parità (0)'}</span></td>
          </tr>
          <tr>
            <td><strong>Scope</strong></td>
            <td>${scope.you}</td>
            <td>${scope.opponent}</td>
            <td><span class="pts-badge">Tu: +${scope.you} | ${oppName}: +${scope.opponent}</span></td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="round-total-row">
            <td><strong>Punti Smazzata</strong></td>
            <td><strong>+${roundTotal.you}</strong></td>
            <td><strong>+${roundTotal.opponent}</strong></td>
            <td>—</td>
          </tr>
          <tr class="match-total-row">
            <td><strong>Totale Partita</strong> (Obiettivo: ${this.match?.targetScore || 11})</td>
            <td class="total-pts-highlight">${matchScore.you}</td>
            <td class="total-pts-highlight">${matchScore.opponent}</td>
            <td>—</td>
          </tr>
        </tfoot>
      </table>
    `;

    if (!dialog.open) dialog.showModal();
  }
}
