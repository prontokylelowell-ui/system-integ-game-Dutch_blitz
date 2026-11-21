/* =============================================================================
   Dutch Blitz — js/engine.js
   The authoritative game state and every state transition. No DOM access
   happens here — the controller renders whatever this module produces.
   ============================================================================= */
(function (global) {
  'use strict';

  var Cards = global.DBCards;
  var Rules = global.DBRules;

  var CONFIG = {
    BLITZ_SIZE: 10,      /* cards in the Blitz pile            */
    POST_COUNT: 3,       /* Post piles per player              */
    WOOD_FLIP: 3,        /* cards turned over at a time        */
    TARGET_SCORE: 75,    /* first player to reach this wins    */
    MAX_PLAYERS: 4
  };

  function emptyDutch() {
    return { red: [], blue: [], green: [], yellow: [] };
  }

  function makePlayer(index, name, isHuman) {
    return {
      index: index,
      name: name,
      isHuman: !!isHuman,
      symbol: Cards.SEATS[index].symbol,
      totalScore: 0,
      roundScore: 0,
      roundPlayed: 0,
      roundLeft: 0,
      blitz: [],
      posts: [[], [], []],
      wood: { down: [], up: [] }
    };
  }

  function createGame(options) {
    options = options || {};
    var count = Math.min(options.playerCount || 2, CONFIG.MAX_PLAYERS);
    var names = options.names || [];
    var players = [];
    for (var i = 0; i < count; i++) {
      players.push(makePlayer(i, names[i] || ('Player ' + (i + 1)), i === 0));
    }
    return {
      playerCount: count,
      targetScore: options.targetScore || CONFIG.TARGET_SCORE,
      round: 1,
      players: players,
      dutch: emptyDutch(),
      phase: 'idle',        /* idle | countdown | playing | roundOver | gameOver */
      blitzer: null,
      lastRound: null,
      winner: null,
      progressAt: 0
    };
  }

  /* Deal a fresh round to everybody. */
  function startRound(game) {
    game.dutch = emptyDutch();
    game.blitzer = null;
    game.lastRound = null;
    game.phase = 'playing';

    game.players.forEach(function (player) {
      var deck = Cards.shuffle(Cards.createDeck(player.index));
      player.blitz = deck.slice(0, CONFIG.BLITZ_SIZE);
      player.posts = [
        [deck[CONFIG.BLITZ_SIZE]],
        [deck[CONFIG.BLITZ_SIZE + 1]],
        [deck[CONFIG.BLITZ_SIZE + 2]]
      ];
      player.wood = { down: deck.slice(CONFIG.BLITZ_SIZE + CONFIG.POST_COUNT), up: [] };
      player.roundScore = 0;
      player.roundPlayed = 0;
      player.roundLeft = 0;
    });

    return game;
  }

  /* Turn over the next cards of a Wood pile. When the face-down stack runs
     out the face-up cards are gathered and turned over as a fresh stack. */
  function flipWood(game, playerIndex) {
    var wood = game.players[playerIndex].wood;
    if (!wood.down.length && wood.up.length) {
      wood.down = wood.up.slice().reverse();
      wood.up = [];
    }
    var turned = 0;
    while (turned < CONFIG.WOOD_FLIP && wood.down.length) {
      wood.up.push(wood.down.pop());
      turned++;
    }
    return turned;
  }

  function removeFromSource(game, playerIndex, source) {
    var player = game.players[playerIndex];
    if (source.type === 'blitz') return player.blitz.pop();
    if (source.type === 'wood') return player.wood.up.pop();
    if (source.type === 'post') return player.posts[source.index].pop();
    return null;
  }

  /* Apply a validated move. Returns { ok, card, blitz } — `blitz` is true when
     the move emptied the player's Blitz pile and ended the round. */
  function applyMove(game, playerIndex, move) {
    if (game.phase !== 'playing') return { ok: false, card: null, blitz: false };
    var player = game.players[playerIndex];
    var card = Rules.getSourceCard(player, move.from);
    if (!card) return { ok: false, card: null, blitz: false };

    if (move.kind === 'dutch') {
      if (!Rules.canPlayToDutch(game, card)) return { ok: false, card: null, blitz: false };
      removeFromSource(game, playerIndex, move.from);
      game.dutch[card.color].push(card);
      game.progressAt = Date.now();

      if (move.from.type === 'blitz' && player.blitz.length === 0) {
        game.blitzer = playerIndex;
        game.phase = 'roundOver';
        return { ok: true, card: card, blitz: true };
      }
      return { ok: true, card: card, blitz: false };
    }

    if (move.kind === 'post') {
      if (move.from.type === 'post' && move.from.index === move.to) {
        return { ok: false, card: null, blitz: false };
      }
      if (!Rules.canPlayToPost(card, player.posts[move.to])) {
        return { ok: false, card: null, blitz: false };
      }
      removeFromSource(game, playerIndex, move.from);
      player.posts[move.to].push(card);
      return { ok: true, card: card, blitz: false };
    }

    return { ok: false, card: null, blitz: false };
  }

  /* Count how many of a player's own cards made it into the Dutch piles. */
  function cardsOnDutch(game, playerIndex) {
    var total = 0;
    Cards.COLORS.forEach(function (color) {
      game.dutch[color].forEach(function (card) {
        if (card.owner === playerIndex) total++;
      });
    });
    return total;
  }

  /* Score the finished round: +1 per card played to the Dutch piles,
     -2 per card still stuck in the Blitz pile. */
  function scoreRound(game) {
    var results = game.players.map(function (player) {
      var played = cardsOnDutch(game, player.index);
      var left = player.blitz.length;
      var points = played - 2 * left;
      player.roundPlayed = played;
      player.roundLeft = left;
      player.roundScore = points;
      player.totalScore += points;
      return {
        index: player.index,
        name: player.name,
        played: played,
        left: left,
        points: points,
        total: player.totalScore
      };
    });

    game.lastRound = results;

    var best = -Infinity;
    var winner = null;
    results.forEach(function (r) {
      if (r.total > best) { best = r.total; winner = r.index; }
    });

    if (best >= game.targetScore) {
      game.winner = winner;
      game.phase = 'gameOver';
    } else {
      game.phase = 'roundOver';
    }
    return results;
  }

  /* Snapshot helpers used by the renderer. */
  function pileInfo(player) {
    return {
      blitz: player.blitz.length,
      blitzTop: player.blitz.length ? player.blitz[player.blitz.length - 1] : null,
      woodDown: player.wood.down.length,
      woodUp: player.wood.up.length,
      woodTop: player.wood.up.length ? player.wood.up[player.wood.up.length - 1] : null,
      posts: player.posts.map(function (pile) {
        return {
          count: pile.length,
          top: pile.length ? pile[pile.length - 1] : null
        };
      })
    };
  }

  global.DBEngine = {
    CONFIG: CONFIG,
    createGame: createGame,
    startRound: startRound,
    flipWood: flipWood,
    applyMove: applyMove,
    cardsOnDutch: cardsOnDutch,
    scoreRound: scoreRound,
    pileInfo: pileInfo
  };
})(window);
