// Supabase Authentication Manager for Piuccia Games

import { supabase } from './supabaseClient.js';

class AuthManager {
  constructor() {
    this.currentUser = null;
    this.currentSession = null;
    this.listeners = new Set();
    this.isInitialized = false;
    this.initPromise = this.init();
  }

  async init() {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        console.warn('[AuthManager] Errore recupero sessione iniziale:', error.message);
      }
      this.currentSession = session;
      this.currentUser = session?.user || null;
    } catch (err) {
      console.warn('[AuthManager] Inizializzazione sessione fallita:', err);
    } finally {
      this.isInitialized = true;
      this.notifyListeners();
    }

    // Listen to real-time auth changes (signed in, signed out, token refreshed)
    supabase.auth.onAuthStateChange((event, session) => {
      console.log(`[AuthManager] Evento Auth: ${event}`);
      this.currentSession = session;
      this.currentUser = session?.user || null;
      this.notifyListeners();
    });
  }

  async ready() {
    if (this.isInitialized) return;
    await this.initPromise;
  }

  isAuthenticated() {
    return !!this.currentUser;
  }

  getUser() {
    return this.currentUser;
  }

  getNickname() {
    if (!this.currentUser) return null;
    return (
      this.currentUser.user_metadata?.nickname ||
      this.currentUser.user_metadata?.display_name ||
      this.currentUser.email?.split('@')[0] ||
      'Giocatore'
    );
  }

  getUserEmail() {
    return this.currentUser?.email || '';
  }

  async signUp({ email, password, nickname }) {
    const trimmedEmail = email.trim();
    const cleanNick = (nickname || '').trim() || trimmedEmail.split('@')[0];

    const redirectUrl = typeof window !== 'undefined' && window.location.origin
      ? `${window.location.origin}/`
      : 'https://piuccia-games.vercel.app/';

    const { data, error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          display_name: cleanNick,
          nickname: cleanNick
        }
      }
    });

    if (error) {
      throw new Error(this.translateAuthError(error.message));
    }

    // If session is present immediately (e.g. email confirm off or autoconfirm)
    if (data.session) {
      this.currentSession = data.session;
      this.currentUser = data.user;
      this.notifyListeners();
      return { success: true, user: data.user, autoLoggedIn: true };
    }

    return { 
      success: true, 
      user: data.user, 
      autoLoggedIn: false, 
      message: 'Registrazione completata! Se la conferma email è attiva, controlla la tua posta.' 
    };
  }

  async signIn({ email, password }) {
    const trimmedEmail = email.trim();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password
    });

    if (error) {
      throw new Error(this.translateAuthError(error.message));
    }

    this.currentSession = data.session;
    this.currentUser = data.user;
    this.notifyListeners();
    return { success: true, user: data.user };
  }

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.warn('[AuthManager] Errore durante il logout:', error.message);
    }
    this.currentSession = null;
    this.currentUser = null;
    this.notifyListeners();
    return { success: true };
  }

  onAuthChange(callback) {
    this.listeners.add(callback);
    // Call immediately with current state
    if (this.isInitialized) {
      try {
        callback({
          isAuthenticated: this.isAuthenticated(),
          user: this.currentUser,
          nickname: this.getNickname()
        });
      } catch (err) {
        console.error('[AuthManager] Errore callback:', err);
      }
    }
    return () => this.listeners.delete(callback);
  }

  notifyListeners() {
    const payload = {
      isAuthenticated: this.isAuthenticated(),
      user: this.currentUser,
      nickname: this.getNickname()
    };
    this.listeners.forEach((callback) => {
      try {
        callback(payload);
      } catch (err) {
        console.error('[AuthManager] Errore listener:', err);
      }
    });
  }

  translateAuthError(message) {
    const m = (message || '').toLowerCase();
    if (m.includes('invalid login credentials')) {
      return 'Email o password non corretti. Verifica e riprova.';
    }
    if (m.includes('email not confirmed')) {
      return 'Email non ancora confermata. Controlla la tua casella di posta per attivare l\'account.';
    }
    if (m.includes('user already registered')) {
      return 'Esiste già un account registrato con questa email. Prova ad accedere.';
    }
    if (m.includes('password should be at least')) {
      return 'La password deve contenere almeno 6 caratteri.';
    }
    if (m.includes('invalid format') || m.includes('valid email')) {
      return 'Inserisci un indirizzo email valido.';
    }
    if (m.includes('rate limit')) {
      return 'Troppi tentativi in poco tempo. Attendi qualche minuto prima di riprovare.';
    }
    return message || 'Si è verificato un errore durante l\'autenticazione.';
  }
}

export const authManager = new AuthManager();
