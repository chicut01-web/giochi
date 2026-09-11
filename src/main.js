// Application Entry Point & Game Orchestrator

import './style.css';
import { gameManager } from './core/GameManager.js';
import { soundFx } from './core/SoundFx.js';
import { pwaManager } from './core/PwaManager.js';
import { LobbyView } from './components/LobbyView.js';
import { ScopaView } from './games/scopa/ScopaView.js';

const appContainer = document.getElementById('app');

let lobbyView = null;
let scopaView = null;

function renderCurrentView(viewName, params = {}) {
  if (!appContainer) return;

  if (viewName === 'lobby') {
    if (!lobbyView) {
      lobbyView = new LobbyView(appContainer);
    }
    lobbyView.render();
  } else if (viewName === 'scopa') {
    if (!scopaView) {
      scopaView = new ScopaView(appContainer);
    }
    scopaView.init(params);
  }
}

// Subscribe to view changes
gameManager.onViewChange((viewName, params) => {
  renderCurrentView(viewName, params);
});

// Unlock Audio Context on first user touch or click
window.addEventListener('click', () => {
  soundFx.initContext();
}, { once: true });

window.addEventListener('touchstart', () => {
  soundFx.initContext();
}, { once: true });

// Initial render
renderCurrentView(gameManager.getView());
