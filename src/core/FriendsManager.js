// Friends & Social Multiplayer Invitation Manager for Piuccia Games

import { supabase } from './supabaseClient.js';
import { authManager } from './AuthManager.js';

class FriendsManager {
  constructor() {
    this.listeners = new Set();
    this.pollInterval = null;
    this.realtimeChannel = null;
    this.cachedFriends = [];
    this.cachedIncomingRequests = [];
    this.cachedOutgoingRequests = [];
    this.cachedIncomingInvites = [];

    // Start polling / listening when user is authenticated
    authManager.onAuthChange(({ isAuthenticated }) => {
      if (isAuthenticated) {
        this.startSync();
      } else {
        this.stopSync();
        this.clearCache();
      }
    });
  }

  clearCache() {
    this.cachedFriends = [];
    this.cachedIncomingRequests = [];
    this.cachedOutgoingRequests = [];
    this.cachedIncomingInvites = [];
    this.notifyListeners();
  }

  startSync() {
    this.refreshAll();
    if (!this.pollInterval) {
      this.pollInterval = setInterval(() => {
        this.refreshAll();
      }, 6000);
    }
  }

  stopSync() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.realtimeChannel) {
      supabase.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
  }

  async refreshAll() {
    const user = authManager.getUser();
    if (!user) return;

    try {
      await Promise.allSettled([
        this.fetchFriends(),
        this.fetchPendingRequests(),
        this.fetchIncomingGameInvites()
      ]);
      this.notifyListeners();
    } catch (err) {
      console.warn('[FriendsManager] Errore sincronizzazione:', err);
    }
  }

  /**
   * Search other users by username
   */
  async searchUsers(query) {
    const clean = (query || '').trim();
    const user = authManager.getUser();
    if (!clean || clean.length < 2 || !user) return [];

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, created_at')
        .ilike('username', `%${clean}%`)
        .neq('id', user.id)
        .limit(15);

      if (error) {
        console.warn('[FriendsManager] Errore ricerca utenti:', error.message);
        return [];
      }

      // Annotate each user with friendship/request status
      const friendIds = new Set(this.cachedFriends.map(f => f.id));
      const outgoingIds = new Set(this.cachedOutgoingRequests.map(r => r.receiver_id));
      const incomingIds = new Set(this.cachedIncomingRequests.map(r => r.sender_id));

      return (data || []).map(profile => {
        let status = 'none'; // none | friend | request_sent | request_received
        if (friendIds.has(profile.id)) {
          status = 'friend';
        } else if (outgoingIds.has(profile.id)) {
          status = 'request_sent';
        } else if (incomingIds.has(profile.id)) {
          status = 'request_received';
        }

        return {
          ...profile,
          status
        };
      });
    } catch (err) {
      console.warn('[FriendsManager] Errore imprevisto ricerca:', err);
      return [];
    }
  }

  /**
   * Send friend request to another user
   */
  async sendFriendRequest(receiverId) {
    const user = authManager.getUser();
    if (!user) throw new Error('Devi aver effettuato l\'accesso.');
    if (user.id === receiverId) throw new Error('Non puoi inviare una richiesta a te stesso.');

    const { error } = await supabase
      .from('friend_requests')
      .insert({
        sender_id: user.id,
        receiver_id: receiverId,
        status: 'pending'
      });

    if (error) {
      if (error.code === '23505') { // Unique violation
        throw new Error('Richiesta già inviata o esistente.');
      }
      throw new Error('Impossibile inviare la richiesta di amicizia.');
    }

    await this.fetchPendingRequests();
    this.notifyListeners();
    return true;
  }

  /**
   * Fetch confirmed friends list
   */
  async fetchFriends() {
    const user = authManager.getUser();
    if (!user) return [];

    try {
      const { data, error } = await supabase
        .from('friendships')
        .select(`
          id,
          friend_id,
          created_at,
          profiles:friend_id (id, username, created_at)
        `)
        .eq('user_id', user.id);

      if (error) {
        if (error.code !== 'PGRST205') {
          console.warn('[FriendsManager] Errore recupero amici:', error.message);
        }
        this.cachedFriends = [];
        return [];
      }

      this.cachedFriends = (data || []).map(row => ({
        friendshipId: row.id,
        id: row.friend_id,
        username: row.profiles?.username || 'Giocatore',
        friendsSince: row.created_at
      }));

      return this.cachedFriends;
    } catch (err) {
      this.cachedFriends = [];
      return [];
    }
  }

  /**
   * Fetch incoming and outgoing friend requests
   */
  async fetchPendingRequests() {
    const user = authManager.getUser();
    if (!user) return { incoming: [], outgoing: [] };

    try {
      // 1. Incoming
      const { data: incomingData, error: errInc } = await supabase
        .from('friend_requests')
        .select(`
          id,
          sender_id,
          status,
          created_at,
          sender:sender_id (id, username)
        `)
        .eq('receiver_id', user.id)
        .eq('status', 'pending');

      // 2. Outgoing
      const { data: outgoingData, error: errOut } = await supabase
        .from('friend_requests')
        .select(`
          id,
          receiver_id,
          status,
          created_at,
          receiver:receiver_id (id, username)
        `)
        .eq('sender_id', user.id)
        .eq('status', 'pending');

      if (!errInc) {
        this.cachedIncomingRequests = (incomingData || []).map(r => ({
          id: r.id,
          sender_id: r.sender_id,
          username: r.sender?.username || 'Giocatore',
          created_at: r.created_at
        }));
      }

      if (!errOut) {
        this.cachedOutgoingRequests = (outgoingData || []).map(r => ({
          id: r.id,
          receiver_id: r.receiver_id,
          username: r.receiver?.username || 'Giocatore',
          created_at: r.created_at
        }));
      }

      return {
        incoming: this.cachedIncomingRequests,
        outgoing: this.cachedOutgoingRequests
      };
    } catch (err) {
      return { incoming: [], outgoing: [] };
    }
  }

  /**
   * Accept friend request
   */
  async acceptFriendRequest(requestId) {
    const user = authManager.getUser();
    if (!user) throw new Error('Non connesso.');

    // Find request
    const req = this.cachedIncomingRequests.find(r => r.id === requestId);
    if (!req) throw new Error('Richiesta non trovata.');

    // Update status to accepted
    const { error: updateErr } = await supabase
      .from('friend_requests')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('id', requestId);

    if (updateErr) throw new Error('Errore durante l\'accettazione.');

    // Create bidirectional friendship rows
    try {
      await supabase.from('friendships').upsert([
        { user_id: user.id, friend_id: req.sender_id },
        { user_id: req.sender_id, friend_id: user.id }
      ]);
    } catch (err) {
      console.warn('[FriendsManager] Creazione friendship parziale:', err);
    }

    await this.refreshAll();
    return true;
  }

  /**
   * Reject friend request
   */
  async rejectFriendRequest(requestId) {
    const { error } = await supabase
      .from('friend_requests')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', requestId);

    if (error) throw new Error('Errore nel rifiutare la richiesta.');
    await this.fetchPendingRequests();
    this.notifyListeners();
    return true;
  }

  /**
   * Cancel outgoing request
   */
  async cancelFriendRequest(requestId) {
    const { error } = await supabase
      .from('friend_requests')
      .delete()
      .eq('id', requestId);

    if (error) throw new Error('Errore nell\'annullare la richiesta.');
    await this.fetchPendingRequests();
    this.notifyListeners();
    return true;
  }

  /**
   * Remove friend
   */
  async removeFriend(friendUserId) {
    const user = authManager.getUser();
    if (!user) return;

    await supabase
      .from('friendships')
      .delete()
      .or(`and(user_id.eq.${user.id},friend_id.eq.${friendUserId}),and(user_id.eq.${friendUserId},friend_id.eq.${user.id})`);

    await this.refreshAll();
    return true;
  }

  /**
   * Send game challenge / invitation
   */
  async sendGameInvite(friendUserId, gameType = 'scopa') {
    const user = authManager.getUser();
    if (!user) throw new Error('Non connesso.');

    const { data, error } = await supabase
      .from('game_invites')
      .insert({
        from_user_id: user.id,
        to_user_id: friendUserId,
        game_type: gameType,
        status: 'pending'
      })
      .select()
      .single();

    if (error) {
      throw new Error('Impossibile inviare la sfida di gioco. Riprova.');
    }

    return data;
  }

  /**
   * Fetch incoming game invites
   */
  async fetchIncomingGameInvites() {
    const user = authManager.getUser();
    if (!user) return [];

    try {
      const { data, error } = await supabase
        .from('game_invites')
        .select(`
          id,
          from_user_id,
          game_type,
          status,
          created_at,
          sender:from_user_id (id, username)
        `)
        .eq('to_user_id', user.id)
        .eq('status', 'pending');

      if (error) {
        this.cachedIncomingInvites = [];
        return [];
      }

      this.cachedIncomingInvites = (data || []).map(inv => ({
        id: inv.id,
        from_user_id: inv.from_user_id,
        fromUsername: inv.sender?.username || 'Un amico',
        gameType: inv.game_type,
        created_at: inv.created_at
      }));

      return this.cachedIncomingInvites;
    } catch (err) {
      this.cachedIncomingInvites = [];
      return [];
    }
  }

  /**
   * Respond to a game invite (accept or decline)
   */
  async respondToGameInvite(inviteId, accept = true) {
    const newStatus = accept ? 'accepted' : 'declined';
    const { error } = await supabase
      .from('game_invites')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', inviteId);

    if (error) throw new Error('Errore risposta sfida.');
    await this.fetchIncomingGameInvites();
    this.notifyListeners();
    return true;
  }

  subscribe(callback) {
    this.listeners.add(callback);
    // Initial emit
    callback(this.getState());
    return () => this.listeners.delete(callback);
  }

  getState() {
    return {
      friends: this.cachedFriends,
      incomingRequests: this.cachedIncomingRequests,
      outgoingRequests: this.cachedOutgoingRequests,
      incomingInvites: this.cachedIncomingInvites,
      pendingBadgeCount: this.cachedIncomingRequests.length + this.cachedIncomingInvites.length
    };
  }

  notifyListeners() {
    const state = this.getState();
    this.listeners.forEach(cb => {
      try {
        cb(state);
      } catch (err) {
        console.error('[FriendsManager] Errore listener:', err);
      }
    });
  }
}

export const friendsManager = new FriendsManager();
