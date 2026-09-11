// Official Italian Scopa Game Logic Engine

import { createDeck, shuffleDeck, SUITS, PRIMIERA_VALUES } from './ScopaCards.js';

export class ScopaEngine {
  constructor(options = {}) {
    this.targetScore = options.targetScore || 11; // 11, 21, or 1
    this.matchScore = { player: 0, cpu: 0 };
    this.roundNumber = 0;
    this.dealer = 'player'; // Set to player so round 1 dealer toggles to cpu and player plays first
    this.currentTurn = 'player';
    this.isMatchOver = false;
    this.matchWinner = null;
    
    // Start first round
    this.initRound();
  }

  initRound() {
    this.roundNumber += 1;
    this.deck = shuffleDeck(createDeck());
    
    // Table re-deal rule: if 3 or 4 kings appear initially on table, reshuffle
    let initialTable = [];
    let attempts = 0;
    while (attempts < 10) {
      initialTable = this.deck.slice(0, 4);
      const kingsCount = initialTable.filter(c => c.value === 10).length;
      if (kingsCount < 3) {
        this.deck = this.deck.slice(4);
        break;
      }
      this.deck = shuffleDeck(createDeck());
      attempts++;
    }

    this.tableCards = initialTable;
    this.playerHand = [];
    this.cpuHand = [];
    
    this.playerCaptures = [];
    this.cpuCaptures = [];
    this.playerScope = 0;
    this.cpuScope = 0;
    
    this.lastCapturer = null;
    this.isRoundOver = false;
    this.roundScoreResult = null;

    // Toggle dealer
    this.dealer = this.dealer === 'player' ? 'cpu' : 'player';
    // Non-dealer plays first
    this.currentTurn = this.dealer === 'cpu' ? 'player' : 'cpu';

    // Deal first 3 cards to each player
    this.dealHands();
  }

  dealHands() {
    if (this.deck.length >= 6) {
      this.playerHand = this.deck.splice(0, 3);
      this.cpuHand = this.deck.splice(0, 3);
      return true;
    }
    return false;
  }

  // Check if hand dealing is needed
  checkDealNeeded() {
    if (this.playerHand.length === 0 && this.cpuHand.length === 0) {
      if (this.deck.length > 0) {
        this.dealHands();
        return true;
      } else {
        this.finishRound();
        return false;
      }
    }
    return false;
  }

  // Combinations generator for sum captures
  getSumCombinations(cards, targetSum) {
    const results = [];

    function findCombinations(startIndex, currentCombo, currentSum) {
      if (currentSum === targetSum) {
        if (currentCombo.length >= 2) {
          results.push([...currentCombo]);
        }
        return;
      }
      if (currentSum > targetSum) return;

      for (let i = startIndex; i < cards.length; i++) {
        findCombinations(
          i + 1,
          [...currentCombo, cards[i]],
          currentSum + cards[i].value
        );
      }
    }

    findCombinations(0, [], 0);
    return results;
  }

  // Evaluates valid captures according to official Scopa rules:
  // MANDATORY: If a single card matches, must take that card. No sum capture allowed.
  getCaptureOptions(playedCard, table = this.tableCards) {
    // 1. Check for single matching card
    const singleMatches = table.filter(c => c.value === playedCard.value);
    if (singleMatches.length > 0) {
      return {
        type: 'single',
        options: singleMatches.map(c => [c])
      };
    }

    // 2. Check for sum combinations of 2 or more cards
    const sumOptions = this.getSumCombinations(table, playedCard.value);
    if (sumOptions.length > 0) {
      return {
        type: 'sum',
        options: sumOptions
      };
    }

    // 3. No capture possible
    return {
      type: 'none',
      options: []
    };
  }

  // Play card action
  playCard(role, cardId, chosenOption = null) {
    if (this.isRoundOver || this.isMatchOver) {
      return { error: 'Partita o smazzata terminata.' };
    }

    if (this.currentTurn !== role) {
      return { error: 'Non è il tuo turno.' };
    }

    const hand = role === 'player' ? this.playerHand : this.cpuHand;
    const cardIndex = hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) {
      return { error: 'Carta non trovata nella mano.' };
    }

    const playedCard = hand.splice(cardIndex, 1)[0];
    const captureInfo = this.getCaptureOptions(playedCard, this.tableCards);

    let capturedCards = [];
    let isScopa = false;
    let captureType = captureInfo.type;

    if (captureInfo.type !== 'none') {
      // Determine which combination is used
      let selectedCombo = null;

      if (chosenOption && Array.isArray(chosenOption)) {
        // Validate chosen option against available options
        const chosenIds = chosenOption.map(c => c.id).sort().join(',');
        const validOption = captureInfo.options.find(opt => 
          opt.map(c => c.id).sort().join(',') === chosenIds
        );
        selectedCombo = validOption || captureInfo.options[0];
      } else {
        selectedCombo = captureInfo.options[0];
      }

      capturedCards = [...selectedCombo];
      const capturedIds = new Set(capturedCards.map(c => c.id));

      // Remove captured cards from table
      this.tableCards = this.tableCards.filter(c => !capturedIds.has(c.id));

      // Add to player/CPU captures (including the played card itself)
      const capturesList = role === 'player' ? this.playerCaptures : this.cpuCaptures;
      capturesList.push(playedCard, ...capturedCards);

      this.lastCapturer = role;

      // Scopa Rule: If table is cleared AND not the very last trick of the round
      const isLastTrickOfRound = (this.deck.length === 0 && this.playerHand.length === 0 && this.cpuHand.length === 0);
      if (this.tableCards.length === 0 && !isLastTrickOfRound) {
        isScopa = true;
        if (role === 'player') {
          this.playerScope += 1;
        } else {
          this.cpuScope += 1;
        }
      }
    } else {
      // No capture: card goes to table
      this.tableCards.push(playedCard);
    }

    // Toggle turn
    this.currentTurn = this.currentTurn === 'player' ? 'cpu' : 'player';

    // Check if hands empty -> deal or finish
    const dealtNewHands = this.checkDealNeeded();

    return {
      success: true,
      role,
      playedCard,
      captureType,
      capturedCards,
      isScopa,
      tableCardsRemaining: this.tableCards.length,
      dealtNewHands,
      isRoundOver: this.isRoundOver,
      roundScoreResult: this.roundScoreResult
    };
  }

  // Calculate Primiera for a set of captured cards
  static calculatePrimiera(cards) {
    const suitBest = {
      [SUITS.DENARI]: 0,
      [SUITS.COPPE]: 0,
      [SUITS.SPADE]: 0,
      [SUITS.BASTONI]: 0
    };

    cards.forEach(card => {
      const pVal = PRIMIERA_VALUES[card.value] || 0;
      if (pVal > suitBest[card.suit]) {
        suitBest[card.suit] = pVal;
      }
    });

    const total = Object.values(suitBest).reduce((sum, v) => sum + v, 0);
    // Has all 4 suits covered
    const hasAllSuits = Object.values(suitBest).every(v => v > 0);

    return {
      suitBest,
      total,
      hasAllSuits
    };
  }

  // Finish round and compute points
  finishRound() {
    this.isRoundOver = true;

    // Remaining table cards go to the last capturer
    let remainingTo = this.lastCapturer || 'player';
    let leftoverCards = [...this.tableCards];
    if (leftoverCards.length > 0) {
      if (remainingTo === 'player') {
        this.playerCaptures.push(...leftoverCards);
      } else {
        this.cpuCaptures.push(...leftoverCards);
      }
      this.tableCards = [];
    }

    // 1. CARTE (most cards > 20)
    const pCardCount = this.playerCaptures.length;
    const cCardCount = this.cpuCaptures.length;
    let cartePoint = { player: 0, cpu: 0 };
    if (pCardCount > 20) cartePoint.player = 1;
    else if (cCardCount > 20) cartePoint.cpu = 1;

    // 2. DENARI (most denari > 5)
    const pDenariCount = this.playerCaptures.filter(c => c.suit === SUITS.DENARI).length;
    const cDenariCount = this.cpuCaptures.filter(c => c.suit === SUITS.DENARI).length;
    let denariPoint = { player: 0, cpu: 0 };
    if (pDenariCount > 5) denariPoint.player = 1;
    else if (cDenariCount > 5) denariPoint.cpu = 1;

    // 3. SETTEBELLO (7 of Denari)
    const pHasSettebello = this.playerCaptures.some(c => c.isSettebello);
    const cHasSettebello = this.cpuCaptures.some(c => c.isSettebello);
    let settebelloPoint = {
      player: pHasSettebello ? 1 : 0,
      cpu: cHasSettebello ? 1 : 0
    };

    // 4. PRIMIERA
    const pPrimiera = ScopaEngine.calculatePrimiera(this.playerCaptures);
    const cPrimiera = ScopaEngine.calculatePrimiera(this.cpuCaptures);
    let primieraPoint = { player: 0, cpu: 0 };

    if (pPrimiera.total > cPrimiera.total) {
      primieraPoint.player = 1;
    } else if (cPrimiera.total > pPrimiera.total) {
      primieraPoint.cpu = 1;
    }

    // 5. SCOPE
    const scopePoint = {
      player: this.playerScope,
      cpu: this.cpuScope
    };

    // Round Totals
    const roundTotalPlayer = cartePoint.player + denariPoint.player + settebelloPoint.player + primieraPoint.player + scopePoint.player;
    const roundTotalCpu = cartePoint.cpu + denariPoint.cpu + settebelloPoint.cpu + primieraPoint.cpu + scopePoint.cpu;

    // Update Match Score
    this.matchScore.player += roundTotalPlayer;
    this.matchScore.cpu += roundTotalCpu;

    // Check Match Win condition
    if (this.matchScore.player >= this.targetScore || this.matchScore.cpu >= this.targetScore) {
      if (this.matchScore.player > this.matchScore.cpu) {
        this.isMatchOver = true;
        this.matchWinner = 'player';
      } else if (this.matchScore.cpu > this.matchScore.player) {
        this.isMatchOver = true;
        this.matchWinner = 'cpu';
      }
      // If tied above target score, another round is played to break tie
    }

    this.roundScoreResult = {
      carte: { player: pCardCount, cpu: cCardCount, points: cartePoint },
      denari: { player: pDenariCount, cpu: cDenariCount, points: denariPoint },
      settebello: { player: pHasSettebello, cpu: cHasSettebello, points: settebelloPoint },
      primiera: { player: pPrimiera.total, cpu: cPrimiera.total, points: primieraPoint },
      scope: { player: this.playerScope, cpu: this.cpuScope, points: scopePoint },
      roundTotal: { player: roundTotalPlayer, cpu: roundTotalCpu },
      matchScore: { ...this.matchScore },
      isMatchOver: this.isMatchOver,
      matchWinner: this.matchWinner,
      leftoverCards,
      remainingAwardedTo: remainingTo
    };

    return this.roundScoreResult;
  }
}
