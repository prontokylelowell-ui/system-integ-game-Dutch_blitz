/* =============================================================================
   Dutch Blitz — js/rules.js
   Pure, side-effect-free rule checks. Nothing in here mutates game state; the
   engine and the AI both lean on these helpers.
   ============================================================================= */
(function (global) {
  'use strict';

  var Cards = global.DBCards;

  /* A "source" describes where a card is coming from:
       { type: 'blitz', index: -1 }
       { type: 'wood',  index: -1 }
       { type: 'post',  index: 0|1|2 }
     The playable card of a stack is always its LAST element. */
  function getSourceCard(player, source) {
    if (!source) return null;
    var pile;
    if (source.type === 'blitz') pile = player.blitz;
    else if (source.type === 'wood') pile = player.wood.up;
    else if (source.type === 'post') pile = player.posts[source.index];
    else return null;
    if (!pile || !pile.length) return null;
    return pile[pile.length - 1];
  }

  /* Every stack that currently holds at least one card. */
  function listSources(player) {
    var out = [];
    if (player.blitz.length) out.push({ type: 'blitz', index: -1 });
    if (player.wood.up.length) out.push({ type: 'wood', index: -1 });
    for (var i = 0; i < player.posts.length; i++) {
      if (player.posts[i].length) out.push({ type: 'post', index: i });
    }
    return out;
  }

  /* The centre holds several Dutch piles per colour, so two cards of the same
     value (two 1s, say) can open two separate piles instead of stacking.
     A card fits a pile of its own colour when it is exactly one higher than
     that pile's current top (1 → 10, same colour). Returns the pile index,
     or -1 when no pile of that colour is ready for the card. */
  function findDutchPile(game, card) {
    if (!card) return -1;
    for (var i = 0; i < game.dutch.length; i++) {
      var pile = game.dutch[i];
      if (pile.color === card.color && pile.cards.length + 1 === card.value) return i;
    }
    return -1;
  }

  /* A card may go onto a Post pile when it is exactly one lower than the
     pile's active card AND the "boy/girl" gender alternates. An empty Post
     slot accepts any card. */
  function canPlayToPost(card, postPile) {
    if (!card) return false;
    if (!postPile.length) return true;
    var top = postPile[postPile.length - 1];
    return card.value === top.value - 1 &&
      Cards.genderOf(card.color) !== Cards.genderOf(top.color);
  }

  /* All legal moves for one player. */
  function listMoves(game, playerIndex) {
    var player = game.players[playerIndex];
    var sources = listSources(player);
    var moves = [];
    var i, j, src, card;

    /* 1. Moves into the shared Dutch piles. A card can only fit one pile per
       colour, so at most one Dutch move is offered per source. */
    for (i = 0; i < sources.length; i++) {
      src = sources[i];
      card = getSourceCard(player, src);
      var pileIndex = findDutchPile(game, card);
      if (pileIndex >= 0) moves.push({ kind: 'dutch', from: src, to: pileIndex });
    }

    /* 2. Moves between stacks (into a Post pile). */
    for (i = 0; i < sources.length; i++) {
      src = sources[i];
      card = getSourceCard(player, src);
      for (j = 0; j < player.posts.length; j++) {
        if (src.type === 'post' && src.index === j) continue;
        /* Moving a Post card onto an empty slot achieves nothing. */
        if (!player.posts[j].length && src.type === 'post') continue;
        if (canPlayToPost(card, player.posts[j])) {
          moves.push({ kind: 'post', from: src, to: j });
        }
      }
    }

    return moves;
  }

  function hasAnyMove(game, playerIndex) {
    return listMoves(game, playerIndex).length > 0;
  }

  /* True once that player has cleared their whole Blitz pile. */
  function hasBlitzed(game, playerIndex) {
    return game.players[playerIndex].blitz.length === 0;
  }

  global.DBRules = {
    getSourceCard: getSourceCard,
    listSources: listSources,
    findDutchPile: findDutchPile,
    canPlayToPost: canPlayToPost,
    listMoves: listMoves,
    hasAnyMove: hasAnyMove,
    hasBlitzed: hasBlitzed
  };
})(window);
