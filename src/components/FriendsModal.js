// Friends, Social Search & Multiplayer Challenges Modal

import { friendsManager } from '../core/FriendsManager.js';
import { soundFx } from '../core/SoundFx.js';
import { gameManager } from '../core/GameManager.js';
import { authManager } from '../core/AuthManager.js';

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
    this.dialog?.close();
  }

  render() {
    if (!this.dialog) return;

    this.dialog.innerHTML = `
      <div class="dialog-content friends-modal-content">
        <!-- Modal Header -->
        <header class="friends-modal-header">
          <div class="friends-modal-title-box">
            <span class="friends-title-icon">👥</span>
            <div>
              <h2 class="dialog-title">Circolo Amici & Sfide</h2>
              <p class="friends-modal-subtitle">Trova amici per username e sfidali a Scopa!</p>
            </div>
          </div>
          <button class="friends-modal-close-btn" id="friends-modal-close" title="Chiudi">✕</button>
        </header>

        <!-- Navigation Tabs -->
        <div class="friends-modal-tabs" role="tablist">
          <button class="friends-tab-btn ${this.currentTab === 'friends' ? 'active' : ''}" id="ftab-friends">
            <span>👥 Amici</span>
            <span class="tab-counter-badge" id="ftab-count-friends">0</span>
          </button>
          <button class="friends-tab-btn ${this.currentTab === 'search' ? 'active' : ''}" id="ftab-search">
            <span>🔍 Cerca Giocatori</span>
          </button>
          <button class="friends-tab-btn ${this.currentTab === 'requests' ? 'active' : ''}" id="ftab-requests">
            <span>📬 Richieste</span>
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
      const incomingCount = state.incomingRequests.length;
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
      this.renderRequestsTab(body, state.incomingRequests, state.outgoingRequests);
    }
  }

  renderFriendsTab(container, friends) {
    if (friends.length === 0) {
      container.innerHTML = `
        <div class="friends-empty-state">
          <div class="empty-icon">🤝</div>
          <h3>Nessun amico ancora aggiunto</h3>
          <p>Cerca il nome dei tuoi amici nella scheda <strong>"Cerca Giocatori"</strong> per aggiungerli e sfidarli a Scopa!</p>
          <button class="friends-cta-btn" id="cta-go-search">Trova Amici Ora</button>
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
                <span>👤</span>
              </div>
              <div class="friend-card-info">
                <span class="friend-username">${friend.username}</span>
                <span class="friend-subtext">Amici</span>
              </div>
              <div class="friend-card-actions">
                <button class="action-btn challenge-btn" data-action="challenge" data-friend-id="${friend.id}" data-friend-name="${friend.username}">
                  <span>⚔️ Sfida</span>
                </button>
                <button class="action-btn icon-btn remove-friend-btn" data-action="remove" data-friend-id="${friend.id}" title="Rimuovi amico">
                  <span>🗑️</span>
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
          await friendsManager.sendGameInvite(friendId, 'scopa');
          soundFx.playWin();
          btn.innerHTML = '<span>Sfida Inviata! ✓</span>';
          setTimeout(() => {
            btn.disabled = false;
            btn.innerHTML = '<span>⚔️ Sfida</span>';
          }, 2500);
        } catch (err) {
          soundFx.playSnap();
          alert(err.message || 'Errore durante l\'invio della sfida.');
          btn.disabled = false;
          btn.innerHTML = '<span>⚔️ Sfida</span>';
        }
      });
    });

    container.querySelectorAll('button[data-action="remove"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const friendId = btn.getAttribute('data-friend-id');
        if (confirm('Vuoi rimuovere questo giocatore dai tuoi amici?')) {
          soundFx.playSnap();
          await friendsManager.removeFriend(friendId);
        }
      });
    });
  }

  renderSearchTab(container) {
    container.innerHTML = `
      <div class="friends-search-box">
        <div class="search-input-wrapper">
          <span class="search-icon">🔍</span>
          <input 
            type="text" 
            id="friends-search-input" 
            placeholder="Cerca per username (es. Mario, Piuccia...)" 
            value="${this.searchQuery}" 
            autocomplete="off" 
          />
          ${this.searchQuery ? `<button class="clear-search-btn" id="clear-search-btn">✕</button>` : ''}
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
              <span>👤</span>
            </div>
            <div class="friend-card-info">
              <span class="friend-username">${user.username}</span>
              <span class="friend-subtext">Giocatore</span>
            </div>
            <div class="friend-card-actions">
              ${user.status === 'friend' ? `
                <span class="status-badge badge-friend">✓ Amico</span>
              ` : user.status === 'request_sent' ? `
                <span class="status-badge badge-pending">⏳ Richiesta Inviata</span>
              ` : user.status === 'request_received' ? `
                <span class="status-badge badge-notice">📬 Ti ha invitato</span>
              ` : `
                <button class="action-btn send-req-btn" data-action="send-request" data-user-id="${user.id}">
                  <span>➕ Aggiungi</span>
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
          await friendsManager.sendFriendRequest(targetUserId);
          soundFx.playWin();
          btn.outerHTML = `<span class="status-badge badge-pending">⏳ Richiesta Inviata</span>`;
        } catch (err) {
          soundFx.playSnap();
          alert(err.message || 'Errore durante l\'invio della richiesta.');
          btn.disabled = false;
          btn.innerHTML = '<span>➕ Aggiungi</span>';
        }
      });
    });
  }

  renderRequestsTab(container, incoming, outgoing) {
    if (incoming.length === 0 && outgoing.length === 0) {
      container.innerHTML = `
        <div class="friends-empty-state">
          <div class="empty-icon">📭</div>
          <h3>Nessuna richiesta in sospeso</h3>
          <p>Quando qualcuno ti invia una richiesta di amicizia o accetta la tua, la troverai qui.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="requests-sections-wrap">
        <!-- RICEVUTE -->
        <section class="requests-sub-section">
          <h4 class="requests-section-title">Richieste Ricevute (${incoming.length})</h4>
          ${incoming.length === 0 ? `
            <p class="requests-sub-empty">Non hai richieste di amicizia in arrivo.</p>
          ` : `
            <ul class="friends-card-list">
              ${incoming.map(req => `
                <li class="friend-card" data-req-id="${req.id}">
                  <div class="friend-card-avatar">
                    <span>👤</span>
                  </div>
                  <div class="friend-card-info">
                    <span class="friend-username">${req.username}</span>
                    <span class="friend-subtext">Vuole aggiungerti agli amici</span>
                  </div>
                  <div class="friend-card-actions">
                    <button class="action-btn accept-btn" data-action="accept-req" data-req-id="${req.id}">
                      <span>✓ Accetta</span>
                    </button>
                    <button class="action-btn reject-btn" data-action="reject-req" data-req-id="${req.id}">
                      <span>✕ Rifiuta</span>
                    </button>
                  </div>
                </li>
              `).join('')}
            </ul>
          `}
        </section>

        <!-- INVIATE -->
        <section class="requests-sub-section">
          <h4 class="requests-section-title">Richieste Inviate in Attesa (${outgoing.length})</h4>
          ${outgoing.length === 0 ? `
            <p class="requests-sub-empty">Nessuna richiesta in attesa.</p>
          ` : `
            <ul class="friends-card-list">
              ${outgoing.map(req => `
                <li class="friend-card" data-req-id="${req.id}">
                  <div class="friend-card-avatar">
                    <span>👤</span>
                  </div>
                  <div class="friend-card-info">
                    <span class="friend-username">${req.username}</span>
                    <span class="friend-subtext">In attesa di conferma</span>
                  </div>
                  <div class="friend-card-actions">
                    <button class="action-btn cancel-req-btn" data-action="cancel-req" data-req-id="${req.id}">
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

    // Actions for incoming
    container.querySelectorAll('button[data-action="accept-req"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const reqId = btn.getAttribute('data-req-id');
        soundFx.playWin();
        btn.disabled = true;
        await friendsManager.acceptFriendRequest(reqId);
      });
    });

    container.querySelectorAll('button[data-action="reject-req"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const reqId = btn.getAttribute('data-req-id');
        soundFx.playSnap();
        btn.disabled = true;
        await friendsManager.rejectFriendRequest(reqId);
      });
    });

    // Action for cancel outgoing
    container.querySelectorAll('button[data-action="cancel-req"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const reqId = btn.getAttribute('data-req-id');
        soundFx.playSnap();
        btn.disabled = true;
        await friendsManager.cancelFriendRequest(reqId);
      });
    });
  }
}

export const friendsModal = new FriendsModal();
