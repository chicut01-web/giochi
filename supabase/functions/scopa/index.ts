// @ts-ignore: Deno/JSR import
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createMatch, applyMove, autoMove, buildView, nextRound } from '../_shared/ScopaMatch.js';

declare const Deno: any;

const TURN_SECONDS = 25;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } }
);

function deadline() {
  return new Date(Date.now() + TURN_SECONDS * 1000).toISOString();
}

// In-memory username cache for fast subsequent turns
const usernameCache = new Map<string, string>();

async function loadUsernames(ids: string[]) {
  const missing = ids.filter(id => !usernameCache.has(id));
  if (missing.length > 0) {
    const { data } = await admin.from('profiles').select('id, username').in('id', missing);
    for (const row of data || []) {
      if (row.id) usernameCache.set(row.id, row.username || 'Giocatore');
    }
  }
  const map: Record<string, string> = {};
  for (const id of ids) {
    map[id] = usernameCache.get(id) || 'Giocatore';
  }
  return map;
}

// Compone la vista del chiamante leggendo sessione + mano propria
async function viewFor(sessionId: string, userId: string) {
  const [sessionRes, handRes] = await Promise.all([
    admin.from('game_sessions').select('*').eq('id', sessionId).single(),
    admin.from('game_session_hands').select('hand').eq('session_id', sessionId).eq('user_id', userId).single()
  ]);

  const session = sessionRes.data;
  if (!session) return { error: 'session_not_found', status: 404 };

  const seat = session.player_a === userId ? 1 : session.player_b === userId ? 2 : null;
  if (!seat) return { error: 'not_a_participant', status: 403 };

  const names = await loadUsernames([session.player_a, session.player_b]);

  return {
    session,
    seat,
    view: buildView({
      publicState: session.public_state,
      hand: handRes.data?.hand || [],
      seat,
      status: session.status,
      turnSeat: session.turn_seat,
      turnDeadline: session.turn_deadline,
      version: session.version,
      usernames: {
        1: names[session.player_a] || 'Giocatore 1',
        2: names[session.player_b] || 'Giocatore 2'
      },
      mode: 'online',
      turnSeconds: TURN_SECONDS
    })
  };
}

// Scrive uno snapshot con controllo di version. Ritorna la nuova version o -1.
async function persist(session: any, snapshot: any, status: string, winnerSeat: number | null) {
  const { data, error } = await admin.rpc('apply_scopa_move', {
    p_session_id: session.id,
    p_expected_version: session.version,
    p_public_state: snapshot.public,
    p_secret_state: snapshot.secret,
    p_turn_seat: snapshot.turnSeat,
    p_turn_deadline: status === 'active' ? deadline() : null,
    p_status: status,
    p_winner_seat: winnerSeat,
    p_hand_a: snapshot.hands[1],
    p_hand_b: snapshot.hands[2]
  });
  if (error) throw error;
  return data as number;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return json({ error: 'not_authenticated' }, 401);

    const { data: userData } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (!user) return json({ error: 'not_authenticated' }, 401);

    const body = await req.json();
    const action = body.action;

    // --- create: nasce la partita quando si accetta la sfida ---
    if (action === 'create') {
      const { inviteId } = body;
      const { data: invite } = await admin
        .from('game_invites').select('*').eq('id', inviteId).single();

      if (!invite) return json({ error: 'invite_not_found' }, 404);
      if (invite.to_user_id !== user.id) return json({ error: 'not_your_invite' }, 403);
      if (invite.session_id) {
        const existing = await viewFor(invite.session_id, user.id);
        if ('view' in existing) {
          return json({ view: existing.view, sessionId: invite.session_id });
        }
      }

      const snapshot = createMatch(11);

      const { data: session, error: insErr } = await admin
        .from('game_sessions')
        .insert({
          player_a: invite.from_user_id,
          player_b: invite.to_user_id,
          game_type: invite.game_type || 'scopa',
          status: 'active',
          turn_seat: snapshot.turnSeat,
          turn_deadline: deadline(),
          public_state: snapshot.public,
          version: 1
        })
        .select().single();
      if (insErr) throw insErr;

      await Promise.all([
        admin.from('game_session_secrets')
          .insert({ session_id: session.id, state: snapshot.secret }),
        admin.from('game_session_hands').insert([
          { session_id: session.id, user_id: invite.from_user_id, seat: 1, hand: snapshot.hands[1] },
          { session_id: session.id, user_id: invite.to_user_id, seat: 2, hand: snapshot.hands[2] }
        ]),
        admin.from('game_invites')
          .update({ status: 'accepted', session_id: session.id, updated_at: new Date().toISOString() })
          .eq('id', inviteId)
      ]);

      const created = await viewFor(session.id, user.id);
      if ('error' in created) return json({ error: created.error }, created.status);
      return json({ view: created.view, sessionId: session.id });
    }

    const sessionId = body.sessionId;
    if (!sessionId) return json({ error: 'missing_session' }, 400);

    // --- state: lettura, all'avvio e come fallback del Realtime ---
    if (action === 'state') {
      const ctx = await viewFor(sessionId, user.id);
      if ('error' in ctx) return json({ error: ctx.error }, ctx.status);
      return json({ view: ctx.view });
    }

    // --- move: esecuzione super veloce senza ri-query ridondanti ---
    if (action === 'move') {
      const [sessionRes, secretRes] = await Promise.all([
        admin.from('game_sessions').select('*').eq('id', sessionId).single(),
        admin.from('game_session_secrets').select('state').eq('session_id', sessionId).single()
      ]);

      const session = sessionRes.data;
      if (!session) return json({ error: 'session_not_found' }, 404);
      if (session.status !== 'active') return json({ error: 'match_not_active' }, 409);

      const seat = session.player_a === user.id ? 1 : session.player_b === user.id ? 2 : null;
      if (!seat) return json({ error: 'not_a_participant' }, 403);
      if (session.turn_seat !== seat) return json({ error: 'not_your_turn' }, 403);

      if (typeof body.version === 'number' && body.version !== session.version) {
        const ctx = await viewFor(sessionId, user.id);
        return json({ error: 'version_conflict', view: 'view' in ctx ? ctx.view : undefined }, 409);
      }

      if (!secretRes.data?.state) return json({ error: 'state_missing' }, 500);

      const res = applyMove(secretRes.data.state, seat, body.cardId, body.chosenOption || null);
      if (!res.ok || !res.snapshot) return json({ error: res.error || 'move_failed' }, 400);
      const snapshot = res.snapshot;

      const over = snapshot.public.isMatchOver;
      const v = await persist(
        session, snapshot,
        over ? 'finished' : 'active',
        over ? snapshot.public.matchWinnerSeat : null
      );
      if (v === -1) {
        const ctx = await viewFor(sessionId, user.id);
        return json({ error: 'version_conflict', view: 'view' in ctx ? ctx.view : undefined }, 409);
      }

      const names = await loadUsernames([session.player_a, session.player_b]);
      const view = buildView({
        publicState: snapshot.public,
        hand: snapshot.hands[seat],
        seat,
        status: over ? 'finished' : 'active',
        turnSeat: snapshot.turnSeat,
        turnDeadline: over ? null : deadline(),
        version: v,
        usernames: {
          1: names[session.player_a] || 'Giocatore 1',
          2: names[session.player_b] || 'Giocatore 2'
        },
        mode: 'online',
        turnSeconds: TURN_SECONDS
      });

      return json({ view });
    }

    // --- timeout: chiunque può invocarlo a scadenza avvenuta ---
    if (action === 'timeout') {
      const [sessionRes, secretRes] = await Promise.all([
        admin.from('game_sessions').select('*').eq('id', sessionId).single(),
        admin.from('game_session_secrets').select('state').eq('session_id', sessionId).single()
      ]);

      const session = sessionRes.data;
      if (!session) return json({ error: 'session_not_found' }, 404);
      if (session.status !== 'active') return json({ error: 'match_not_active' }, 409);

      const seat = session.player_a === user.id ? 1 : session.player_b === user.id ? 2 : null;
      if (!seat) return json({ error: 'not_a_participant' }, 403);

      if (!session.turn_deadline || new Date(session.turn_deadline).getTime() > Date.now()) {
        const ctx = await viewFor(sessionId, user.id);
        return json({ error: 'not_expired', view: 'view' in ctx ? ctx.view : undefined }, 409);
      }

      if (!secretRes.data?.state) return json({ error: 'state_missing' }, 500);

      const res = autoMove(secretRes.data.state, session.turn_seat);
      if (!res.ok || !res.snapshot) return json({ error: res.error || 'timeout_failed' }, 400);
      const snapshot = res.snapshot;

      const over = snapshot.public.isMatchOver;
      const v = await persist(
        session, snapshot,
        over ? 'finished' : 'active',
        over ? snapshot.public.matchWinnerSeat : null
      );
      if (v === -1) {
        const ctx = await viewFor(sessionId, user.id);
        return json({ error: 'version_conflict', view: 'view' in ctx ? ctx.view : undefined }, 409);
      }

      const names = await loadUsernames([session.player_a, session.player_b]);
      const view = buildView({
        publicState: snapshot.public,
        hand: snapshot.hands[seat],
        seat,
        status: over ? 'finished' : 'active',
        turnSeat: snapshot.turnSeat,
        turnDeadline: over ? null : deadline(),
        version: v,
        usernames: {
          1: names[session.player_a] || 'Giocatore 1',
          2: names[session.player_b] || 'Giocatore 2'
        },
        mode: 'online',
        turnSeconds: TURN_SECONDS
      });

      return json({ view });
    }

    // --- next_round: smazzata successiva ---
    if (action === 'next_round') {
      const [sessionRes, secretRes] = await Promise.all([
        admin.from('game_sessions').select('*').eq('id', sessionId).single(),
        admin.from('game_session_secrets').select('state').eq('session_id', sessionId).single()
      ]);

      const session = sessionRes.data;
      if (!session) return json({ error: 'session_not_found' }, 404);
      if (session.status !== 'active') return json({ error: 'match_not_active' }, 409);
      if (!session.public_state?.isRoundOver) return json({ error: 'round_not_over' }, 400);
      if (session.public_state?.isMatchOver) return json({ error: 'match_already_over' }, 400);

      const seat = session.player_a === user.id ? 1 : session.player_b === user.id ? 2 : null;
      if (!seat) return json({ error: 'not_a_participant' }, 403);

      if (!secretRes.data?.state) return json({ error: 'state_missing' }, 500);

      const res = nextRound(secretRes.data.state);
      if (!res.ok || !res.snapshot) return json({ error: res.error || 'next_round_failed' }, 400);
      const snapshot = res.snapshot;

      const v = await persist(session, snapshot, 'active', null);
      if (v === -1) {
        const ctx = await viewFor(sessionId, user.id);
        return json({ error: 'version_conflict', view: 'view' in ctx ? ctx.view : undefined }, 409);
      }

      const names = await loadUsernames([session.player_a, session.player_b]);
      const view = buildView({
        publicState: snapshot.public,
        hand: snapshot.hands[seat],
        seat,
        status: 'active',
        turnSeat: snapshot.turnSeat,
        turnDeadline: deadline(),
        version: v,
        usernames: {
          1: names[session.player_a] || 'Giocatore 1',
          2: names[session.player_b] || 'Giocatore 2'
        },
        mode: 'online',
        turnSeconds: TURN_SECONDS
      });

      return json({ view });
    }

    // --- concede: abbandono, vince l'altro ---
    if (action === 'concede') {
      const [sessionRes, secretRes] = await Promise.all([
        admin.from('game_sessions').select('*').eq('id', sessionId).single(),
        admin.from('game_session_secrets').select('state').eq('session_id', sessionId).single()
      ]);

      const session = sessionRes.data;
      if (!session) return json({ error: 'session_not_found' }, 404);
      if (session.status !== 'active') {
        const ctx = await viewFor(sessionId, user.id);
        return json({ view: 'view' in ctx ? ctx.view : undefined });
      }

      const seat = session.player_a === user.id ? 1 : session.player_b === user.id ? 2 : null;
      if (!seat) return json({ error: 'not_a_participant' }, 403);

      const opponentSeat = seat === 1 ? 2 : 1;
      const pubState = {
        ...session.public_state,
        isMatchOver: true,
        matchWinnerSeat: opponentSeat
      };

      const snapshot = {
        public: pubState,
        secret: secretRes.data?.state,
        hands: { 1: [], 2: [] },
        turnSeat: session.turn_seat
      };
      const v = await persist(session, snapshot, 'abandoned', opponentSeat);
      if (v === -1) {
        const ctx = await viewFor(sessionId, user.id);
        return json({ error: 'version_conflict', view: 'view' in ctx ? ctx.view : undefined }, 409);
      }

      const names = await loadUsernames([session.player_a, session.player_b]);
      const view = buildView({
        publicState: pubState,
        hand: [],
        seat,
        status: 'abandoned',
        turnSeat: session.turn_seat,
        turnDeadline: null,
        version: v,
        usernames: {
          1: names[session.player_a] || 'Giocatore 1',
          2: names[session.player_b] || 'Giocatore 2'
        },
        mode: 'online',
        turnSeconds: TURN_SECONDS
      });

      return json({ view });
    }

    return json({ error: 'unknown_action' }, 400);
  } catch (err) {
    console.error('[scopa]', err);
    return json({ error: 'internal_error' }, 500);
  }
});
