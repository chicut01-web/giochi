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
