// Game Manager: State, Routing, and Persistence

class GameManager {
  constructor() {
    this.currentView = 'lobby'; // 'lobby' | 'scopa'
    this.viewListeners = [];
    this.settings = this.loadSettings();
    this.stats = this.loadStats();
  }

  loadSettings() {
    const defaults = {
      targetPoints: 11, // 11, 21, or 1 (partita secca)
      animationSpeed: 'normal', // 'normal' | 'fast'
      sound: true
    };
    try {
      const saved = localStorage.getItem('giochi_settings');
      return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
    } catch {
      return defaults;
    }
  }

  saveSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    localStorage.setItem('giochi_settings', JSON.stringify(this.settings));
  }

  loadStats() {
    const defaults = {
      scopa: {
        matchesPlayed: 0,
        matchesWon: 0,
        totalScope: 0,
        totalSettebelli: 0,
        totalPrimiera: 0,
        highScore: 0
      }
    };
    try {
      const saved = localStorage.getItem('giochi_player_stats');
      return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
    } catch {
      return defaults;
    }
  }

  saveStats() {
    localStorage.setItem('giochi_player_stats', JSON.stringify(this.stats));
  }

  recordScopaMatch({ won, scopeMade, gotSettebello, gotPrimiera, finalScore }) {
    const s = this.stats.scopa;
    s.matchesPlayed += 1;
    if (won) s.matchesWon += 1;
    s.totalScope += (scopeMade || 0);
    if (gotSettebello) s.totalSettebelli += 1;
    if (gotPrimiera) s.totalPrimiera += 1;
    if (finalScore > s.highScore) s.highScore = finalScore;
    this.saveStats();
  }

  onViewChange(listener) {
    this.viewListeners.push(listener);
  }

  setView(viewName, params = {}) {
    this.currentView = viewName;
    this.viewListeners.forEach(fn => fn(viewName, params));
  }

  getView() {
    return this.currentView;
  }
}

export const gameManager = new GameManager();
