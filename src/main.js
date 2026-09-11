// Application Entry Point & Game Orchestrator

import './style.css';
import { gameManager } from './core/GameManager.js';
import { soundFx } from './core/SoundFx.js';
import { pwaManager } from './core/PwaManager.js';
import { authManager } from './core/AuthManager.js';
import { LobbyView } from './components/LobbyView.js';
import { ScopaView } from './games/scopa/ScopaView.js';
import { AuthView } from './components/AuthView.js';

const appContainer = document.getElementById('app');

let authView = null;
let lobbyView = null;
let scopaView = null;

function renderCurrentView(viewName, params = {}) {
  if (!appContainer) return;

  if (viewName === 'auth') {
    if (!authView) {
      authView = new AuthView(appContainer);
    }
    authView.render();
  } else if (viewName === 'lobby') {
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

// React to authentication state changes
authManager.onAuthChange(({ isAuthenticated }) => {
  if (!isAuthenticated && gameManager.getView() !== 'auth') {
    gameManager.setView('auth');
  } else if (isAuthenticated && gameManager.getView() === 'auth') {
    gameManager.setView('lobby');
  }
});

// Unlock Audio Context on first user touch or click
window.addEventListener('click', () => {
  soundFx.initContext();
}, { once: true });

window.addEventListener('touchstart', () => {
  soundFx.initContext();
}, { once: true });

// Initial App Boot: wait for Supabase session check
async function bootstrapApp() {
  await authManager.ready();
  if (authManager.isAuthenticated()) {
    // Returning user already registered and logged in: straight to Lobby!
    gameManager.setView('lobby');
  } else {
    // First time visitor: show Onboarding & Registration screen!
    gameManager.setView('auth');
  }
}

bootstrapApp();
