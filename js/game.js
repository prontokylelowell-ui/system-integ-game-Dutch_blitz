/* =============================================================================
   Dutch Blitz — js/game.js
   The real-time controller. Owns the requestAnimationFrame loop, renders the
   engine state into the DOM, and turns clicks / keys into validated moves.
   ============================================================================= */
(function (global) {
  'use strict';

  var Cards = global.DBCards;
  var Rules = global.DBRules;
  var Engine = global.DBEngine;
  var AI = global.DBAI;

  var STALL_LIMIT = 18000; /* ms without any Dutch-pile progress before the round is called */

  var game = null;
  var bots = [];
  var rafId = null;
  var running = false;
  var countdownTimer = null;
  var lastConfig = { opponents: 3, difficulty: 'normal' };
  var roundStats = { blitzes: 0 };

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { return Cards.el(tag, cls, text); }
  function sound(name) {
    if (global.DBApp && global.DBApp.Sound) global.DBApp.Sound.play(name);
  }

  /* ------------------------------------------------------------------ */
  /* Pile builders                                                       */
  /* ------------------------------------------------------------------ */
  function makePile(cfg) {
    var box = el('div', 'pile' + (cfg.cls ? ' ' + cfg.cls : ''));
    if (cfg.attrs) {
      Object.keys(cfg.attrs).forEach(function (k) { box.setAttribute(k, cfg.attrs[k]); });
    }
    if (cfg.clickable) box.classList.add('is-clickable');

    var cardsHost = el('div', 'pile-cards');
    cfg.build(cardsHost);
    box.appendChild(cardsHost);

    var label = el('div', 'pile-label');
    label.appendChild(el('span', 'pile-title', cfg.label));
    if (cfg.sub) label.appendChild(el('span', 'pile-sub', cfg.sub));
    box.appendChild(label);
    return box;
  }

  /* ------------------------------------------------------------------ */
  /* Rendering                                                           */
  /* ------------------------------------------------------------------ */
  function renderHud() {
    if (!game) return;
    $('hud-round').textContent = 'Round ' + game.round;
    $('hud-target').textContent = 'First to ' + game.targetScore;
    var me = game.players[0];
    $('hud-score').textContent = me.totalScore + ' pts';
    var status = $('hud-status');
    if (game.phase === 'playing') status.textContent = running ? 'Race in progress' : 'Paused';
    else if (game.phase === 'roundOver') status.textContent = 'Round complete';
    else if (game.phase === 'gameOver') status.textContent = 'Game over';
    else status.textContent = 'Get ready';
  }

  function renderDutchRow() {
    var host = $('dutch-row');
    host.innerHTML = '';
    Cards.COLORS.forEach(function (color) {
      var pile = game.dutch[color];
      var box = el('div', 'dutch-pile d-' + color);
      var cardsHost = el('div', 'pile-cards');

      if (pile.length) {
        cardsHost.appendChild(Cards.renderCard(pile[pile.length - 1], {
          size: 'md',
          label: Cards.COLOR_LABEL[color] + ' pile'
        }));
        cardsHost.appendChild(el('span', 'pile-badge', pile.length + '/10'));
        if (pile.length === 10) box.classList.add('is-complete');
      } else {
        cardsHost.appendChild(Cards.renderSlot('1', 'md'));
      }
      box.appendChild(cardsHost);
      box.appendChild(el('div', 'pile-label', Cards.COLOR_LABEL[color]));

      /* progress ticks */
      var ticks = el('div', 'dutch-ticks');
      for (var i = 1; i <= 10; i++) {
        ticks.appendChild(el('span', 'tick' + (i <= pile.length ? ' on' : '')));
      }
      box.appendChild(ticks);

      host.appendChild(box);
    });
  }

  function renderPlayerZone() {
    var host = $('player-piles');
    host.innerHTML = '';
    var player = game.players[0];
    var info = Engine.pileInfo(player);

    /* Wood pile — face down, click to turn over */
    host.appendChild(makePile({
      label: 'Wood',
      sub: info.woodDown ? info.woodDown + ' down' : 'empty',
      clickable: info.woodDown > 0 || info.woodUp > 0,
      cls: 'pile-wood-down',
      attrs: { 'data-flip': '1' },
      build: function (h) {
        if (info.woodDown || info.woodUp) {
          h.appendChild(Cards.renderBack(0, { size: 'lg', count: info.woodDown, interactive: true }));
        } else {
          h.appendChild(Cards.renderSlot('—', 'lg'));
        }
      }
    }));

    /* Wood pile — the face-up card on top is the only playable one */
    host.appendChild(makePile({
      label: 'Turned',
      sub: info.woodUp ? info.woodUp + ' up' : 'none',
      clickable: !!info.woodTop,
      cls: 'pile-wood-up',
      attrs: { 'data-play': 'wood' },
      build: function (h) {
        if (info.woodTop) {
          h.appendChild(Cards.renderCard(info.woodTop, { size: 'lg', playable: true }));
        } else {
          h.appendChild(Cards.renderSlot('—', 'lg'));
        }
      }
    }));

    /* Blitz pile — the top card is face up */
    host.appendChild(makePile({
      label: 'Blitz',
      sub: info.blitz ? info.blitz + ' left' : 'CLEAR',
      clickable: !!info.blitzTop,
      cls: 'pile-blitz',
      attrs: { 'data-play': 'blitz' },
      build: function (h) {
        if (info.blitzTop) {
          h.appendChild(Cards.renderBack(0, { size: 'lg' }));
          h.appendChild(Cards.renderCard(info.blitzTop, { size: 'lg', playable: true }));
        } else {
          h.appendChild(el('div', 'blitz-cleared', 'BLITZ!'));
        }
      }
    }));

    /* Post piles */
    info.posts.forEach(function (post, i) {
      host.appendChild(makePile({
        label: 'Post ' + (i + 1),
        sub: post.count > 1 ? post.count + ' cards' : '',
        clickable: !!post.top,
        cls: 'pile-post',
        attrs: { 'data-play': 'post', 'data-index': String(i) },
        build: function (h) {
          if (post.top) h.appendChild(Cards.renderCard(post.top, { size: 'lg', playable: true }));
          else h.appendChild(Cards.renderSlot('empty', 'lg'));
        }
      }));
    });
  }

  function buildOpponentPanel(player) {
    var info = Engine.pileInfo(player);
    var panel = el('div', 'opponent seat-' + player.index);

    var head = el('div', 'opp-head');
    head.appendChild(Cards.symbolSvg(player.symbol, 'opp-sym'));
    var names = el('div', 'opp-names');
    names.appendChild(el('div', 'opp-name', player.name));
    names.appendChild(el('div', 'opp-score', player.totalScore + ' pts'));
    head.appendChild(names);
    panel.appendChild(head);

    var blitzRow = el('div', 'opp-blitz');
    blitzRow.appendChild(el('span', 'opp-blitz-num', String(info.blitz)));
    blitzRow.appendChild(el('span', 'opp-blitz-label', 'in Blitz pile'));
    panel.appendChild(blitzRow);

    var posts = el('div', 'opp-posts');
    info.posts.forEach(function (post) {
      var cell = el('div', 'opp-post');
      if (post.top) cell.appendChild(Cards.renderCard(post.top, { size: 'sm' }));
      else cell.appendChild(Cards.renderSlot('', 'sm'));
      if (post.count > 1) cell.appendChild(el('span', 'opp-post-count', String(post.count)));
      posts.appendChild(cell);
    });
    panel.appendChild(posts);

    return panel;
  }

  function renderOpponents() {
    var host = $('opponents');
    host.innerHTML = '';
    for (var i = 1; i < game.playerCount; i++) {
      host.appendChild(buildOpponentPanel(game.players[i]));
    }
  }

  function render() {
    if (!game) return;
    renderHud();
    renderOpponents();
    renderDutchRow();
    renderPlayerZone();
    renderHint();
  }

  function renderHint() {
    var hint = $('hint');
    if (!hint) return;
    if (game.phase !== 'playing') { hint.textContent = ''; return; }
    if (!running) { hint.textContent = 'Paused'; return; }
    hint.textContent = 'Click a card to play it · Click your Wood pile (or press Space) to turn cards over';
  }

  /* ------------------------------------------------------------------ */
  /* Overlays                                                            */
  /* ------------------------------------------------------------------ */
  function showOverlay(title, sub, bodyNode, actions) {
    $('overlay-title').textContent = title;
    $('overlay-sub').textContent = sub || '';
    var body = $('overlay-body');
    body.innerHTML = '';
    if (bodyNode) body.appendChild(bodyNode);
    var actionsHost = $('overlay-actions');
    actionsHost.innerHTML = '';
    (actions || []).forEach(function (action) {
      var btn = el('button', 'btn ' + (action.cls || ''), action.label);
      btn.type = 'button';
      btn.addEventListener('click', action.onClick);
      actionsHost.appendChild(btn);
    });
    $('overlay').hidden = false;
  }

  function hideOverlay() { $('overlay').hidden = true; }

  function buildScoreTable() {
    var table = el('table', 'score-table');
    var head = el('tr');
    ['', 'Player', 'To piles', 'Left', 'Round', 'Total'].forEach(function (t) {
      head.appendChild(el('th', '', t));
    });
    table.appendChild(head);

    (game.lastRound || []).forEach(function (row) {
      var tr = el('tr', 'seat-' + row.index);
      var who = el('td', 'score-who');
      who.appendChild(Cards.symbolSvg(game.players[row.index].symbol, 'score-sym'));
      who.appendChild(el('span', '', row.name));
      tr.appendChild(who);
      tr.appendChild(el('td', '', String(row.played)));
      tr.appendChild(el('td', '', String(row.left)));
      tr.appendChild(el('td', row.points >= 0 ? 'pos' : 'neg', (row.points >= 0 ? '+' : '') + row.points));
      tr.appendChild(el('td', 'score-total', String(row.total)));
      table.appendChild(tr);
    });
    return table;
  }

  function showRoundResult() {
    var blitzer = game.blitzer;
    var title, sub;
    if (blitzer != null) {
      title = blitzer === 0 ? 'BLITZ! You cleared your pile' : game.players[blitzer].name + ' blitzed!';
      sub = blitzer === 0 ? 'Nicely raced. Here is how the round scored.' : 'They emptied their Blitz pile first.';
    } else {
      title = 'Round called — everyone stuck';
      sub = 'Nobody could clear their Blitz pile, so the round was scored as it stood.';
    }
    showOverlay(title, sub, buildScoreTable(), [
      { label: 'Next Round', cls: 'btn-primary', onClick: nextRound },
      { label: 'Main Menu', onClick: quitToMenu }
    ]);
  }

  function showGameOver() {
    var youWon = game.winner === 0;
    var title = youWon ? 'You win the game!' : game.players[game.winner].name + ' wins the game';
    var sub = 'Final standings — first to ' + game.targetScore + ' points.';
    showOverlay(title, sub, buildScoreTable(), [
      { label: 'Play Again', cls: 'btn-primary', onClick: function () { hideOverlay(); startNewGame(lastConfig); } },
      { label: 'Main Menu', onClick: quitToMenu }
    ]);
  }

  function showPause() {
    showOverlay('Paused', 'The race is on hold.', null, [
      { label: 'Resume', cls: 'btn-primary', onClick: function () { hideOverlay(); resume(); } },
      { label: 'Restart Round', onClick: function () { hideOverlay(); startRoundNow(); } },
      { label: 'Main Menu', onClick: quitToMenu }
    ]);
  }

  /* Big centred 3-2-1-GO countdown before a round. */
  function runCountdown(done) {
    var host = $('countdown');
    var text = $('countdown-text');
    var steps = ['3', '2', '1', 'GO!'];
    var i = 0;
    host.hidden = false;
    function step() {
      if (i >= steps.length) {
        host.hidden = true;
        done();
        return;
      }
      text.textContent = steps[i];
      text.classList.remove('pop');
      void text.offsetWidth; /* restart the animation */
      text.classList.add('pop');
      sound(i === steps.length - 1 ? 'blitz' : 'tick');
      i++;
      countdownTimer = setTimeout(step, 700);
    }
    step();
  }

  /* ------------------------------------------------------------------ */
  /* Flow control                                                        */
  /* ------------------------------------------------------------------ */
  function startNewGame(config) {
    lastConfig = config || lastConfig;
    var names = ['You'].concat(AI.BOT_NAMES);
    game = Engine.createGame({
      playerCount: lastConfig.opponents + 1,
      names: names,
      targetScore: Engine.CONFIG.TARGET_SCORE
    });
    bots = AI.createBots(game.playerCount, lastConfig.difficulty);
    game.round = 1;
    roundStats.blitzes = 0;
    if (global.DBApp) global.DBApp.showScreen('game');
    startRoundNow();
  }

  function startRoundNow() {
    hideOverlay();
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    if (countdownTimer) clearTimeout(countdownTimer);

    Engine.startRound(game);
    render();

    runCountdown(function () {
      game.progressAt = Date.now();
      AI.arm(bots, Date.now());
      running = true;
      render();
      rafId = requestAnimationFrame(loop);
    });
  }

  function nextRound() {
    hideOverlay();
    game.round += 1;
    startRoundNow();
  }

  function finishRound() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;

    var results = Engine.scoreRound(game);
    if (game.blitzer === 0) roundStats.blitzes++;
    render();

    if (game.phase === 'gameOver') {
      sound(game.winner === 0 ? 'victory' : 'defeat');
      if (global.DBApp) global.DBApp.Storage.recordGame(game, roundStats);
      showGameOver();
    } else {
      sound('roundEnd');
      showRoundResult();
    }
  }

  function quitToMenu() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    if (countdownTimer) clearTimeout(countdownTimer);
    hideOverlay();
    $('countdown').hidden = true;
    game = null;
    if (global.DBApp) global.DBApp.showScreen('menu');
  }

  function pause() {
    if (!game || game.phase !== 'playing' || !running) return;
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    render();
    showPause();
  }

  function resume() {
    if (!game || game.phase !== 'playing') return;
    game.progressAt = Date.now();
    AI.arm(bots, Date.now());
    running = true;
    render();
    rafId = requestAnimationFrame(loop);
  }

  /* ------------------------------------------------------------------ */
  /* The main loop                                                       */
  /* ------------------------------------------------------------------ */
  function loop() {
    if (!running || !game) return;
    var now = Date.now();

    if (game.phase === 'playing') {
      var events = AI.tick(game, bots, now);
      if (events.length) {
        var blitzed = events.some(function (e) { return e.result && e.result.blitz; });
        sound(blitzed ? 'blitz' : 'place');
        render();
      }

      if (game.blitzer != null) { finishRound(); return; }

      if (now - game.progressAt > STALL_LIMIT) { finishRound(); return; }
    }

    rafId = requestAnimationFrame(loop);
  }

  /* ------------------------------------------------------------------ */
  /* Player input                                                        */
  /* ------------------------------------------------------------------ */
  function onPlayerZoneClick(ev) {
    if (!game || game.phase !== 'playing' || !running) return;

    if (ev.target.closest && ev.target.closest('[data-flip]')) {
      doFlip();
      return;
    }
    var playNode = ev.target.closest && ev.target.closest('[data-play]');
    if (!playNode) return;

    var type = playNode.getAttribute('data-play');
    var indexAttr = playNode.getAttribute('data-index');
    doPlay({ type: type, index: indexAttr == null ? -1 : Number(indexAttr) });
  }

  function doFlip() {
    var wood = game.players[0].wood;
    if (!wood.down.length && !wood.up.length) return;
    Engine.flipWood(game, 0);
    sound('flip');
    render();
  }

  function flashInvalid(source) {
    var sel = '[data-play="' + source.type + '"]' +
      (source.type === 'post' ? '[data-index="' + source.index + '"]' : '');
    var node = document.querySelector('#player-piles ' + sel);
    if (node) {
      node.classList.add('shake');
      setTimeout(function () { node.classList.remove('shake'); }, 420);
    }
    sound('error');
  }

  function doPlay(source) {
    var moves = Rules.listMoves(game, 0).filter(function (m) {
      return m.from.type === source.type && m.from.index === source.index;
    });
    if (!moves.length) { flashInvalid(source); return; }

    var chosen = null;
    for (var i = 0; i < moves.length; i++) if (moves[i].kind === 'dutch') { chosen = moves[i]; break; }
    if (!chosen) {
      for (var j = 0; j < moves.length; j++) {
        if (moves[j].kind === 'post' && moves[j].from.type === 'post') { chosen = moves[j]; break; }
      }
    }
    if (!chosen) chosen = moves[0];

    var res = Engine.applyMove(game, 0, chosen);
    if (!res.ok) { flashInvalid(source); return; }
    sound(res.card ? 'place' : 'click');
    render();
    if (res.blitz) finishRound();
  }

  /* ------------------------------------------------------------------ */
  /* Wiring                                                              */
  /* ------------------------------------------------------------------ */
  function bindStaticEvents() {
    $('player-piles').addEventListener('click', onPlayerZoneClick);

    var flipBtn = $('btn-flip');
    if (flipBtn) flipBtn.addEventListener('click', function () {
      if (game && game.phase === 'playing' && running) doFlip();
    });

    var pauseBtn = $('btn-pause');
    if (pauseBtn) pauseBtn.addEventListener('click', pause);

    var soundBtn = $('btn-game-sound');
    if (soundBtn) soundBtn.addEventListener('click', function () {
      if (global.DBApp) global.DBApp.toggleSound(soundBtn);
    });

    document.addEventListener('keydown', function (ev) {
      if (!game) return;
      if (ev.code === 'Space') {
        ev.preventDefault();
        if (game.phase === 'playing' && running) doFlip();
      } else if (ev.key === 'Escape') {
        if (running) pause();
        else if (game.phase === 'playing' && !$('overlay').hidden) { hideOverlay(); resume(); }
      }
    });
  }

  function init() {
    bindStaticEvents();
  }

  global.DBGame = {
    init: init,
    startNewGame: startNewGame,
    quitToMenu: quitToMenu,
    isActive: function () { return !!game; }
  };
})(window);
