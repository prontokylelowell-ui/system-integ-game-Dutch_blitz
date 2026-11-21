/* =============================================================================
   Dutch Blitz — js/ai.js
   A rule-based opponent. No machine learning, no network calls: each bot
   looks at the moves that are legal right now, ranks them, and plays the
   best one on a timer so the human can follow the race.
   ============================================================================= */
(function (global) {
  'use strict';

  var Rules = global.DBRules;
  var Engine = global.DBEngine;

  /* Difficulty tuning. `interval` is the delay between a bot's actions,
     `jitter` adds human-like irregularity, `hesitate` is the chance a bot
     pauses for a beat before its next move. */
  var PROFILES = {
    easy:   { interval: 1050, jitter: 420, hesitate: 0.24 },
    normal: { interval: 720,  jitter: 260, hesitate: 0.09 },
    hard:   { interval: 470,  jitter: 150, hesitate: 0.02 }
  };

  var BOT_NAMES = ['Pieter', 'Anika', 'Willem'];

  function profileFor(difficulty) {
    return PROFILES[difficulty] || PROFILES.normal;
  }

  function createBots(playerCount, difficulty) {
    var profile = profileFor(difficulty);
    var bots = [];
    for (var i = 1; i < playerCount; i++) {
      bots.push({
        index: i,
        name: BOT_NAMES[(i - 1) % BOT_NAMES.length],
        profile: profile,
        /* A little per-bot spread so opponents never move in lockstep. */
        interval: Math.round(profile.interval * (0.82 + Math.random() * 0.36)),
        nextAt: 0
      });
    }
    return bots;
  }

  function arm(bots, now) {
    bots.forEach(function (bot) {
      bot.nextAt = now + bot.interval * (0.6 + Math.random() * 0.8);
    });
  }

  /* Rank a candidate move. Higher is better. */
  function scoreMove(game, playerIndex, move) {
    var player = game.players[playerIndex];
    var card = Rules.getSourceCard(player, move.from);
    var score;

    if (move.kind === 'dutch') {
      score = 100;
      if (move.from.type === 'blitz') score += 60;        /* direct Blitz progress */
      else if (move.from.type === 'wood') score += 25;
      else score += 12;
      if (card.value === 1) score += 8;                   /* opens a fresh pile  */
    } else {
      score = 30;
      if (move.from.type === 'post') score += 14;         /* frees a Post pile   */
      else if (move.from.type === 'blitz') score += 6;
      else score += 4;
      if (!player.posts[move.to].length) score -= 26;     /* avoid pointless dumps */
      score += (10 - card.value);                         /* keep piles workable  */
    }
    return score;
  }

  function chooseMove(game, playerIndex) {
    var moves = Rules.listMoves(game, playerIndex);
    if (!moves.length) return null;
    var best = null;
    var bestScore = -Infinity;
    for (var i = 0; i < moves.length; i++) {
      var s = scoreMove(game, playerIndex, moves[i]) + Math.random() * 3;
      if (s > bestScore) { bestScore = s; best = moves[i]; }
    }
    return best;
  }

  /* Perform exactly one action for a bot: the best legal move if there is
     one, otherwise turn over the Wood pile. */
  function act(game, playerIndex) {
    var move = chooseMove(game, playerIndex);
    if (move) {
      var res = Engine.applyMove(game, playerIndex, move);
      if (res.ok) return res;
    }
    Engine.flipWood(game, playerIndex);
    return { ok: true, card: null, blitz: false };
  }

  /* Advance every bot whose timer has elapsed. Returns the list of actions
     taken this frame so the controller knows whether to re-render. */
  function tick(game, bots, now) {
    var events = [];
    for (var i = 0; i < bots.length; i++) {
      var bot = bots[i];
      if (now < bot.nextAt) continue;

      var delay = bot.interval + Math.random() * bot.profile.jitter;
      if (Math.random() < bot.profile.hesitate) {
        bot.nextAt = now + delay * 1.5;
        continue;
      }

      var res = act(game, bot.index);
      bot.nextAt = now + delay;
      events.push({ bot: bot.index, result: res });
      if (game.phase !== 'playing') break;
    }
    return events;
  }

  global.DBAI = {
    PROFILES: PROFILES,
    BOT_NAMES: BOT_NAMES,
    createBots: createBots,
    arm: arm,
    chooseMove: chooseMove,
    scoreMove: scoreMove,
    act: act,
    tick: tick
  };
})(window);
