// Tactical Italian Scopa AI Bot Engine

import { SUITS } from './ScopaCards.js';

export class ScopaAI {
  /**
   * Decide the best card to play and capture option
   * @param {Array} cpuHand
   * @param {Array} tableCards
   * @param {Object} engine - reference to ScopaEngine for capture evaluation
   */
  static decideMove(cpuHand, tableCards, engine) {
    if (!cpuHand || cpuHand.length === 0) return null;

    let bestMove = null;
    let highestScore = -Infinity;

    // Evaluate each playable card
    for (const card of cpuHand) {
      const captureInfo = engine.getCaptureOptions(card, tableCards);

      if (captureInfo.type !== 'none' && captureInfo.options.length > 0) {
        // Card CAN capture: evaluate all capture options for this card
        for (const option of captureInfo.options) {
          const moveScore = this.scoreCaptureMove(card, option, tableCards);
          if (moveScore > highestScore) {
            highestScore = moveScore;
            bestMove = { card, chosenOption: option };
          }
        }
      } else {
        // Card CANNOT capture (must discard): evaluate discard safety
        const discardScore = this.scoreDiscardMove(card, tableCards);
        if (discardScore > highestScore) {
          highestScore = discardScore;
          bestMove = { card, chosenOption: null };
        }
      }
    }

    return bestMove || { card: cpuHand[0], chosenOption: null };
  }

  // Scoring a capture move
  static scoreCaptureMove(playedCard, capturedOption, tableCards) {
    let score = 100; // Base score for making a capture

    const allInTrick = [playedCard, ...capturedOption];
    const isClearingTable = capturedOption.length === tableCards.length;

    // 1. SCOPA bonus: Clears table completely!
    if (isClearingTable) {
      score += 400; // Huge incentive to make a Scopa
    }

    // 2. Settebello bonus: Captured the 7 of Denari
    const hasSettebello = allInTrick.some(c => c.isSettebello);
    if (hasSettebello) {
      score += 250;
    }

    // 3. Denari cards
    const denariCount = allInTrick.filter(c => c.suit === SUITS.DENARI).length;
    score += denariCount * 40;

    // 4. Primiera priority cards: 7s, 6s, Assi
    allInTrick.forEach(c => {
      if (c.value === 7) score += 50;
      else if (c.value === 6) score += 30;
      else if (c.value === 1) score += 25;
      else if (c.value === 5) score += 15;
    });

    // 5. Total number of cards captured
    score += allInTrick.length * 10;

    // 6. Prefer taking single card if table has other cards that don't total <= 10
    // (Leave tricky sums for opponent)
    const remainingTableCards = tableCards.filter(c => !capturedOption.some(opt => opt.id === c.id));
    const remainingSum = remainingTableCards.reduce((s, c) => s + c.value, 0);
    if (remainingSum > 10) {
      score += 15; // Opponent cannot scopa with a single card <= 10
    }

    return score;
  }

  // Scoring a discard move (when no capture is possible)
  static scoreDiscardMove(card, tableCards) {
    let score = 0;

    // Penalty for throwing the Settebello!
    if (card.isSettebello) {
      score -= 500;
    }

    // Penalty for throwing high Primiera cards (7, 6, Asso)
    if (card.value === 7) score -= 120;
    else if (card.value === 6) score -= 70;
    else if (card.value === 1) score -= 50;

    // Penalty for throwing Denari
    if (card.suit === SUITS.DENARI) score -= 40;

    // Evaluate risk of giving the opponent a Scopa:
    // If the table after this discard has a total sum <= 10, opponent can potentially Scopa!
    const tableSum = tableCards.reduce((s, c) => s + c.value, 0);
    const newTotalSum = tableSum + card.value;

    if (newTotalSum <= 10) {
      // High danger of Scopa for opponent if they have a card of value newTotalSum
      score -= 150;
    } else if (newTotalSum <= 15) {
      // Moderate danger if table had few cards
      score -= 30;
    }

    // Low values (2, 3, 4) or Figures (8, 9, 10) are often safer discards if not Denari
    if (card.value === 8 || card.value === 9 || card.value === 10) {
      score += 15; // Harder for opponent to easily sum into a scopa if already high
    } else if (card.value === 2 || card.value === 3) {
      score += 10;
    }

    return score;
  }
}
