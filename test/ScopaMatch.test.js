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
