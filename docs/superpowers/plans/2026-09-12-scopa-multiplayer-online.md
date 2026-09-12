# Scopa Multiplayer Online — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Due amici giocano la stessa partita di Scopa da dispositivi diversi, senza che nessuno dei due possa vedere le carte dell'altro.

**Architecture:** Lo stato completo del motore vive solo nel database e in una Edge Function Supabase, che è l'unica a scriverlo. Il client online non esegue il motore: invia la mossa, riceve uno snapshot già normalizzato ("tu / avversario") e lo disegna. `ScopaView` viene messa dietro un'interfaccia `MatchController` con due implementazioni, locale e online, così la partita contro il computer resta identica.

**Tech Stack:** JavaScript ESM senza framework, Vite 8, Supabase (Postgres + RLS + Realtime + Edge Functions su Deno), `node --test` per i test.

**Spec:** `docs/superpowers/specs/2026-09-12-scopa-multiplayer-online-design.md`

## Global Constraints

- Tutto il codice sorgente è ESM (`"type": "module"` in `package.json`). Nessun `require`.
- Nessuna nuova dipendenza npm. L'unica dipendenza runtime resta `@supabase/supabase-js` ^2.116.0.
- I moduli in `src/games/scopa/` non devono toccare il DOM tranne `ScopaView.js` e le funzioni `renderCardSvg` / `renderCardBackSvg` di `ScopaCards.js`, perché vengono importati anche da Deno.
- Testi dell'interfaccia in italiano.
- La sorgente del motore è `src/games/scopa/`. La copia in `supabase/functions/_shared/` è un artefatto generato: non va mai modificata a mano.
- Le tabelle nuove non hanno policy di scrittura per il ruolo `authenticated`. Scrive solo il service role.
- Ogni commit va fatto in italiano, con `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` in coda.

## File Structure

**Nuovi:**

| file | responsabilità |
|---|---|
| `src/games/scopa/ScopaMatch.js` | logica pura di partita: crea, applica mossa, gioca d'ufficio, costruisce lo snapshot. Importato sia dal browser sia da Deno. |
| `src/games/scopa/LocalMatchController.js` | `MatchController` contro il computer: avvolge `ScopaEngine` + `ScopaAI` |
| `src/games/scopa/OnlineMatchController.js` | `MatchController` online: Edge Function + Realtime + polling di riserva |
| `supabase/functions/scopa/index.ts` | glue: autentica, legge/scrive il DB, chiama `ScopaMatch` |
| `supabase/functions/_shared/*.js` | copia generata del motore |
| `scripts/sync-engine.mjs` | copia il motore in `_shared/` |
| `supabase_multiplayer.sql` | tabelle, RLS, RPC atomica |
| `test/ScopaEngine.test.js` | serializzazione del motore |
| `test/ScopaMatch.test.js` | regole della partita al confine |

**Modificati:**

| file | modifica |
|---|---|
| `src/games/scopa/ScopaEngine.js` | aggiunta `serialize()` / `deserialize()` |
| `src/games/scopa/ScopaView.js` | legge lo snapshot invece del motore |
| `src/core/FriendsManager.js` | crea la sessione quando si accetta la sfida |
| `src/components/LobbyView.js` | entra nella partita online |
| `package.json` | script `test` e `sync:engine` |

---

### Task 1: Serializzazione del motore

Il motore oggi vive solo in memoria. Per farlo abitare in una riga di database gli servono due metodi.

**Files:**
- Modify: `src/games/scopa/ScopaEngine.js` (in coda alla classe, dopo `finishRound()`)
- Create: `test/ScopaEngine.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: niente
- Produces: `engine.serialize() -> object`, `ScopaEngine.deserialize(object) -> ScopaEngine`

- [ ] **Step 1: Aggiungi lo script di test**

In `package.json`, dentro `"scripts"`, aggiungi come prima voce:

```json
"test": "node --test",
```

- [ ] **Step 2: Scrivi il test che fallisce**

Crea `test/ScopaEngine.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { ScopaEngine } from '../src/games/scopa/ScopaEngine.js';

test('serialize/deserialize conserva lo stato completo', () => {
  const engine = new ScopaEngine({ targetScore: 11 });
  engine.playCard(engine.currentTurn, (engine.currentTurn === 'player' ? engine.playerHand : engine.cpuHand)[0].id);

  const revived = ScopaEngine.deserialize(engine.serialize());

  assert.equal(revived.currentTurn, engine.currentTurn);
  assert.equal(revived.deck.length, engine.deck.length);
  assert.deepEqual(revived.tableCards, engine.tableCards);
  assert.deepEqual(revived.playerHand, engine.playerHand);
  assert.deepEqual(revived.cpuHand, engine.cpuHand);
  assert.equal(revived.playerScope, engine.playerScope);
  assert.equal(revived.lastCapturer, engine.lastCapturer);
});

test('un motore rianimato continua la partita', () => {
  const engine = new ScopaEngine({ targetScore: 11 });
  const revived = ScopaEngine.deserialize(engine.serialize());

  const role = revived.currentTurn;
  const hand = role === 'player' ? revived.playerHand : revived.cpuHand;
  const result = revived.playCard(role, hand[0].id);

  assert.equal(result.success, true);
  assert.notEqual(revived.currentTurn, role);
});

test('nessuna scopa sull\'ultima presa della smazzata', () => {
  const engine = new ScopaEngine({ targetScore: 11 });
  engine.deck = [];
  engine.currentTurn = 'player';
  engine.cpuHand = [];
  engine.tableCards = [{ id: 'spade_4', suit: 'spade', value: 4, name: 'Quattro di Spade', isSettebello: false }];
  engine.playerHand = [{ id: 'coppe_4', suit: 'coppe', value: 4, name: 'Quattro di Coppe', isSettebello: false }];

  const result = engine.playCard('player', 'coppe_4');

  assert.equal(result.capturedCards.length, 1);
  assert.equal(result.isScopa, false, 'l\'ultima presa della smazzata non vale scopa');
});

test('le carte rimaste sul tavolo vanno all\'ultimo che ha preso', () => {
  const engine = new ScopaEngine({ targetScore: 11 });
  engine.deck = [];
  engine.playerHand = [];
  engine.cpuHand = [];
  engine.playerCaptures = [];
  engine.cpuCaptures = [];
  engine.lastCapturer = 'cpu';
  engine.tableCards = [
    { id: 'spade_2', suit: 'spade', value: 2, name: 'Due di Spade', isSettebello: false },
    { id: 'coppe_9', suit: 'coppe', value: 9, name: 'Cavallo di Coppe', isSettebello: false }
  ];

  engine.finishRound();

  assert.equal(engine.cpuCaptures.length, 2);
  assert.equal(engine.playerCaptures.length, 0);
  assert.equal(engine.tableCards.length, 0);
});

test('deserialize non condivide riferimenti con l\'originale', () => {
  const engine = new ScopaEngine({ targetScore: 11 });
  const revived = ScopaEngine.deserialize(engine.serialize());

  revived.tableCards.push({ id: 'finto' });

  assert.equal(engine.tableCards.some(c => c.id === 'finto'), false);
});
```

- [ ] **Step 3: Lancia il test e verifica che fallisca**

Run: `npm test`
Expected: FAIL — `engine.serialize is not a function`

- [ ] **Step 4: Implementa i due metodi**

In `src/games/scopa/ScopaEngine.js`, subito prima della graffa di chiusura della classe:

```js
  // Stato completo serializzabile: tutto ciò che serve a riprendere la partita
  serialize() {
    return {
      targetScore: this.targetScore,
      matchScore: this.matchScore,
      roundNumber: this.roundNumber,
      dealer: this.dealer,
      currentTurn: this.currentTurn,
      isMatchOver: this.isMatchOver,
      matchWinner: this.matchWinner,
      deck: this.deck,
      tableCards: this.tableCards,
      playerHand: this.playerHand,
      cpuHand: this.cpuHand,
      playerCaptures: this.playerCaptures,
      cpuCaptures: this.cpuCaptures,
      playerScope: this.playerScope,
      cpuScope: this.cpuScope,
      lastCapturer: this.lastCapturer,
      isRoundOver: this.isRoundOver,
      roundScoreResult: this.roundScoreResult
    };
  }

  // Ricostruisce senza passare dal costruttore, che distribuirebbe una nuova smazzata
  static deserialize(data) {
    const engine = Object.create(ScopaEngine.prototype);
    Object.assign(engine, JSON.parse(JSON.stringify(data)));
    return engine;
  }
```

- [ ] **Step 5: Lancia il test e verifica che passi**

Run: `npm test`
Expected: PASS, 5 test

- [ ] **Step 6: Commit**

```bash
git add package.json src/games/scopa/ScopaEngine.js test/ScopaEngine.test.js
git commit -m "feat: serializzazione dello stato di ScopaEngine

Il motore viveva solo in memoria. serialize/deserialize permettono di
salvarlo in una riga di database e riprendere la partita.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Logica pura di partita (`ScopaMatch`)

Tutta la logica che sta al confine fra motore e database, scritta come funzioni pure così è testabile in Node e riusabile in Deno. La Edge Function diventerà solo colla.

**Files:**
- Create: `src/games/scopa/ScopaMatch.js`
- Create: `test/ScopaMatch.test.js`

**Interfaces:**
- Consumes: `ScopaEngine.deserialize()`, `engine.serialize()` (Task 1); `ScopaAI.decideMove(hand, tableCards, engine)`
- Produces:
  - `SEAT_ROLE = { 1: 'player', 2: 'cpu' }`, `ROLE_SEAT = { player: 1, cpu: 2 }`
  - `createMatch(targetScore) -> Snapshot`
  - `applyMove(secret, seat, cardId, chosenOption) -> { ok, error?, snapshot? }`
  - `autoMove(secret, seat) -> { ok, error?, snapshot? }`
  - `buildView(args) -> MatchView`
  - `Snapshot = { secret, public, hands: {1,2}, turnSeat }`

- [ ] **Step 1: Scrivi i test che falliscono**

Crea `test/ScopaMatch.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { ScopaEngine } from '../src/games/scopa/ScopaEngine.js';
import { createMatch, applyMove, autoMove, buildView, SEAT_ROLE } from '../src/games/scopa/ScopaMatch.js';

test('createMatch produce mani da 3 carte e 4 carte sul tavolo', () => {
  const snap = createMatch(11);
  assert.equal(snap.hands[1].length, 3);
  assert.equal(snap.hands[2].length, 3);
  assert.equal(snap.public.tableCards.length, 4);
  assert.ok(snap.turnSeat === 1 || snap.turnSeat === 2);
});

test('lo stato pubblico non contiene le mani né il mazzo', () => {
  const snap = createMatch(11);
  const json = JSON.stringify(snap.public);
  assert.equal(json.includes('playerHand'), false);
  assert.equal(json.includes('cpuHand'), false);
  assert.equal(json.includes('"deck"'), false);
  assert.equal(typeof snap.public.deckCount, 'number');
});

test('una mossa di chi non è di turno viene rifiutata', () => {
  const snap = createMatch(11);
  const wrongSeat = snap.turnSeat === 1 ? 2 : 1;
  const res = applyMove(snap.secret, wrongSeat, snap.hands[wrongSeat][0].id, null);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'not_your_turn');
});

test('una carta non in mano viene rifiutata', () => {
  const snap = createMatch(11);
  const res = applyMove(snap.secret, snap.turnSeat, 'denari_99', null);
  assert.equal(res.ok, false);
  assert.equal(res.error, 'card_not_in_hand');
});

test('lastMove descrive la presa per l\'animazione', () => {
  // Tavolo costruito a mano: il Tre di coppe prende il Tre di spade
  const engine = new ScopaEngine({ targetScore: 11 });
  const state = engine.serialize();
  state.currentTurn = 'player';
  state.tableCards = [
    { id: 'spade_3', suit: 'spade', value: 3, name: 'Tre di Spade', isSettebello: false },
    { id: 'coppe_5', suit: 'coppe', value: 5, name: 'Cinque di Coppe', isSettebello: false }
  ];
  state.playerHand = [{ id: 'coppe_3', suit: 'coppe', value: 3, name: 'Tre di Coppe', isSettebello: false }];

  const res = applyMove(state, 1, 'coppe_3', null);

  assert.equal(res.ok, true);
  assert.equal(res.snapshot.public.lastMove.seat, 1);
  assert.equal(res.snapshot.public.lastMove.card.id, 'coppe_3');
  assert.deepEqual(res.snapshot.public.lastMove.capturedCards.map(c => c.id), ['spade_3']);
  assert.equal(res.snapshot.public.lastMove.isScopa, false);
});

test('la presa singola è obbligatoria e batte la somma', () => {
  const engine = new ScopaEngine({ targetScore: 11 });
  const state = engine.serialize();
  state.currentTurn = 'player';
  state.tableCards = [
    { id: 'spade_5', suit: 'spade', value: 5, name: 'Cinque di Spade', isSettebello: false },
    { id: 'coppe_2', suit: 'coppe', value: 2, name: 'Due di Coppe', isSettebello: false },
    { id: 'bastoni_3', suit: 'bastoni', value: 3, name: 'Tre di Bastoni', isSettebello: false }
  ];
  state.playerHand = [{ id: 'denari_5', suit: 'denari', value: 5, name: 'Cinque di Denari', isSettebello: false }];

  const res = applyMove(state, 1, 'denari_5', null);

  assert.equal(res.ok, true);
  assert.deepEqual(res.snapshot.public.lastMove.capturedCards.map(c => c.id), ['spade_5']);
});

test('autoMove gioca al posto di chi è di turno', () => {
  const snap = createMatch(11);
  const res = autoMove(snap.secret, snap.turnSeat);
  assert.equal(res.ok, true);
  assert.equal(res.snapshot.turnSeat, snap.turnSeat === 1 ? 2 : 1);
});

test('buildView mostra la propria mano e solo il conteggio dell\'avversario', () => {
  const snap = createMatch(11);
  const view = buildView({
    publicState: snap.public,
    hand: snap.hands[2],
    seat: 2,
    status: 'active',
    turnSeat: snap.turnSeat,
    turnDeadline: null,
    version: 1,
    usernames: { 1: 'Anna', 2: 'Bruno' },
    mode: 'online',
    turnSeconds: 25
  });

  assert.equal(view.you.username, 'Bruno');
  assert.equal(view.opponent.username, 'Anna');
  assert.equal(view.you.hand.length, 3);
  assert.equal(view.opponent.handCount, 3);
  assert.equal('hand' in view.opponent, false);
  assert.equal(view.isYourTurn, snap.turnSeat === 2);
});
```

- [ ] **Step 2: Lancia i test e verifica che falliscano**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../ScopaMatch.js'`

- [ ] **Step 3: Implementa `ScopaMatch.js`**

Crea `src/games/scopa/ScopaMatch.js`:

```js
// Logica di partita al confine fra motore e persistenza.
// Funzioni pure: nessun DOM, nessuna rete. Girano identiche nel browser e in Deno.

import { ScopaEngine } from './ScopaEngine.js';
import { ScopaAI } from './ScopaAI.js';

export const SEAT_ROLE = { 1: 'player', 2: 'cpu' };
export const ROLE_SEAT = { player: 1, cpu: 2 };

// Snapshot completo: segreto (solo server), pubblico (entrambi), mani (una a testa)
function snapshotFromEngine(engine, lastMove) {
  return {
    secret: engine.serialize(),
    public: {
      tableCards: engine.tableCards,
      deckCount: engine.deck.length,
      roundNumber: engine.roundNumber,
      seats: {
        1: {
          captureCount: engine.playerCaptures.length,
          scope: engine.playerScope,
          matchScore: engine.matchScore.player
        },
        2: {
          captureCount: engine.cpuCaptures.length,
          scope: engine.cpuScope,
          matchScore: engine.matchScore.cpu
        }
      },
      // Quante carte ha in mano ciascuno: l'avversario ne vede solo il numero
      handCounts: {
        1: engine.playerHand.length,
        2: engine.cpuHand.length
      },
      lastMove: lastMove || null,
      roundResult: engine.roundScoreResult || null,
      isRoundOver: !!engine.isRoundOver,
      isMatchOver: !!engine.isMatchOver,
      matchWinnerSeat: engine.matchWinner ? ROLE_SEAT[engine.matchWinner] : null
    },
    hands: { 1: engine.playerHand, 2: engine.cpuHand },
    turnSeat: ROLE_SEAT[engine.currentTurn]
  };
}

export function createMatch(targetScore = 11) {
  return snapshotFromEngine(new ScopaEngine({ targetScore }), null);
}

// Riproduce la stessa selezione che fa ScopaEngine.playCard, per sapere
// COSA verrà preso prima che la mossa venga applicata: serve all'animazione.
function previewCapture(engine, card, chosenOption) {
  const info = engine.getCaptureOptions(card, engine.tableCards);
  if (info.type === 'none' || info.options.length === 0) return [];

  if (chosenOption && Array.isArray(chosenOption)) {
    const chosenIds = chosenOption.map(c => c.id).sort().join(',');
    const valid = info.options.find(opt => opt.map(c => c.id).sort().join(',') === chosenIds);
    return valid || info.options[0];
  }
  return info.options[0];
}

export function applyMove(secret, seat, cardId, chosenOption = null) {
  const role = SEAT_ROLE[seat];
  if (!role) return { ok: false, error: 'invalid_seat' };

  const engine = ScopaEngine.deserialize(secret);

  if (engine.isMatchOver) return { ok: false, error: 'match_over' };
  if (engine.currentTurn !== role) return { ok: false, error: 'not_your_turn' };

  const hand = role === 'player' ? engine.playerHand : engine.cpuHand;
  const card = hand.find(c => c.id === cardId);
  if (!card) return { ok: false, error: 'card_not_in_hand' };

  const capturedCards = previewCapture(engine, card, chosenOption);
  const result = engine.playCard(role, cardId, chosenOption);
  if (result.error) return { ok: false, error: result.error };

  const lastMove = {
    seat,
    card,
    capturedCards,
    isScopa: !!result.isScopa,
    dealtNewHands: !!result.dealtNewHands
  };

  return { ok: true, snapshot: snapshotFromEngine(engine, lastMove) };
}

// Mossa d'ufficio a turno scaduto, o mossa del computer in locale
export function autoMove(secret, seat) {
  const role = SEAT_ROLE[seat];
  if (!role) return { ok: false, error: 'invalid_seat' };

  const engine = ScopaEngine.deserialize(secret);
  const hand = role === 'player' ? engine.playerHand : engine.cpuHand;
  if (!hand || hand.length === 0) return { ok: false, error: 'empty_hand' };

  const decision = ScopaAI.decideMove(hand, engine.tableCards, engine);
  const card = (decision && decision.card) || hand[0];
  return applyMove(secret, seat, card.id, (decision && decision.chosenOption) || null);
}

// Vista normalizzata dal punto di vista di un solo giocatore
export function buildView({
  publicState, hand, seat, status, turnSeat, turnDeadline,
  version, usernames, mode, turnSeconds
}) {
  const otherSeat = seat === 1 ? 2 : 1;
  const mine = publicState.seats[seat];
  const theirs = publicState.seats[otherSeat];

  return {
    mode,
    status,
    version,
    you: {
      seat,
      username: usernames[seat],
      hand: hand || [],
      captureCount: mine.captureCount,
      scope: mine.scope,
      matchScore: mine.matchScore
    },
    opponent: {
      seat: otherSeat,
      username: usernames[otherSeat],
      handCount: publicState.handCounts[otherSeat],
      captureCount: theirs.captureCount,
      scope: theirs.scope,
      matchScore: theirs.matchScore
    },
    tableCards: publicState.tableCards,
    deckCount: publicState.deckCount,
    roundNumber: publicState.roundNumber,
    isYourTurn: turnSeat === seat,
    turnDeadline: turnDeadline || null,
    turnSeconds,
    lastMove: publicState.lastMove,
    roundResult: publicState.roundResult,
    isRoundOver: publicState.isRoundOver,
    isMatchOver: publicState.isMatchOver,
    matchWinnerSeat: publicState.matchWinnerSeat
  };
}
```

- [ ] **Step 4: Lancia i test e verifica che passino**

Run: `npm test`
Expected: PASS, 13 test in totale

- [ ] **Step 5: Commit**

```bash
git add src/games/scopa/ScopaMatch.js test/ScopaMatch.test.js
git commit -m "feat: logica pura di partita condivisa fra browser e server

ScopaMatch racchiude creazione, applicazione della mossa, mossa d'ufficio
e costruzione della vista per un singolo giocatore. Nessun DOM e nessuna
rete, così gira identica in Node, nel browser e in Deno.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Schema database e RPC atomica

**Files:**
- Create: `supabase_multiplayer.sql`

**Interfaces:**
- Produces: tabelle `game_sessions`, `game_session_hands`, `game_session_secrets`; funzione `apply_scopa_move(...) -> int`

- [ ] **Step 1: Scrivi lo script SQL**

Crea `supabase_multiplayer.sql`:

```sql
-- ==============================================================================
-- PIUCCIA GAMES - MULTIPLAYER ONLINE SCOPA
-- Esegui nel SQL Editor di Supabase. Idempotente.
-- ==============================================================================

-- Stato pubblico: leggibile dai due partecipanti, nessun segreto dentro
CREATE TABLE IF NOT EXISTS public.game_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_a UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    player_b UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    game_type TEXT NOT NULL DEFAULT 'scopa',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished', 'abandoned')),
    turn_seat SMALLINT NOT NULL CHECK (turn_seat IN (1, 2)),
    turn_deadline TIMESTAMPTZ,
    public_state JSONB NOT NULL,
    version INT NOT NULL DEFAULT 1,
    winner_seat SMALLINT CHECK (winner_seat IN (1, 2)),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT different_players CHECK (player_a <> player_b)
);

CREATE INDEX IF NOT EXISTS game_sessions_players_idx
ON public.game_sessions (player_a, player_b, status);

-- Mano di un giocatore: ognuno legge solo la propria riga
CREATE TABLE IF NOT EXISTS public.game_session_hands (
    session_id UUID NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    seat SMALLINT NOT NULL CHECK (seat IN (1, 2)),
    hand JSONB NOT NULL DEFAULT '[]'::jsonb,
    PRIMARY KEY (session_id, user_id)
);

-- Stato completo del motore: nessuno può leggerlo tranne il service role
CREATE TABLE IF NOT EXISTS public.game_session_secrets (
    session_id UUID PRIMARY KEY REFERENCES public.game_sessions(id) ON DELETE CASCADE,
    state JSONB NOT NULL
);

-- Collegamento invito -> partita creata
ALTER TABLE public.game_invites
ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.game_sessions(id) ON DELETE SET NULL;

-- ------------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------------
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_session_hands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_session_secrets ENABLE ROW LEVEL SECURITY;

-- I partecipanti leggono lo stato pubblico. Nessuna policy di scrittura:
-- scrive solo il service role, che salta comunque le policy.
DROP POLICY IF EXISTS "Lettura sessione dei partecipanti" ON public.game_sessions;
CREATE POLICY "Lettura sessione dei partecipanti"
ON public.game_sessions FOR SELECT
USING (auth.uid() = player_a OR auth.uid() = player_b);

-- Ognuno vede solo la propria mano
DROP POLICY IF EXISTS "Lettura della propria mano" ON public.game_session_hands;
CREATE POLICY "Lettura della propria mano"
ON public.game_session_hands FOR SELECT
USING (auth.uid() = user_id);

-- game_session_secrets resta senza alcuna policy: con RLS attivo e zero
-- policy, nessun ruolo applicativo può leggerla.

-- Realtime sullo stato pubblico
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_sessions;

-- ------------------------------------------------------------------
-- Scrittura atomica di una mossa
-- ------------------------------------------------------------------
-- Aggiorna sessione, segreto e le due mani in un'unica transazione.
-- Ritorna la nuova version, oppure -1 se la version attesa non coincide.
CREATE OR REPLACE FUNCTION public.apply_scopa_move(
    p_session_id UUID,
    p_expected_version INT,
    p_public_state JSONB,
    p_secret_state JSONB,
    p_turn_seat SMALLINT,
    p_turn_deadline TIMESTAMPTZ,
    p_status TEXT,
    p_winner_seat SMALLINT,
    p_hand_a JSONB,
    p_hand_b JSONB
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_new_version INT;
BEGIN
    UPDATE game_sessions
    SET public_state  = p_public_state,
        turn_seat     = p_turn_seat,
        turn_deadline = p_turn_deadline,
        status        = p_status,
        winner_seat   = p_winner_seat,
        version       = version + 1,
        updated_at    = now()
    WHERE id = p_session_id
      AND version = p_expected_version
    RETURNING version INTO v_new_version;

    IF v_new_version IS NULL THEN
        RETURN -1;
    END IF;

    UPDATE game_session_secrets SET state = p_secret_state WHERE session_id = p_session_id;

    UPDATE game_session_hands SET hand = p_hand_a WHERE session_id = p_session_id AND seat = 1;
    UPDATE game_session_hands SET hand = p_hand_b WHERE session_id = p_session_id AND seat = 2;

    RETURN v_new_version;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_scopa_move(
    UUID, INT, JSONB, JSONB, SMALLINT, TIMESTAMPTZ, TEXT, SMALLINT, JSONB, JSONB
) FROM anon, authenticated;
```

- [ ] **Step 2: Verifica che lo script sia sintatticamente coerente**

Non c'è un database locale in questo repository, quindi la verifica è una rilettura mirata. Controlla e spunta:
- ogni `CREATE TABLE` ha `IF NOT EXISTS`
- ogni `CREATE POLICY` è preceduto dal `DROP POLICY IF EXISTS` corrispondente
- `game_session_secrets` ha RLS attivo e **nessuna** policy
- la `REVOKE` in coda elenca gli stessi tipi, nello stesso ordine, della `CREATE FUNCTION`

- [ ] **Step 3: Commit**

```bash
git add supabase_multiplayer.sql
git commit -m "feat: schema e RLS per le partite online

Tre tabelle: stato pubblico leggibile dai partecipanti, mani leggibili
solo dal proprietario, stato completo del motore leggibile da nessuno.
apply_scopa_move aggiorna tutto in un'unica transazione con controllo di
version, così un doppio invio non applica due volte la stessa mossa.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Motore condiviso con Deno

**Files:**
- Create: `scripts/sync-engine.mjs`
- Modify: `package.json`
- Create: `supabase/functions/_shared/.gitignore`

**Interfaces:**
- Consumes: i moduli in `src/games/scopa/`
- Produces: `npm run sync:engine` popola `supabase/functions/_shared/`

- [ ] **Step 1: Scrivi lo script di copia**

Crea `scripts/sync-engine.mjs`:

```js
// Copia il motore della Scopa dove la Edge Function può importarlo.
// La sorgente resta src/games/scopa/: _shared/ è un artefatto generato.

import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'src', 'games', 'scopa');
const to = join(root, 'supabase', 'functions', '_shared');

const FILES = ['ScopaCards.js', 'ScopaEngine.js', 'ScopaAI.js', 'ScopaMatch.js'];

await mkdir(to, { recursive: true });

for (const file of FILES) {
  await copyFile(join(from, file), join(to, file));
  console.log(`copiato ${file}`);
}

console.log(`\n${FILES.length} file sincronizzati in supabase/functions/_shared/`);
```

- [ ] **Step 2: Registra lo script**

In `package.json`, dentro `"scripts"`, aggiungi:

```json
"sync:engine": "node scripts/sync-engine.mjs",
```

- [ ] **Step 3: Impedisci di modificare a mano la copia**

Crea `supabase/functions/_shared/.gitignore`:

```
# Generato da `npm run sync:engine`. Non modificare a mano:
# la sorgente è src/games/scopa/
```

I file copiati vanno comunque committati, perché `supabase functions deploy` carica quello che trova su disco. Il `.gitignore` qui non esclude nulla: è una nota per chi legge.

- [ ] **Step 4: Esegui e verifica**

Run: `npm run sync:engine && ls supabase/functions/_shared/`
Expected: elenca `ScopaAI.js  ScopaCards.js  ScopaEngine.js  ScopaMatch.js`

- [ ] **Step 5: Commit**

```bash
git add scripts/sync-engine.mjs package.json supabase/functions/_shared/
git commit -m "build: sincronizzazione del motore verso le Edge Function

Deno importa i moduli dalla cartella della funzione, quindi il motore va
copiato. La sorgente resta src/games/scopa/: _shared/ è generato.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Edge Function `scopa`

Colla sottile: autentica, legge e scrive il database, delega le regole a `ScopaMatch`.

**Files:**
- Create: `supabase/functions/scopa/index.ts`

**Interfaces:**
- Consumes: `createMatch`, `applyMove`, `autoMove`, `buildView` da `../_shared/ScopaMatch.js`; `apply_scopa_move` (Task 3)
- Produces: endpoint POST con `action` fra `create` | `state` | `move` | `timeout` | `concede`. Risposta di successo: `{ view }`. Risposta di errore: `{ error: string }` con codice HTTP.

- [ ] **Step 1: Scrivi la funzione**

Crea `supabase/functions/scopa/index.ts`:

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createMatch, applyMove, autoMove, buildView } from '../_shared/ScopaMatch.js';

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

async function loadUsernames(ids: string[]) {
  const { data } = await admin.from('profiles').select('id, username').in('id', ids);
  const map: Record<string, string> = {};
  for (const row of data || []) map[row.id] = row.username;
  return map;
}

// Compone la vista del chiamante leggendo sessione + mano propria
async function viewFor(sessionId: string, userId: string) {
  const { data: session } = await admin
    .from('game_sessions').select('*').eq('id', sessionId).single();
  if (!session) return { error: 'session_not_found', status: 404 };

  const seat = session.player_a === userId ? 1 : session.player_b === userId ? 2 : null;
  if (!seat) return { error: 'not_a_participant', status: 403 };

  const { data: handRow } = await admin
    .from('game_session_hands').select('hand')
    .eq('session_id', sessionId).eq('user_id', userId).single();

  const names = await loadUsernames([session.player_a, session.player_b]);

  return {
    session,
    seat,
    view: buildView({
      publicState: session.public_state,
      hand: handRow?.hand || [],
      seat,
      status: session.status,
      turnSeat: session.turn_seat,
      turnDeadline: session.turn_deadline,
      version: session.version,
      usernames: { 1: names[session.player_a], 2: names[session.player_b] },
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

Deno.serve(async (req) => {
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
        return json({ view: existing.view, sessionId: invite.session_id });
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

      await admin.from('game_session_secrets')
        .insert({ session_id: session.id, state: snapshot.secret });

      await admin.from('game_session_hands').insert([
        { session_id: session.id, user_id: invite.from_user_id, seat: 1, hand: snapshot.hands[1] },
        { session_id: session.id, user_id: invite.to_user_id, seat: 2, hand: snapshot.hands[2] }
      ]);

      await admin.from('game_invites')
        .update({ status: 'accepted', session_id: session.id, updated_at: new Date().toISOString() })
        .eq('id', inviteId);

      const created = await viewFor(session.id, user.id);
      return json({ view: created.view, sessionId: session.id });
    }

    const sessionId = body.sessionId;
    if (!sessionId) return json({ error: 'missing_session' }, 400);

    const ctx = await viewFor(sessionId, user.id);
    if ('error' in ctx) return json({ error: ctx.error }, ctx.status);

    // --- state: lettura, all'avvio e come fallback del Realtime ---
    if (action === 'state') {
      return json({ view: ctx.view });
    }

    const session = ctx.session;
    const seat = ctx.seat;

    // --- concede: abbandono, vince l'altro ---
    if (action === 'concede') {
      if (session.status !== 'active') return json({ view: ctx.view });
      const { data: secretRow } = await admin
        .from('game_session_secrets').select('state').eq('session_id', sessionId).single();

      const snapshot = {
        public: session.public_state,
        secret: secretRow!.state,
        hands: { 1: [], 2: [] },
        turnSeat: session.turn_seat
      };
      const v = await persist(session, snapshot, 'abandoned', seat === 1 ? 2 : 1);
      if (v === -1) return json({ error: 'version_conflict' }, 409);

      const after = await viewFor(sessionId, user.id);
      return json({ view: after.view });
    }

    if (session.status !== 'active') return json({ error: 'match_not_active' }, 409);

    const { data: secretRow } = await admin
      .from('game_session_secrets').select('state').eq('session_id', sessionId).single();
    if (!secretRow) return json({ error: 'state_missing' }, 500);

    // --- move ---
    if (action === 'move') {
      if (session.turn_seat !== seat) return json({ error: 'not_your_turn' }, 403);
      if (typeof body.version === 'number' && body.version !== session.version) {
        return json({ error: 'version_conflict', view: ctx.view }, 409);
      }

      const res = applyMove(secretRow.state, seat, body.cardId, body.chosenOption || null);
      if (!res.ok) return json({ error: res.error }, 400);

      const over = res.snapshot.public.isMatchOver;
      const v = await persist(
        session, res.snapshot,
        over ? 'finished' : 'active',
        over ? res.snapshot.public.matchWinnerSeat : null
      );
      if (v === -1) return json({ error: 'version_conflict' }, 409);

      const after = await viewFor(sessionId, user.id);
      return json({ view: after.view });
    }

    // --- timeout: chiunque può invocarlo, ma solo a scadenza avvenuta ---
    if (action === 'timeout') {
      if (!session.turn_deadline || new Date(session.turn_deadline).getTime() > Date.now()) {
        return json({ error: 'not_expired', view: ctx.view }, 409);
      }

      const res = autoMove(secretRow.state, session.turn_seat);
      if (!res.ok) return json({ error: res.error }, 400);

      const over = res.snapshot.public.isMatchOver;
      const v = await persist(
        session, res.snapshot,
        over ? 'finished' : 'active',
        over ? res.snapshot.public.matchWinnerSeat : null
      );
      if (v === -1) return json({ error: 'version_conflict' }, 409);

      const after = await viewFor(sessionId, user.id);
      return json({ view: after.view });
    }

    return json({ error: 'unknown_action' }, 400);
  } catch (err) {
    console.error('[scopa]', err);
    return json({ error: 'internal_error' }, 500);
  }
});
```

- [ ] **Step 2: Verifica che Deno riesca a fare il parsing**

Run: `npm run sync:engine && supabase functions serve scopa --no-verify-jwt`
Expected: il server parte senza errori di import o di sintassi. Fermalo con Ctrl+C.

Se `supabase functions serve` chiede un progetto collegato, esegui prima `supabase link --project-ref ymooonkzkomeznpipehd`.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/scopa/index.ts
git commit -m "feat: Edge Function autoritativa per le partite online

Autentica dal JWT, verifica turno e version, delega le regole a
ScopaMatch e scrive tramite la RPC atomica. Al chiamante torna solo la
sua vista: la mano dell'avversario non lascia mai il server.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: `MatchController` e partita locale

Il refactor più delicato: `ScopaView` smette di leggere il motore. La partita contro il computer deve restare identica.

**Files:**
- Create: `src/games/scopa/LocalMatchController.js`
- Modify: `src/games/scopa/ScopaView.js`

**Interfaces:**
- Consumes: `createMatch`, `applyMove`, `autoMove`, `buildView` da `ScopaMatch.js`
- Produces: contratto `MatchController`, implementato anche dal Task 7:
  - `getView() -> MatchView`
  - `async playCard(cardId, chosenOption) -> { ok, error? }`
  - `async claimTimeout() -> void`
  - `async concede() -> void`
  - `onChange(callback) -> unsubscribe`
  - `async start() -> void`
  - `destroy() -> void`

- [ ] **Step 1: Implementa il controller locale**

Crea `src/games/scopa/LocalMatchController.js`:

```js
// MatchController contro il computer. Tutto in memoria, nessuna rete.

import { createMatch, applyMove, autoMove, buildView } from './ScopaMatch.js';

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
  }

  async start() {
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
      version: 0,
      usernames: { 1: this.username, 2: 'CPU Master' },
      mode: 'local',
      turnSeconds: TURN_SECONDS
    });
  }

  async playCard(cardId, chosenOption = null) {
    const res = applyMove(this.snapshot.secret, 1, cardId, chosenOption);
    if (!res.ok) return { ok: false, error: res.error };

    this.snapshot = res.snapshot;
    this.afterMove();
    return { ok: true };
  }

  // Tempo scaduto: gioca al posto dell'umano, come faceva onTimerExpired
  async claimTimeout() {
    if (this.status !== 'active') return;
    const res = autoMove(this.snapshot.secret, this.snapshot.turnSeat);
    if (!res.ok) return;

    this.snapshot = res.snapshot;
    this.afterMove();
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
```

- [ ] **Step 2: Fai leggere a ScopaView lo snapshot**

In `src/games/scopa/ScopaView.js`:

1. Sostituisci gli import di `ScopaEngine` e `ScopaAI` con:

```js
import { LocalMatchController } from './LocalMatchController.js';
```

2. Nel costruttore, sostituisci `this.engine = null;` con:

```js
    this.match = null;         // MatchController: locale oppure online
    this.view = null;          // ultimo snapshot ricevuto
    this.unsubscribe = null;
    this.pendingMoves = [];    // mosse da animare, in ordine di arrivo
    this.lastQueuedMove = null;
```

3. In `init(options)`, sostituisci la creazione del motore e l'avvio del turno (da `this.engine = new ScopaEngine(...)` fino alla fine del metodo) con:

```js
    const target = options.targetScore || gameManager.settings.targetPoints || 11;
    this.stopTurnTimer();
    if (this.unsubscribe) this.unsubscribe();
    if (this.match) this.match.destroy();

    this.match = new LocalMatchController({
      targetScore: target,
      username: authManager.getNickname() || 'Tu'
    });

    this.isProcessing = false;
    this.unsubscribe = this.match.onChange(view => this.onMatchUpdate(view));
    this.renderLayout();
    this.match.start();
```

4. Aggiungi il metodo che riceve gli aggiornamenti, subito dopo `init()`:

```js
  onMatchUpdate(view) {
    this.view = view;
    if (!view) return;

    // Le mosse vanno accodate, non disegnate appena arrivano: il computer
    // gioca dopo 900ms mentre l'animazione precedente dura circa 1,5s, e
    // online possono arrivare due aggiornamenti ravvicinati. Ridisegnare
    // subito cancellerebbe le carte che l'animazione in corso sta muovendo.
    if (view.lastMove && view.lastMove !== this.lastQueuedMove) {
      this.lastQueuedMove = view.lastMove;
      this.pendingMoves.push(view.lastMove);
      this.drainMoveQueue();
      return;
    }

    if (this.isProcessing) return;
    this.updateBoard();
    this.syncTurnState();
  }

  async drainMoveQueue() {
    if (this.isProcessing) return;

    while (this.pendingMoves.length > 0) {
      const move = this.pendingMoves.shift();
      await this.playMoveSequence(move);
      if (this.view && this.view.isRoundOver) return;
    }

    this.syncTurnState();
  }

  syncTurnState() {
    if (!this.view || this.view.status !== 'active') return;

    if (this.view.isRoundOver) {
      this.stopTurnTimer();
      return;
    }

    this.startTurnTimer(this.view.isYourTurn ? 'player' : 'cpu');

    if (this.view.isYourTurn) {
      this.setNarrator('👤', `È il tuo turno: seleziona una carta da giocare (${this.view.turnSeconds}s)`);
    } else {
      this.setNarrator(
        this.view.mode === 'local' ? '🤖' : '👤',
        `Turno di ${this.view.opponent.username}...`
      );
    }
  }
```

- [ ] **Step 3: Riscrivi le letture del motore**

Nei metodi `updateBoard()`, `updateCapturePiles()`, `renderTableCards()`, `renderCpuHand()`, `renderPlayerHand()` sostituisci ogni lettura secondo questa tabella. Sono i 52 riferimenti `this.engine.` del file.

| prima | dopo |
|---|---|
| `this.engine.matchScore.player` | `this.view.you.matchScore` |
| `this.engine.matchScore.cpu` | `this.view.opponent.matchScore` |
| `this.engine.playerScope` | `this.view.you.scope` |
| `this.engine.cpuScope` | `this.view.opponent.scope` |
| `this.engine.deck.length` | `this.view.deckCount` |
| `this.engine.playerCaptures.length` | `this.view.you.captureCount` |
| `this.engine.cpuCaptures.length` | `this.view.opponent.captureCount` |
| `this.engine.tableCards` | `this.view.tableCards` |
| `this.engine.playerHand` | `this.view.you.hand` |
| `this.engine.cpuHand` | array fittizio: `Array.from({ length: this.view.opponent.handCount })` |
| `this.engine.currentTurn === 'player'` | `this.view.isYourTurn` |
| `this.engine.isRoundOver` | `this.view.isRoundOver` |
| `this.engine.isMatchOver` | `this.view.isMatchOver` |

La prima riga di `updateBoard()` diventa:

```js
    if (!this.view) return;
```

`renderCpuHand()` disegnava una carta coperta per ogni carta in mano al computer, quindi gli basta il conteggio:

```js
  renderCpuHand() {
    const container = document.getElementById('cpu-hand');
    if (!container) return;

    const count = this.view.opponent.handCount;
    container.innerHTML = Array.from({ length: count }).map((_, idx) => {
      const rot = (idx - (count - 1) / 2) * 2.5;
      return `
        <div class="card-wrapper cpu-card" style="transform: rotate(${rot}deg);">
          ${renderCardBackSvg()}
        </div>
      `;
    }).join('');
  }
```

Nella `renderLayout()`, sostituisci l'etichetta fissa `CPU Master` e l'icona `🤖` con valori presi dallo snapshot, così online compare lo username reale. In `updateBoard()` aggiungi in cima:

```js
    const oppName = document.getElementById('opponent-name');
    if (oppName) oppName.textContent = this.view.opponent.username;
    const oppIcon = document.getElementById('opponent-avatar-icon');
    if (oppIcon) oppIcon.textContent = this.view.mode === 'local' ? '🤖' : '👤';
```

e nel markup di `renderLayout()` dai quegli `id` all'elemento con classe `avatar-name` e a quello con classe `cpu-avatar` della zona avversario.

- [ ] **Step 4: Fai partire le mosse dal controller**

`onPlayerCardClick(cardId)` deve chiedere al controller invece di applicare al motore. Le opzioni di presa si calcolano ancora localmente, perché servono solo a mostrare il dialogo di scelta: usa `getCaptureOptions` importata come funzione pura.

Aggiungi in cima al file:

```js
import { ScopaEngine } from './ScopaEngine.js';
```

e dentro `onPlayerCardClick`, dove prima leggeva `this.engine.getCaptureOptions(...)`, usa un motore usa-e-getta costruito sul solo tavolo:

```js
    const probe = ScopaEngine.deserialize({ tableCards: this.view.tableCards });
    const captureInfo = probe.getCaptureOptions(card, this.view.tableCards);
```

Dichiara `onPlayerCardClick` come `async onPlayerCardClick(cardId)`, perché ora
attende il controller. La riga che eseguiva la mossa diventa:

```js
    const res = await this.match.playCard(card.id, chosenCombo);
    if (!res.ok) {
      this.setNarrator('⚠️', 'Mossa non valida, riprova.');
      this.isProcessing = false;
    }
```

Fai lo stesso in `promptCaptureChoice()` dove chiamava `playMoveSequence('player', playedCard, options[idx])`.

- [ ] **Step 5: Guida l'animazione dal descrittore**

`playMoveSequence` non deve più calcolare la presa né applicare la mossa: entrambe le cose sono già avvenute. Cambia la firma e togli i due blocchi.

```js
  async playMoveSequence(lastMove) {
    this.stopTurnTimer();
    this.isProcessing = true;

    try {
      const { seat, card, capturedCards, isScopa, dealtNewHands } = lastMove;
      const isMine = seat === this.view.you.seat;
      const actorName = isMine ? 'Tu' : this.view.opponent.username;
      const isCapture = capturedCards.length > 0;
      const role = isMine ? 'player' : 'cpu';
```

Da qui in poi il corpo resta quello attuale, con tre sole differenze:
- `isPlayer` diventa `isMine`
- si elimina la riga `const result = this.engine.playCard(role, card.id, chosenOption);` e le letture di `result.*` usano le variabili destrutturate sopra (`isScopa`, `dealtNewHands`)
- il blocco finale che decideva il turno successivo e chiamava `triggerCpuTurn()` diventa:

```js
      this.isProcessing = false;
      this.updateBoard();

      if (this.view.isRoundOver) {
        this.stopTurnTimer();
        setTimeout(() => this.showRoundSummary(this.view.roundResult), 1000);
        return;
      }
```

Nota: `playMoveSequence` non chiama più `syncTurnState()`. Se ne occupa
`drainMoveQueue()` quando la coda si svuota, altrimenti il timer ripartirebbe
in mezzo a una sequenza di animazioni ancora da smaltire.

Il blocco `catch` termina così: `this.isProcessing = false;` seguito da
`this.updateBoard();`, e rimuove le carte volanti rimaste come fa oggi.

- [ ] **Step 6: Elimina `triggerCpuTurn` e semplifica il timer**

- Cancella interamente il metodo `triggerCpuTurn()`: il turno del computer ora vive in `LocalMatchController.maybePlayCpu()`.
- Cancella il campo `this.cpuThinkingTimeout` e i suoi usi in `stopTurnTimer()`.
- `onTimerExpired(role)` si riduce a:

```js
  onTimerExpired() {
    if (!this.view || this.view.status !== 'active' || this.view.isRoundOver) return;

    this.isProcessing = false;
    const choiceDialog = document.getElementById('capture-choice-dialog');
    if (choiceDialog?.open) choiceDialog.close();

    this.setNarrator('⌛', 'Tempo scaduto! Mossa automatica...');
    this.match.claimTimeout();
  }
```

- In `startTurnTimer(role)` sostituisci `this.timerSeconds = 10` con `this.timerSeconds = this.view.turnSeconds` e, in `updateTimerDisplay()`, il divisore `10` della percentuale con `this.view.turnSeconds`.

- [ ] **Step 7: Verifica che il progetto compili**

Run: `npm run build`
Expected: build riuscita, nessun errore di import

Run: `npm test`
Expected: PASS, i test dei Task 1 e 2 restano verdi

- [ ] **Step 8: Verifica manuale della partita locale**

Run: `npm run dev`

Apri il browser, accedi, avvia una partita contro il computer e controlla:
- le carte si animano come prima, con la pausa sul feltro verde
- il computer gioca dopo circa un secondo
- il timer parte da 10 e, a zero, la mossa parte da sola
- la scopa mostra la celebrazione
- il riepilogo di fine smazzata compare

Se qualcosa è cambiato rispetto a prima, sistemalo adesso: le fasi successive daranno per scontato che la partita locale funzioni.

- [ ] **Step 9: Commit**

```bash
git add src/games/scopa/LocalMatchController.js src/games/scopa/ScopaView.js
git commit -m "refactor: ScopaView disegna uno snapshot invece di leggere il motore

La view conosceva il motore in 52 punti, il che rendeva impossibile
riusarla per una partita remota. Ora riceve uno snapshot normalizzato da
un MatchController; LocalMatchController conserva il comportamento della
partita contro il computer.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: `OnlineMatchController`

**Files:**
- Create: `src/games/scopa/OnlineMatchController.js`
- Modify: `src/games/scopa/ScopaView.js` (solo `init`)

**Interfaces:**
- Consumes: il contratto `MatchController` (Task 6); la Edge Function (Task 5)
- Produces: `new OnlineMatchController({ sessionId })`, stessi metodi del controller locale

- [ ] **Step 1: Implementa il controller online**

Crea `src/games/scopa/OnlineMatchController.js`:

```js
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
      console.warn('[OnlineMatchController] errore', action, error);
      return { error: 'network' };
    }
    if (data?.view) {
      this.view = data.view;
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
      .subscribe();
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
```

- [ ] **Step 2: Fai scegliere a ScopaView quale controller usare**

In `src/games/scopa/ScopaView.js`, aggiungi l'import:

```js
import { OnlineMatchController } from './OnlineMatchController.js';
```

e in `init(options)` sostituisci la creazione fissa del controller locale con:

```js
    this.match = options.sessionId
      ? new OnlineMatchController({ sessionId: options.sessionId })
      : new LocalMatchController({
          targetScore: target,
          username: authManager.getNickname() || 'Tu'
        });
```

- [ ] **Step 3: Aggiungi il pulsante Abbandona e l'avviso di riconnessione**

La spec prevede entrambi ma nessun task li ha ancora creati.

In `renderLayout()` di `ScopaView.js`, dentro l'intestazione della partita,
aggiungi:

```html
          <button class="abandon-match-btn hidden" id="abandon-match-btn">Abbandona</button>
          <span class="reconnect-notice hidden" id="reconnect-notice">Riconnessione…</span>
```

In `attachEventListeners()`:

```js
    document.getElementById('abandon-match-btn')?.addEventListener('click', async () => {
      if (!confirm('Vuoi abbandonare la partita? Il tuo avversario vincerà.')) return;
      soundFx.playSnap();
      await this.match.concede();
      gameManager.setView('lobby');
    });
```

In `updateBoard()`, mostra il pulsante solo online e l'avviso solo quando il
canale è caduto:

```js
    const abandonBtn = document.getElementById('abandon-match-btn');
    if (abandonBtn) abandonBtn.classList.toggle('hidden', this.view.mode !== 'online');

    const notice = document.getElementById('reconnect-notice');
    if (notice) notice.classList.toggle('hidden', this.view.connected !== false);
```

In `OnlineMatchController`, aggiungi il campo `this.connected = true;` nel
costruttore, riportalo nella vista dentro `call()` subito prima di `this.emit()`:

```js
      this.view = { ...data.view, connected: this.connected };
```

e tienilo aggiornato nella sottoscrizione Realtime:

```js
      .subscribe((status) => {
        this.connected = status === 'SUBSCRIBED';
        if (this.view) {
          this.view = { ...this.view, connected: this.connected };
          this.emit();
        }
      });
```

Nel controller locale, `getView()` non espone `connected`, quindi resta
`undefined` e l'avviso non compare mai: è il comportamento voluto.

In `src/style.css`, in coda, aggiungi lo stile minimo:

```css
.abandon-match-btn {
  background: rgba(180, 40, 40, 0.85);
  color: #fff;
  border: none;
  border-radius: 999px;
  padding: 0.4rem 0.9rem;
  font-size: 0.85rem;
  cursor: pointer;
}

.reconnect-notice {
  font-size: 0.8rem;
  color: #f0c060;
}
```

- [ ] **Step 4: Verifica la build**

Run: `npm run build && npm test`
Expected: build riuscita, test verdi

- [ ] **Step 5: Commit**

```bash
git add src/games/scopa/OnlineMatchController.js src/games/scopa/ScopaView.js src/style.css
git commit -m "feat: controller per le partite online

Parla con la Edge Function, ascolta Realtime sulla sessione e tiene un
polling di riserva ogni 3 secondi, che serve anche a far scattare i turni
scaduti quando l'avversario ha chiuso l'app.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Aggancio a inviti e lobby

**Files:**
- Modify: `src/core/FriendsManager.js` (`respondToGameInvite`, `fetchIncomingGameInvites`)
- Modify: `src/components/LobbyView.js:359-368`

**Interfaces:**
- Consumes: azione `create` della Edge Function (Task 5); `options.sessionId` di `ScopaView.init` (Task 7)
- Produces: `friendsManager.acceptGameInvite(inviteId) -> { sessionId }`; `friendsManager.findActiveSession() -> sessionId | null`

- [ ] **Step 1: Crea la sessione quando si accetta la sfida**

In `src/core/FriendsManager.js`, aggiungi due metodi dopo `respondToGameInvite`:

```js
  /**
   * Accetta una sfida: la Edge Function crea la partita e restituisce il suo id
   */
  async acceptGameInvite(inviteId) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) throw new Error('Devi aver effettuato l\'accesso.');

    const { data, error } = await supabase.functions.invoke('scopa', {
      body: { action: 'create', inviteId },
      headers: { Authorization: `Bearer ${token}` }
    });

    if (error || !data?.sessionId) {
      console.error('[FriendsManager] Creazione partita fallita:', error);
      throw new Error('Impossibile avviare la partita. Riprova.');
    }

    await this.refreshAll();
    return data.sessionId;
  }

  /**
   * Partita già in corso da riprendere (riapertura dell'app, sfida accettata
   * dall'altro mentre eri nella lobby)
   */
  async findActiveSession() {
    const user = authManager.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('game_sessions')
      .select('id')
      .eq('status', 'active')
      .or(`player_a.eq.${user.id},player_b.eq.${user.id}`)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) return null;
    return data[0].id;
  }
```

- [ ] **Step 2: Fai entrare in partita chi accetta**

In `src/components/LobbyView.js`, sostituisci il gestore del pulsante "Accetta e Gioca":

```js
          challengesBox.querySelectorAll('button[data-action="accept"]').forEach(btn => {
            btn.addEventListener('click', async () => {
              const invId = btn.getAttribute('data-invite-id');
              soundFx.playWin();
              btn.disabled = true;
              btn.innerHTML = '<span>Avvio partita...</span>';

              try {
                const sessionId = await friendsManager.acceptGameInvite(invId);
                gameManager.setView('scopa', { sessionId });
              } catch (err) {
                alert(err.message || 'Impossibile avviare la partita.');
                btn.disabled = false;
                btn.innerHTML = '<span>Accetta e Gioca</span>';
              }
            });
          });
```

- [ ] **Step 3: Fai entrare anche chi ha lanciato la sfida**

Sempre in `LobbyView.js`, dentro la stessa sottoscrizione a `friendsManager`, aggiungi subito prima del blocco che disegna le sfide in arrivo:

```js
      // Chi ha lanciato la sfida entra appena l'altro accetta
      if (!this.joinedSessionId) {
        friendsManager.findActiveSession().then(sessionId => {
          if (sessionId && gameManager.getView() === 'lobby') {
            this.joinedSessionId = sessionId;
            gameManager.setView('scopa', { sessionId });
          }
        });
      }
```

e inizializza `this.joinedSessionId = null;` nel costruttore di `LobbyView`, accanto a `this.friendsUnsub = null;`.

- [ ] **Step 4: Verifica la build**

Run: `npm run build && npm test`
Expected: build riuscita, test verdi

- [ ] **Step 5: Commit**

```bash
git add src/core/FriendsManager.js src/components/LobbyView.js
git commit -m "feat: la sfida accettata apre una vera partita condivisa

Accettare l'invito crea la sessione tramite la Edge Function e porta
entrambi nella stessa partita; chi aveva sfidato entra appena la sessione
compare. Prima 'Accetta e Gioca' apriva due partite separate contro il
computer.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Deploy e verifica su due dispositivi

**Files:** nessuno modificato: è la fase di messa in esercizio.

- [ ] **Step 1: Esegui lo schema**

Apri il SQL Editor di Supabase, incolla tutto `supabase_multiplayer.sql` ed esegui.

Verifica con questa query che le policy siano quelle attese:

```sql
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('game_sessions', 'game_session_hands', 'game_session_secrets')
ORDER BY tablename;
```

Expected: una riga `SELECT` per `game_sessions`, una `SELECT` per `game_session_hands`, **nessuna riga** per `game_session_secrets`.

- [ ] **Step 2: Deploya la Edge Function**

```bash
npm run sync:engine && supabase functions deploy scopa
```

Expected: `Deployed Function scopa`

- [ ] **Step 3: Verifica che il segreto non sia leggibile dal client**

Dalla console del browser, con l'app aperta e l'utente connesso:

```js
await supabase.from('game_session_secrets').select('*')
```

Expected: `data: []` — con RLS attivo e zero policy la tabella non restituisce nulla.

- [ ] **Step 4: Partita completa a due dispositivi**

Con due account su due dispositivi, controlla:
- la sfida inviata apre la stessa partita a entrambi
- ognuno vede la propria mano e solo il dorso delle carte dell'altro
- una mossa compare sull'altro dispositivo entro un paio di secondi
- toccare due volte in fretta la stessa carta non la gioca due volte
- lasciando scadere il turno, la mossa parte da sola
- chiudendo e riaprendo l'app la partita riprende dov'era
- "Abbandona" assegna la vittoria all'altro
- la partita contro il computer funziona ancora come prima

- [ ] **Step 5: Commit finale e push**

```bash
git add -A
git commit -m "chore: multiplayer online della Scopa verificato su due dispositivi

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git push
```
