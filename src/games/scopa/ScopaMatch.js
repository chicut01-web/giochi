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

// Inizia la smazzata successiva (reset tavolo, nuove mani, cambio mazziere)
export function nextRound(secret) {
  const engine = ScopaEngine.deserialize(secret);
  if (!engine.isRoundOver) return { ok: false, error: 'round_not_over' };
  if (engine.isMatchOver) return { ok: false, error: 'match_over' };

  engine.initRound();
  return { ok: true, snapshot: snapshotFromEngine(engine, null) };
}

// Normalizza il risultato di fine smazzata con prospettiva you/opponent
function normalizeRoundResult(res, seat) {
  if (!res) return null;
  const myRole = SEAT_ROLE[seat];
  const oppRole = myRole === 'player' ? 'cpu' : 'player';

  return {
    ...res,
    carte: {
      you: res.carte[myRole],
      opponent: res.carte[oppRole],
      points: { you: res.carte.points[myRole], opponent: res.carte.points[oppRole] },
      player: res.carte.player,
      cpu: res.carte.cpu
    },
    denari: {
      you: res.denari[myRole],
      opponent: res.denari[oppRole],
      points: { you: res.denari.points[myRole], opponent: res.denari.points[oppRole] },
      player: res.denari.player,
      cpu: res.denari.cpu
    },
    settebello: {
      you: res.settebello[myRole],
      opponent: res.settebello[oppRole],
      points: { you: res.settebello.points[myRole], opponent: res.settebello.points[oppRole] },
      player: res.settebello.player,
      cpu: res.settebello.cpu
    },
    primiera: {
      you: res.primiera[myRole],
      opponent: res.primiera[oppRole],
      points: { you: res.primiera.points[myRole], opponent: res.primiera.points[oppRole] },
      player: res.primiera.player,
      cpu: res.primiera.cpu
    },
    scope: {
      you: res.scope[myRole],
      opponent: res.scope[oppRole],
      points: { you: res.scope.points[myRole], opponent: res.scope.points[oppRole] },
      player: res.scope.player,
      cpu: res.scope.cpu
    },
    roundTotal: {
      you: res.roundTotal[myRole],
      opponent: res.roundTotal[oppRole],
      player: res.roundTotal.player,
      cpu: res.roundTotal.cpu
    },
    matchScore: {
      you: res.matchScore[myRole],
      opponent: res.matchScore[oppRole],
      player: res.matchScore.player,
      cpu: res.matchScore.cpu
    },
    isMatchOver: res.isMatchOver,
    isWinner: res.matchWinner ? res.matchWinner === myRole : null,
    matchWinner: res.matchWinner
  };
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
    roundResult: normalizeRoundResult(publicState.roundResult, seat),
    isRoundOver: publicState.isRoundOver,
    isMatchOver: publicState.isMatchOver,
    matchWinnerSeat: publicState.matchWinnerSeat
  };
}
