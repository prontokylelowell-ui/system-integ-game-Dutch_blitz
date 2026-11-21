/* =============================================================================
   Dutch Blitz — js/cards.js
   Deck construction, the four folk-art deck symbols, and the shared card
   renderer used by every screen.
   ============================================================================= */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Constants                                                           */
  /* ------------------------------------------------------------------ */

  var COLORS = ['red', 'blue', 'green', 'yellow'];
  var VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  /* Dutch Blitz splits the four colours into "boys" and "girls".
     Post piles must alternate between the two groups. */
  var GENDER = { blue: 'boy', red: 'boy', green: 'girl', yellow: 'girl' };

  var COLOR_LABEL = { red: 'Red', blue: 'Blue', green: 'Green', yellow: 'Yellow' };

  /* The four deck backs, in seat order (0 = human player). */
  var SEATS = [
    { symbol: 'buggy',  label: 'The Buggy' },
    { symbol: 'pump',   label: 'The Pump' },
    { symbol: 'plow',   label: 'The Plow' },
    { symbol: 'bucket', label: 'The Bucket' }
  ];

  /* Hand-drawn folk-art line icons (no external assets, no emoji). */
  var SYMBOLS = {
    buggy:
      '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">' +
      '<circle cx="10" cy="23" r="4.6"/><circle cx="23" cy="25" r="2.8"/>' +
      '<path d="M10 18.4V11h11v12"/><path d="M21 11h7"/><path d="M10 15h11"/></svg>',
    pump:
      '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">' +
      '<path d="M11 28V10"/><path d="M7 28h8"/><path d="M11 10h7"/><path d="M18 10v5"/>' +
      '<path d="M11 10 4 6"/><path d="M4 6h6"/></svg>',
    plow:
      '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">' +
      '<path d="M5 27h22"/><path d="M12 27V8"/><path d="M12 27V14l12 12z"/></svg>',
    bucket:
      '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">' +
      '<path d="M9 11h14l-2.2 16H11.2z"/><path d="M8.5 11a7.5 7.5 0 0 1 15 0"/>' +
      '<path d="M10 17h12"/></svg>'
  };

  /* ------------------------------------------------------------------ */
  /* Tiny DOM helper                                                     */
  /* ------------------------------------------------------------------ */
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function symbolSvg(name, cls) {
    var wrap = document.createElement('span');
    wrap.className = 'sym' + (cls ? ' ' + cls : '');
    wrap.innerHTML = SYMBOLS[name] || SYMBOLS.buggy;
    return wrap;
  }

  /* ------------------------------------------------------------------ */
  /* Deck helpers                                                        */
  /* ------------------------------------------------------------------ */

  /* One 40-card deck: every colour 1-10. `owner` is the seat index. */
  function createDeck(owner) {
    var deck = [];
    for (var c = 0; c < COLORS.length; c++) {
      for (var v = 0; v < VALUES.length; v++) {
        deck.push({
          id: owner + ':' + COLORS[c] + ':' + VALUES[v],
          owner: owner,
          color: COLORS[c],
          value: VALUES[v]
        });
      }
    }
    return deck;
  }

  function shuffle(list) {
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }

  function genderOf(color) { return GENDER[color]; }
  function isBoy(color) { return GENDER[color] === 'boy'; }

  /* ------------------------------------------------------------------ */
  /* Renderers                                                           */
  /* ------------------------------------------------------------------ */

  /* A face-up card.
     options = { size: 'lg'|'md'|'sm', playable, dim, label } */
  function renderCard(card, options) {
    options = options || {};
    var cls = 'card c-' + card.color + ' size-' + (options.size || 'md');
    if (options.playable) cls += ' is-playable';
    if (options.dim) cls += ' is-dim';

    var node = el('div', cls);
    node.dataset.cardId = card.id;
    node.dataset.owner = String(card.owner);
    node.dataset.color = card.color;
    node.dataset.value = String(card.value);
    node.setAttribute('role', 'img');
    node.setAttribute('aria-label',
      (options.label ? options.label + ': ' : '') +
      COLOR_LABEL[card.color] + ' ' + card.value +
      ' (' + GENDER[card.color] + ' card, ' + SEATS[card.owner].label + ')');

    node.appendChild(el('span', 'card-num', String(card.value)));
    node.appendChild(symbolSvg(SEATS[card.owner].symbol, 'card-sym'));
    return node;
  }

  /* A face-down card showing the owner's deck symbol.
     options = { size, count, interactive } */
  function renderBack(owner, options) {
    options = options || {};
    var cls = 'card card-back size-' + (options.size || 'md');
    if (options.interactive) cls += ' is-playable';

    var node = el('div', cls);
    node.dataset.owner = String(owner);
    node.setAttribute('role', 'img');
    node.setAttribute('aria-label',
      'Face-down card — ' + SEATS[owner].label + ' deck');

    node.appendChild(symbolSvg(SEATS[owner].symbol, 'back-sym'));
    if (options.count != null) {
      node.appendChild(el('span', 'back-count', String(options.count)));
    }
    return node;
  }

  /* An empty pile placeholder. */
  function renderSlot(label, size) {
    var node = el('div', 'card card-slot size-' + (size || 'md'));
    if (label) node.appendChild(el('span', 'slot-label', label));
    return node;
  }

  global.DBCards = {
    COLORS: COLORS,
    VALUES: VALUES,
    GENDER: GENDER,
    COLOR_LABEL: COLOR_LABEL,
    SEATS: SEATS,
    el: el,
    symbolSvg: symbolSvg,
    createDeck: createDeck,
    shuffle: shuffle,
    genderOf: genderOf,
    isBoy: isBoy,
    renderCard: renderCard,
    renderBack: renderBack,
    renderSlot: renderSlot
  };
})(window);
