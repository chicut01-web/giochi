// Friends, Social Search & Multiplayer Challenges Modal

import { friendsManager } from '../core/FriendsManager.js';
import { soundFx } from '../core/SoundFx.js';
import { gameManager } from '../core/GameManager.js';
import { authManager } from '../core/AuthManager.js';
import { icons } from '../utils/icons.js';

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m]);
}

export class FriendsModal {
  constructor() {
    this.currentTab = 'friends'; // friends | search | requests
    this.searchQuery = '';
    this.searchResults = [];
    this.isSearching = false;
    this.searchTimeout = null;
    this.dialog = null;
    this.unsubscribe = null;
    this.init();
  }

  init() {
    // Create modal element if not already present
    let existing = document.getElementById('app-friends-dialog');
    if (!existing) {
      this.dialog = document.createElement('dialog');
      this.dialog.id = 'app-friends-dialog';
      this.dialog.className = 'app-dialog friends-dialog';
      document.body.appendChild(this.dialog);
    } else {
      this.dialog = existing;
    }

    this.unsubscribe = friendsManager.subscribe(() => {
      if (this.dialog && this.dialog.open) {
        this.renderBody();
      }
    });
  }

  open(initialTab = 'friends') {
    this.currentTab = initialTab;
    this.render();
    this.dialog?.showModal();
    friendsManager.refreshAll();
  }

  close() {
    this.removeWaitingOverlay();
    this.dialog?.close();
  }

  render() {
    if (!this.dialog) return;

    this.dialog.innerHTML = `
      <div class="dialog-content friends-modal-content">
        <!-- Modal Header -->
        <header class="friends-modal-header">
          <div class="friends-modal-title-box">
            <span class="friends-title-icon">${icons.users({ size: 24, className: 'dialog-title-svg' })}</span>
            <div>
              <h2 class="dialog-title">Circolo Amici & Sfide</h2>
              <p class="friends-modal-subtitle">Trova amici per username e sfidali a Scopa!</p>
            </div>
          </div>
          <button class="friends-modal-close-btn" id="friends-modal-close" title="Chiudi">${icons.close({ size: 20 })}</button>
        </header>

        <!-- Navigation Tabs -->
        <div class="friends-modal-tabs" role="tablist">
          <button class="friends-tab-btn ${this.currentTab === 'friends' ? 'active' : ''}" id="ftab-friends">
            ${icons.users({ size: 16 })}
            <span>Amici</span>
            <span class="tab-counter-badge" id="ftab-count-friends">0</span>
          </button>
          <button class="friends-tab-btn ${this.currentTab === 'search' ? 'active' : ''}" id="ftab-search">
            ${icons.search({ size: 16 })}
            <span>Cerca Giocatori</span>
          </button>
          <button class="friends-tab-btn ${this.currentTab === 'requests' ? 'active' : ''}" id="ftab-requests">
            ${icons.inbox({ size: 16 })}
            <span>Richieste</span>
            <span class="tab-counter-badge pulse-badge hidden" id="ftab-count-requests">0</span>
          </button>
        </div>

        <!-- Dynamic Body Content -->
        <div class="friends-modal-body" id="friends-modal-body">
          <!-- Rendered by renderBody() -->
        </div>

        <footer class="friends-modal-footer">
          <button class="dialog-cancel-btn" id="friends-close-footer-btn">Chiudi</button>
        </footer>
      </div>
    `;

    this.attachHeaderEvents();
    this.renderBody();
  }

  attachHeaderEvents() {
    document.getElementById('friends-modal-close')?.addEventListener('click', () => {
      soundFx.playSnap();
      this.close();
    });

    document.getElementById('friends-close-footer-btn')?.addEventListener('click', () => {
      soundFx.playSnap();
      this.close();
    });

    // Tab buttons
    document.getElementById('ftab-friends')?.addEventListener('click', () => {
      soundFx.playSnap();
      this.currentTab = 'friends';
      this.updateTabButtons();
      this.renderBody();
    });

    document.getElementById('ftab-search')?.addEventListener('click', () => {
      soundFx.playSnap();
      this.currentTab = 'search';
      this.updateTabButtons();
      this.renderBody();
    });

    document.getElementById('ftab-requests')?.addEventListener('click', () => {
      soundFx.playSnap();
      this.currentTab = 'requests';
      this.updateTabButtons();
      this.renderBody();
    });
  }

  updateTabButtons() {
    document.querySelectorAll('.friends-tab-btn').forEach(btn => btn.classList.remove('active'));
    if (this.currentTab === 'friends') document.getElementById('ftab-friends')?.classList.add('active');
    if (this.currentTab === 'search') document.getElementById('ftab-search')?.classList.add('active');
    if (this.currentTab === 'requests') document.getElementById('ftab-requests')?.classList.add('active');
  }

  renderBody() {
    const body = document.getElementById('friends-modal-body');
    if (!body) return;

    const state = friendsManager.getState();

    // Update counters
    const friendsCountEl = document.getElementById('ftab-count-friends');
    if (friendsCountEl) friendsCountEl.textContent = state.friends.length;

    const reqCountEl = document.getElementById('ftab-count-requests');
    if (reqCountEl) {
      const incomingCount = state.incomingRequests.length + (state.incomingInvites?.length || 0);
      reqCountEl.textContent = incomingCount;
      if (incomingCount > 0) {
        reqCountEl.classList.remove('hidden');
      } else {
        reqCountEl.classList.add('hidden');
      }
    }

    if (this.currentTab === 'friends') {
      this.renderFriendsTab(body, state.friends);
    } else if (this.currentTab === 'search') {
      this.renderSearchTab(body);
    } else if (this.currentTab === 'requests') {
      this.renderRequestsTab(body, state.incomingRequests, state.outgoingRequests, state.incomingInvites || []);
    }
  }

  renderFriendsTab(container, friends) {
    if (friends.length === 0) {
      container.innerHTML = `
        <div class="friends-empty-state">
          <div class="empty-icon">${icons.users({ size: 42, color: '#f5c542' })}</div>
          <h3>Nessun amico ancora aggiunto</h3>
          <p>Cerca il nome dei tuoi amici nella scheda <strong>"Cerca Giocatori"</strong> per aggiungerli e sfidarli a Scopa!</p>
          <button class="friends-cta-btn" id="cta-go-search">
            ${icons.search({ size: 16 })}
            <span>Trova Amici Ora</span>
          </button>
        </div>
      `;
      document.getElementById('cta-go-search')?.addEventListener('click', () => {
        soundFx.playSnap();
        this.currentTab = 'search';
        this.updateTabButtons();
        this.renderBody();
      });
      return;
    }

    container.innerHTML = `
      <div class="friends-list-wrap">
        <ul class="friends-card-list">
          ${friends.map(friend => `
            <li class="friend-card" data-friend-id="${friend.id}">
              <div class="friend-card-avatar">
                ${icons.user({ size: 20 })}
              </div>
              <div class="friend-card-info">
                <span class="friend-username">${friend.username}</span>
                <span class="friend-subtext">Amico</span>
              </div>
              <div class="friend-card-actions">
                <button class="action-btn challenge-btn" data-action="challenge" data-friend-id="${friend.id}" data-friend-name="${friend.username}">
                  ${icons.spade({ size: 15 })}
                  <span>Sfida</span>
                </button>
                <button class="action-btn icon-btn remove-friend-btn" data-action="remove" data-friend-id="${friend.id}" title="Rimuovi amico">
                  ${icons.trash({ size: 16 })}
                </button>
              </div>
            </li>
          `).join('')}
        </ul>
      </div>
    `;

    // Attach friend card actions
    container.querySelectorAll('button[data-action="challenge"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const friendId = btn.getAttribute('data-friend-id');
        const friendName = btn.getAttribute('data-friend-name');
        soundFx.playSnap();
        btn.disabled = true;
        btn.innerHTML = '<span>Invio...</span>';

        try {
          const invite = await friendsManager.sendGameInvite(friendId, 'scopa');
          soundFx.playWin();
          btn.disabled = false;
          btn.innerHTML = `${icons.spade({ size: 15 })} <span>Sfida</span>`;
          this.showWaitingChallengeModal(invite, friendName);
        } catch (err) {
          soundFx.playSnap();
          alert(err.message || 'Errore durante l\'invio della sfida.');
          btn.disabled = false;
          btn.innerHTML = `${icons.spade({ size: 15 })} <span>Sfida</span>`;
        }
      });
    });

    container.querySelectorAll('button[data-action="remove"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const friendId = btn.getAttribute('data-friend-id');
        if (confirm('Vuoi rimuovere questo giocatore dai tuoi amici?')) {
          soundFx.playSnap();
          try {
            await friendsManager.removeFriend(friendId);
          } catch (err) {
            alert(err.message || 'Errore nella rimozione dell\'amico.');
          }
        }
      });
    });
  }

  showWaitingChallengeModal(invite, friendName) {
    if (!this.dialog) return;

    this.removeWaitingOverlay();

    const overlay = document.createElement('div');
    overlay.id = 'challenge-waiting-overlay';
    overlay.className = 'challenge-waiting-overlay';
    overlay.innerHTML = `
      <div class="challenge-waiting-card">
        <div class="waiting-sword-spin">${icons.spade({ size: 36, color: '#f5c542' })}</div>
        <h3 class="waiting-card-title">Sfida Inviata a <strong>${escapeHtml(friendName)}</strong>!</h3>
        <p class="waiting-card-desc">In attesa che l'avversario accetti la partita a Scopa...</p>
        
        <div class="waiting-pulse-dots">
          <span class="wdot"></span>
          <span class="wdot"></span>
          <span class="wdot"></span>
        </div>

        <div class="waiting-countdown-text" id="waiting-countdown-text">In attesa di risposta (60s)...</div>

        <div class="waiting-card-actions">
          <button class="dialog-cancel-btn waiting-cancel-btn" id="btn-cancel-challenge-waiting">
            Annulla Sfida
          </button>
        </div>
      </div>
    `;

    const content = this.dialog.querySelector('.friends-modal-content');
    if (content) {
      content.appendChild(overlay);
    } else {
      this.dialog.appendChild(overlay);
    }

    let secondsLeft = 60;
    const countdownEl = document.getElementById('waiting-countdown-text');
    const countdownTimer = setInterval(() => {
      secondsLeft--;
      if (countdownEl) {
        countdownEl.textContent = `In attesa di risposta (${secondsLeft}s)...`;
      }
      if (secondsLeft <= 0) {
        clearInterval(countdownTimer);
      }
    }, 1000);

    const cleanupWaiting = () => {
      clearInterval(countdownTimer);
      this.removeWaitingOverlay();
    };

    // Gestione annulla sfida
    document.getElementById('btn-cancel-challenge-waiting')?.addEventListener('click', async () => {
      soundFx.playSnap();
      cleanupWaiting();
      await friendsManager.cancelGameInvite(invite.id);
    });

    // Avvia listener di attesa su FriendsManager
    friendsManager.startWaitingForChallenge(invite.id, {
      onAccepted: (sessionId) => {
        cleanupWaiting();
        this.close();
        friendsManager.handleSessionAutoJoin(sessionId);
      },
      onDeclined: () => {
        cleanupWaiting();
        alert(`${friendName} ha rifiutato la sfida.`);
      },
      onTimeout: () => {
        cleanupWaiting();
        alert(`Nessuna risposta da ${friendName}. La sfida è scaduta.`);
        friendsManager.cancelGameInvite(invite.id);
      }
    });
  }

  removeWaitingOverlay() {
    const existing = document.getElementById('challenge-waiting-overlay');
    if (existing) {
      existing.remove();
    }
  }

  renderSearchTab(container) {
    container.innerHTML = `
      <div class="friends-search-box">
        <div class="search-input-wrapper">
          <span class="search-icon">${icons.search({ size: 18 })}</span>
          <input 
            type="text" 
            id="friends-search-input" 
            placeholder="Cerca per username (es. Mario, Piuccia...)" 
            value="${this.searchQuery}" 
            autocomplete="off" 
          />
          ${this.searchQuery ? `<button class="clear-search-btn" id="clear-search-btn">${icons.close({ size: 16 })}</button>` : ''}
        </div>
      </div>

      <div class="friends-search-results" id="search-results-box">
        ${this.renderSearchResultsContent()}
      </div>
    `;

    const input = document.getElementById('friends-search-input');
    const clearBtn = document.getElementById('clear-search-btn');

    clearBtn?.addEventListener('click', () => {
      this.searchQuery = '';
      this.searchResults = [];
      this.renderBody();
    });

    input?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      if (this.searchTimeout) clearTimeout(this.searchTimeout);

      if (this.searchQuery.trim().length < 2) {
        this.searchResults = [];
        this.isSearching = false;
        const resBox = document.getElementById('search-results-box');
        if (resBox) resBox.innerHTML = this.renderSearchResultsContent();
        return;
      }

      this.isSearching = true;
      const resBox = document.getElementById('search-results-box');
      if (resBox) resBox.innerHTML = `<div class="search-loading-text">Ricerca giocatori in corso...</div>`;

      this.searchTimeout = setTimeout(async () => {
        this.searchResults = await friendsManager.searchUsers(this.searchQuery);
        this.isSearching = false;
        const updateBox = document.getElementById('search-results-box');
        if (updateBox) {
          updateBox.innerHTML = this.renderSearchResultsContent();
          this.attachSearchResultActions(updateBox);
        }
      }, 350);
    });

    const resBox = document.getElementById('search-results-box');
    if (resBox) this.attachSearchResultActions(resBox);
  }

  renderSearchResultsContent() {
    if (this.isSearching) {
      return `<div class="search-loading-text">Ricerca giocatori in corso...</div>`;
    }

    if (!this.searchQuery || this.searchQuery.trim().length < 2) {
      return `
        <div class="search-hint-box">
          <p>Digita almeno 2 caratteri per trovare altri giocatori registrati su Piuccia Games.</p>
        </div>
      `;
    }

    if (this.searchResults.length === 0) {
      return `
        <div class="search-no-results">
          <p>Nessun giocatore trovato con lo username "<strong>${this.searchQuery}</strong>".</p>
        </div>
      `;
    }

    return `
      <ul class="friends-card-list">
        ${this.searchResults.map(user => `
          <li class="friend-card" data-user-id="${user.id}">
            <div class="friend-card-avatar">
              ${icons.user({ size: 20 })}
            </div>
            <div class="friend-card-info">
              <span class="friend-username">${user.username}</span>
              <span class="friend-subtext">Giocatore</span>
            </div>
            <div class="friend-card-actions">
              ${user.status === 'friend' ? `
                <span class="status-badge badge-friend">${icons.check({ size: 14 })} Amico</span>
              ` : user.status === 'request_sent' ? `
                <span class="status-badge badge-pending">${icons.clock({ size: 14 })} Richiesta Inviata</span>
              ` : user.status === 'request_received' ? `
                <button class="action-btn accept-btn" data-action="send-request" data-user-id="${user.id}">
                  ${icons.check({ size: 14 })}
                  <span>Accetta</span>
                </button>
              ` : `
                <button class="action-btn send-req-btn" data-action="send-request" data-user-id="${user.id}">
                  ${icons.users({ size: 14 })}
                  <span>Aggiungi</span>
                </button>
              `}
            </div>
          </li>
        `).join('')}
      </ul>
    `;
  }

  attachSearchResultActions(container) {
    container.querySelectorAll('button[data-action="send-request"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const targetUserId = btn.getAttribute('data-user-id');
        soundFx.playSnap();
        btn.disabled = true;
        btn.innerHTML = '<span>Invio...</span>';

        try {
          const result = await friendsManager.sendFriendRequest(targetUserId);
          soundFx.playWin();
          if (result === 'accepted' || result === 'already_friends') {
            btn.outerHTML = `<span class="status-badge badge-friend">${icons.check({ size: 14 })} Amico</span>`;
          } else {
            btn.outerHTML = `<span class="status-badge badge-pending">${icons.clock({ size: 14 })} Richiesta Inviata</span>`;
          }
        } catch (err) {
          soundFx.playSnap();
          alert(err.message || 'Errore durante l\'invio della richiesta.');
          btn.disabled = false;
          btn.innerHTML = `${icons.users({ size: 14 })} <span>Aggiungi</span>`;
        }
      });
    });
  }

  renderRequestsTab(container, incoming, outgoing, incomingInvites = []) {
    if (incoming.length === 0 && outgoing.length === 0 && incomingInvites.length === 0) {
      container.innerHTML = `
        <div class="friends-empty-state">
          <div class="empty-icon">${icons.inbox({ size: 40, color: '#f5c542' })}</div>
          <h3>Nessuna richiesta o sfida</h3>
          <p>Quando qualcuno ti invia una sfida di gioco o una richiesta di amicizia, la troverai qui.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="requests-sections-wrap">
        <!-- SFIDE DI GIOCO RICEVUTE -->
        ${incomingInvites.length > 0 ? `
          <section class="requests-sub-section received-challenges-section">
            <h4 class="requests-section-title">${icons.spade({ size: 16, color: '#f5c542' })} Sfide di Gioco in Arrivo (${incomingInvites.length})</h4>
            <ul class="friends-card-list">
              ${incomingInvites.map(inv => `
                <li class="friend-card challenge-invite-card" data-inv-id="${inv.id}">
                  <div class="friend-card-avatar challenge-avatar">
                    ${icons.spade({ size: 20, color: '#f5c542' })}
                  </div>
                  <div class="friend-card-info">
                    <span class="friend-username">${escapeHtml(inv.fromUsername)}</span>
                    <span class="friend-subtext">Ti ha sfidato a Scopa!</span>
                  </div>
                  <div class="friend-card-actions">
                    <button class="action-btn accept-btn challenge-accept-btn" data-action="accept-invite" data-inv-id="${inv.id}">
                      ${icons.check({ size: 14 })}
                      <span>Accetta</span>
                    </button>
                    <button class="action-btn reject-btn" data-action="reject-invite" data-inv-id="${inv.id}">
                      ${icons.close({ size: 14 })}
                      <span>Rifiuta</span>
                    </button>
                  </div>
                </li>
              `).join('')}
            </ul>
          </section>
        ` : ''}

        <!-- RICHIESTE AMICIZIA RICEVUTE -->
        <section class="requests-sub-section">
          <h4 class="requests-section-title">${icons.users({ size: 16 })} Richieste di Amicizia Ricevute (${incoming.length})</h4>
          ${incoming.length === 0 ? `
            <p class="requests-sub-empty">Non hai richieste di amicizia in arrivo.</p>
          ` : `
            <ul class="friends-card-list">
              ${incoming.map(req => `
                <li class="friend-card" data-req-id="${req.id}">
                  <div class="friend-card-avatar">
                    ${icons.user({ size: 20 })}
                  </div>
                  <div class="friend-card-info">
                    <span class="friend-username">${escapeHtml(req.username)}</span>
                    <span class="friend-subtext">Vuole aggiungerti agli amici</span>
                  </div>
                  <div class="friend-card-actions">
                    <button class="action-btn accept-btn" data-action="accept-req" data-req-id="${req.id}">
                      ${icons.check({ size: 14 })}
                      <span>Accetta</span>
                    </button>
                    <button class="action-btn reject-btn" data-action="reject-req" data-req-id="${req.id}">
                      ${icons.close({ size: 14 })}
                      <span>Rifiuta</span>
                    </button>
                  </div>
                </li>
              `).join('')}
            </ul>
          `}
        </section>

        <!-- INVIATE -->
        <section class="requests-sub-section">
          <h4 class="requests-section-title">${icons.clock({ size: 16 })} Richieste Inviate in Attesa (${outgoing.length})</h4>
          ${outgoing.length === 0 ? `
            <p class="requests-sub-empty">Nessuna richiesta in attesa.</p>
          ` : `
            <ul class="friends-card-list">
              ${outgoing.map(req => `
                <li class="friend-card" data-req-id="${req.id}">
                  <div class="friend-card-avatar">
                    ${icons.user({ size: 20 })}
                  </div>
                  <div class="friend-card-info">
                    <span class="friend-username">${escapeHtml(req.username)}</span>
                    <span class="friend-subtext">In attesa di conferma</span>
                  </div>
                  <div class="friend-card-actions">
                    <button class="action-btn cancel-req-btn" data-action="cancel-req" data-req-id="${req.id}">
                      ${icons.close({ size: 14 })}
                      <span>Annulla</span>
                    </button>
                  </div>
                </li>
              `).join('')}
            </ul>
          `}
        </section>
      </div>
    `;

    // Actions for game invites
    container.querySelectorAll('button[data-action="accept-invite"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const invId = btn.getAttribute('data-inv-id');
        soundFx.playWin();
        btn.disabled = true;
        btn.innerHTML = '<span>Avvio...</span>';
        try {
          const sessionId = await friendsManager.acceptGameInvite(invId);
          this.close();
          friendsManager.handleSessionAutoJoin(sessionId);
        } catch (err) {
          alert(err.message || 'Impossibile avviare la partita.');
          btn.disabled = false;
          btn.innerHTML = `${icons.check({ size: 14 })} <span>Accetta</span>`;
        }
      });
    });

    container.querySelectorAll('button[data-action="reject-invite"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const invId = btn.getAttribute('data-inv-id');
        soundFx.playSnap();
        btn.disabled = true;
        try {
          await friendsManager.respondToGameInvite(invId, false);
        } catch (err) {
          alert(err.message || 'Errore nel rifiutare la sfida.');
          btn.disabled = false;
        }
      });
    });

    // Actions for incoming friend requests
    container.querySelectorAll('button[data-action="accept-req"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const reqId = btn.getAttribute('data-req-id');
        soundFx.playWin();
        btn.disabled = true;
        try {
          await friendsManager.acceptFriendRequest(reqId);
        } catch (err) {
          alert(err.message || 'Errore durante l\'accettazione.');
          btn.disabled = false;
        }
      });
    });

    container.querySelectorAll('button[data-action="reject-req"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const reqId = btn.getAttribute('data-req-id');
        soundFx.playSnap();
        btn.disabled = true;
        try {
          await friendsManager.rejectFriendRequest(reqId);
        } catch (err) {
          alert(err.message || 'Errore nel rifiutare la richiesta.');
          btn.disabled = false;
        }
      });
    });

    // Action for cancel outgoing friend request
    container.querySelectorAll('button[data-action="cancel-req"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const reqId = btn.getAttribute('data-req-id');
        soundFx.playSnap();
        btn.disabled = true;
        try {
          await friendsManager.cancelFriendRequest(reqId);
        } catch (err) {
          alert(err.message || 'Errore nell\'annullare la richiesta.');
          btn.disabled = false;
        }
      });
    });
  }
}

export const friendsModal = new FriendsModal();
