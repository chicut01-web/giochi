// MatchController contro il computer. Tutto in memoria, nessuna rete.

import { createMatch, applyMove, autoMove, buildView, nextRound } from './ScopaMatch.js';

const TURN_SECONDS = 10;
const CPU_THINKING_MS = 900;

export class LocalMatchController {
  constructor({ targetScore = 11, username = 'Tu' } = {}) {
    this.targetScore = targetScore;
    this.username = username;
    this.listeners = new Set();
    this.snapshot = null;
    this.status = 'active';
    this.cpuTimeout = null;
    this.version = 1;
  }

  async start() {
    this.version = 1;
    this.snapshot = createMatch(this.targetScore);
    this.status = 'active';
    this.emit();
    this.maybePlayCpu();
  }

  getView() {
    if (!this.snapshot) return null;
    return buildView({
      publicState: this.snapshot.public,
      hand: this.snapshot.hands[1],
      seat: 1,
      status: this.status,
      turnSeat: this.snapshot.turnSeat,
      turnDeadline: null,
      version: this.version,
      usernames: { 1: this.username, 2: 'CPU Master' },
      mode: 'local',
      turnSeconds: TURN_SECONDS
    });
  }

  async playCard(cardId, chosenOption = null) {
    const res = applyMove(this.snapshot.secret, 1, cardId, chosenOption);
    if (!res.ok) return { ok: false, error: res.error };

    this.version++;
    this.snapshot = res.snapshot;
    this.afterMove();
    return { ok: true };
  }

  // Tempo scaduto: gioca al posto dell'umano, come faceva onTimerExpired
  async claimTimeout() {
    if (this.status !== 'active') return;
    const res = autoMove(this.snapshot.secret, this.snapshot.turnSeat);
    if (!res.ok) return;

    this.version++;
    this.snapshot = res.snapshot;
    this.afterMove();
  }

  // Nuova smazzata dopo che la precedente si è conclusa
  async nextRound() {
    if (this.status !== 'active') return { ok: false, error: 'not_active' };
    const res = nextRound(this.snapshot.secret);
    if (!res.ok) return { ok: false, error: res.error };

    this.version++;
    this.snapshot = res.snapshot;
    this.emit();
    this.maybePlayCpu();
    return { ok: true };
  }

  async concede() {
    this.status = 'abandoned';
    this.clearCpuTimeout();
    this.emit();
  }

  afterMove() {
    if (this.snapshot.public.isMatchOver) {
      this.status = 'finished';
    }
    this.emit();
    this.maybePlayCpu();
  }

  maybePlayCpu() {
    this.clearCpuTimeout();
    if (this.status !== 'active') return;
    if (this.snapshot.turnSeat !== 2) return;
    if (this.snapshot.public.isRoundOver) return;

    this.cpuTimeout = setTimeout(() => {
      const res = autoMove(this.snapshot.secret, 2);
      if (!res.ok) return;
      this.version++;
      this.snapshot = res.snapshot;
      this.afterMove();
    }, CPU_THINKING_MS);
  }

  clearCpuTimeout() {
    if (this.cpuTimeout) {
      clearTimeout(this.cpuTimeout);
      this.cpuTimeout = null;
    }
  }

  onChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  emit() {
    const view = this.getView();
    this.listeners.forEach(cb => {
      try {
        cb(view);
      } catch (err) {
        console.error('[LocalMatchController] errore listener:', err);
      }
    });
  }

  destroy() {
    this.clearCpuTimeout();
    this.listeners.clear();
  }
}
