// Italian 40-Card Deck Definitions & Authentic Image Mapping

export const SUITS = {
  DENARI: 'denari',
  COPPE: 'coppe',
  SPADE: 'spade',
  BASTONI: 'bastoni'
};

export const SUIT_NAMES = {
  denari: 'Denari',
  coppe: 'Coppe',
  spade: 'Spade',
  bastoni: 'Bastoni'
};

export const CARD_NAMES = {
  1: 'Asso',
  2: 'Due',
  3: 'Tre',
  4: 'Quattro',
  5: 'Cinque',
  6: 'Sei',
  7: 'Sette',
  8: 'Fante',
  9: 'Cavallo',
  10: 'Re'
};

// Primiera point values in Scopa
export const PRIMIERA_VALUES = {
  7: 21,
  6: 18,
  1: 16,
  5: 15,
  4: 14,
  3: 13,
  2: 12,
  8: 10,
  9: 10,
  10: 10
};

// Exact mapping to files in /public/carte/
export const CARD_IMAGES = {
  [SUITS.DENARI]: {
    1: '/carte/01_Asso_di_denari.jpg',
    2: '/carte/02_Due_di_denari.jpg',
    3: '/carte/03_Tre_di_denari.jpg',
    4: '/carte/04_Quattro_di_denari.jpg',
    5: '/carte/05_Cinque_di_denari.jpg',
    6: '/carte/06_Sei_di_denari.jpg',
    7: '/carte/07_Sette_di_denari.jpg',
    8: '/carte/08_Otto_di_denari.jpg',
    9: '/carte/09_Nove_di_denari.jpg',
    10: '/carte/10_Dieci_di_denari.jpg',
  },
  [SUITS.COPPE]: {
    1: '/carte/11_Asso_di_coppe.jpg',
    2: '/carte/12_Due_di_coppe.jpg',
    3: '/carte/13_Tre_di_coppe.jpg',
    4: '/carte/14_Quattro_di_coppe.jpg',
    5: '/carte/15_Cinque_di_coppe.jpg',
    6: '/carte/16_Sei_di_coppe.jpg',
    7: '/carte/17_Sette_di_coppe.jpg',
    8: '/carte/18_Otto_di_coppe.jpg',
    9: '/carte/19_Nove_di_coppe.jpg',
    10: '/carte/20_Dieci_di_coppe.jpg',
  },
  [SUITS.SPADE]: {
    1: '/carte/21_Asso_di_spade.jpg',
    2: '/carte/22_Due_di_spade.jpg',
    3: '/carte/23_Tre_di_spade.jpg',
    4: '/carte/24_Quattro_di_spade.jpg',
    5: '/carte/25_Cinque_di_spade.jpg',
    6: '/carte/26_Sei_di_spade.jpg',
    7: '/carte/27_Sette_di_spade.jpg',
    8: '/carte/28_Otto_di_spade.jpg',
    9: '/carte/29_Nove_di_spade.jpg',
    10: '/carte/30_Dieci_di_spade.jpg',
  },
  [SUITS.BASTONI]: {
    1: '/carte/31_Asso_di_bastoni.jpg',
    2: '/carte/32_Due_di_bastoni.jpg',
    3: '/carte/33_Tre_di_bastoni.jpg',
    4: '/carte/34_Quattro_di_bastoni.jpg',
    5: '/carte/35_Cinque_di_bastoni.jpg',
    6: '/carte/36_Sei_di_bastoni.jpg',
    7: '/carte/37_Sette_di_bastoni.jpg',
    8: '/carte/38_Otto_di_bastoni.jpg',
    9: '/carte/39_Nove_di_bastoni.jpg',
    10: '/carte/40_Dieci_di_Bastoni.jpg',
  }
};

// Creates the full 40-card Italian deck with image references
export function createDeck() {
  const deck = [];
  const suits = [SUITS.DENARI, SUITS.COPPE, SUITS.SPADE, SUITS.BASTONI];
  
  for (const suit of suits) {
    for (let value = 1; value <= 10; value++) {
      const isSettebello = suit === SUITS.DENARI && value === 7;
      deck.push({
        id: `${suit}_${value}`,
        suit,
        value,
        name: `${CARD_NAMES[value]} di ${SUIT_NAMES[suit]}`,
        isSettebello,
        primieraValue: PRIMIERA_VALUES[value],
        image: CARD_IMAGES[suit][value]
      });
    }
  }
  return deck;
}

// Shuffle deck using Fisher-Yates
export function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Render the authentic face of the Italian card using the user's artwork
export function renderCardSvg(card, isFaceUp = true) {
  if (!isFaceUp) {
    return renderCardBackSvg();
  }

  const { value, name, isSettebello, image } = card;

  return `
    <div class="card-face ${isSettebello ? 'is-settebello' : ''}" title="${name}">
      <img src="${image}" alt="${name}" class="italian-card-img" draggable="false" loading="eager" decoding="async" />
      <span class="card-value-indicator">${value}</span>
      ${isSettebello ? '<div class="settebello-tag">★ SETTEBELLO ★</div>' : ''}
    </div>
  `;
}

// Card Back: Vintage Italian geometric damask pattern matching authentic decks
export function renderCardBackSvg() {
  return `
    <div class="card-face card-back-face">
      <svg viewBox="0 0 100 165" xmlns="http://www.w3.org/2000/svg" class="italian-card-back-svg">
        <defs>
          <pattern id="card-damask" width="14" height="14" patternUnits="userSpaceOnUse">
            <path d="M 0 7 L 7 0 L 14 7 L 7 14 Z" fill="#142c54" stroke="#cbb26b" stroke-width="0.6" />
            <circle cx="7" cy="7" r="1.6" fill="#f5c542" />
          </pattern>
        </defs>
        <!-- Background -->
        <rect x="0" y="0" width="100" height="165" rx="7" fill="#0b1a33" />
        <rect x="5" y="5" width="90" height="155" rx="5" fill="url(#card-damask)" stroke="#cbb26b" stroke-width="1.2" />
        <!-- Central Italian Royal Rosette -->
        <circle cx="50" cy="82.5" r="20" fill="#0b1a33" stroke="#f5c542" stroke-width="1.6" />
        <circle cx="50" cy="82.5" r="16" fill="#142c54" stroke="#e0c068" stroke-width="0.8" />
        <!-- Star Motif -->
        <path d="M 50 68 L 53 78 L 63 82.5 L 53 87 L 50 97 L 47 87 L 37 82.5 L 47 78 Z" fill="#ffd700" />
      </svg>
    </div>
  `;
}
