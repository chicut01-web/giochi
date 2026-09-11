// PWA Manager: Handles Service Worker registration and App Install prompts

class PwaManager {
  constructor() {
    this.deferredPrompt = null;
    this.isInstallable = false;
    this.listeners = new Set();
    this.init();
  }

  init() {
    // Check if running in standalone mode (already installed as PWA)
    this.isStandalone = this.checkIsStandalone();

    // Listen to beforeinstallprompt on Chromium (Android, Chrome, Edge)
    window.addEventListener('beforeinstallprompt', (e) => {
      // Prevent browser default mini-infobar
      e.preventDefault();
      this.deferredPrompt = e;
      this.isInstallable = true;
      this.notifyListeners();
    });

    // Listen to app installed event
    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.isInstallable = false;
      this.isStandalone = true;
      this.notifyListeners();
      console.log('[PWA] App installata con successo sulla schermata home!');
    });

    // Register Service Worker in production / supported environments
    this.registerServiceWorker();
  }

  checkIsStandalone() {
    const isStandaloneMQ = window.matchMedia('(display-mode: standalone)').matches;
    const isIOSStandalone = window.navigator.standalone === true;
    return isStandaloneMQ || isIOSStandalone;
  }

  isIOS() {
    const userAgent = window.navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(userAgent) || 
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  isAndroid() {
    return /Android/i.test(navigator.userAgent || '');
  }

  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        console.log('[PWA] Service Worker registrato con successo. Scope:', registration.scope);
      } catch (err) {
        console.warn('[PWA] Service Worker non registrato:', err);
      }
    }
  }

  async promptInstall() {
    if (this.deferredPrompt) {
      this.deferredPrompt.prompt();
      const { outcome } = await this.deferredPrompt.userChoice;
      console.log(`[PWA] Scelta utente installazione: ${outcome}`);
      this.deferredPrompt = null;
      this.isInstallable = false;
      this.notifyListeners();
      return { success: outcome === 'accepted', method: 'native' };
    }

    if (this.isIOS()) {
      return { success: false, method: 'ios-guide' };
    }

    return { success: false, method: 'manual-guide' };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyListeners() {
    this.listeners.forEach((listener) => {
      try {
        listener({
          isStandalone: this.checkIsStandalone(),
          isInstallable: this.isInstallable,
          isIOS: this.isIOS()
        });
      } catch (err) {
        console.error('[PWA] Listener error:', err);
      }
    });
  }
}

export const pwaManager = new PwaManager();
