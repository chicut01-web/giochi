// Supabase Authentication Manager for Piuccia Games

import { supabase } from './supabaseClient.js';
import { validatePassword, validateUsername } from '../utils/validators.js';

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
      if (this.currentUser) {
        this.syncProfile();
      }
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
      if (this.currentUser) {
        this.syncProfile();
      }
      this.notifyListeners();
    });
  }

  async syncProfile() {
    if (!this.currentUser) return;
    const nickname = this.getNickname();
    try {
      await supabase.from('profiles').upsert({
        id: this.currentUser.id,
        username: nickname,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });
    } catch (err) {
      console.warn('[AuthManager] syncProfile ignorato (tabella non ancora creata o errore):', err);
    }
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

  /**
   * Check if a username is available in Supabase profiles
   */
  async checkUsernameAvailability(rawUsername) {
    const format = validateUsername(rawUsername);
    if (!format.isValid) {
      return { available: false, message: format.errorMsg };
    }

    const clean = rawUsername.trim();
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username')
        .ilike('username', clean)
        .limit(1);

      if (error) {
        // If table doesn't exist yet, we allow signup to proceed
        if (error.code === 'PGRST205') {
          return { available: true, message: 'Username valido.' };
        }
        console.warn('[AuthManager] Errore verifica username:', error.message);
        return { available: true, message: 'Username valido.' };
      }

      if (data && data.length > 0) {
        return { available: false, message: 'Questo username è già occupato da un altro giocatore.' };
      }

      return { available: true, message: 'Username disponibile!' };
    } catch (err) {
      return { available: true, message: 'Username valido.' };
    }
  }

  async signUp({ email, password, nickname }) {
    const trimmedEmail = email.trim();
    const cleanNick = (nickname || '').trim();

    // 1. Check Username Format & Uniqueness
    const userValidation = validateUsername(cleanNick);
    if (!userValidation.isValid) {
      throw new Error(userValidation.errorMsg);
    }

    const availCheck = await this.checkUsernameAvailability(cleanNick);
    if (!availCheck.available) {
      throw new Error(availCheck.message);
    }

    // 2. Check Password Complexity (min 8 chars, lower, upper, number, special)
    const pwValidation = validatePassword(password);
    if (!pwValidation.isValid) {
      throw new Error(pwValidation.errorMsg);
    }

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

    // Try to ensure the profile row is present immediately
    if (data?.user?.id) {
      try {
        await supabase.from('profiles').upsert({
          id: data.user.id,
          username: cleanNick,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      } catch (profileErr) {
        console.warn('[AuthManager] Creazione profilo post-signup rimandata:', profileErr);
      }
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
