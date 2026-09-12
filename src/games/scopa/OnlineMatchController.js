// MatchController per le partite fra amici. Non esegue il motore:
// chiede alla Edge Function e disegna quello che torna.

import { supabase } from '../../core/supabaseClient.js';

const POLL_MS = 3000;

export class OnlineMatchController {
  constructor({ sessionId }) {
    this.sessionId = sessionId;
    this.listeners = new Set();
    this.view = null;
    this.channel = null;
    this.pollInterval = null;
    this.timeoutClaimed = false;
    this.connected = true;
  }

  async call(action, payload = {}) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) return { error: 'not_authenticated' };

    const { data, error } = await supabase.functions.invoke('scopa', {
      body: { action, sessionId: this.sessionId, ...payload },
      headers: { Authorization: `Bearer ${token}` }
    });

    if (error) {
      let errBody = null;
      try {
        if (error.context && typeof error.context.json === 'function') {
          errBody = await error.context.json();
        }
      } catch (e) {
        // ignore json parse error
      }
      console.warn('[OnlineMatchController] errore', action, error, errBody);

      if (errBody?.view) {
        this.view = { ...errBody.view, connected: this.connected };
        this.timeoutClaimed = false;
        this.emit();
      }
      return {
        error: errBody?.error || 'network',
        view: errBody?.view,
        status: error.status
      };
    }

    if (data?.view) {
      this.view = { ...data.view, connected: this.connected };
      this.timeoutClaimed = false;
      this.emit();
    }
    return data || {};
  }

  async start() {
    await this.call('state');
    this.subscribeRealtime();
    this.startPolling();
  }

  subscribeRealtime() {
    this.channel = supabase
      .channel(`scopa_session_${this.sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'game_sessions',
          filter: `id=eq.${this.sessionId}`
        },
        () => this.call('state')
      )
      .subscribe((status) => {
        this.connected = status === 'SUBSCRIBED';
        if (this.view) {
          this.view = { ...this.view, connected: this.connected };
          this.emit();
        }
      });
  }

  // Rete mobile e schede in background fanno cadere il canale: il polling
  // è la rete di sicurezza, e serve anche a far scattare i turni scaduti.
  startPolling() {
    this.stopPolling();
    this.pollInterval = setInterval(() => {
      this.call('state');
      this.checkDeadline();
    }, POLL_MS);
  }

  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  checkDeadline() {
    if (!this.view || this.view.status !== 'active' || !this.view.turnDeadline) return;
    if (this.timeoutClaimed) return;
    if (new Date(this.view.turnDeadline).getTime() > Date.now()) return;

    this.timeoutClaimed = true;
    this.call('timeout');
  }

  getView() {
    return this.view;
  }

  async playCard(cardId, chosenOption = null) {
    const res = await this.call('move', {
      cardId,
      chosenOption,
      version: this.view?.version
    });
    if (res.error) return { ok: false, error: res.error };
    return { ok: true };
  }

  async claimTimeout() {
    await this.call('timeout');
  }

  async nextRound() {
    const res = await this.call('next_round');
    if (res.error) return { ok: false, error: res.error };
    return { ok: true };
  }

  async concede() {
    await this.call('concede');
  }

  onChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  emit() {
    this.listeners.forEach(cb => {
      try {
        cb(this.view);
      } catch (err) {
        console.error('[OnlineMatchController] errore listener:', err);
      }
    });
  }

  destroy() {
    this.stopPolling();
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this.listeners.clear();
  }
}
