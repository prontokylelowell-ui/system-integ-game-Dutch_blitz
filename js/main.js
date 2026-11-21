/* =============================================================================
   Dutch Blitz — js/main.js
   Application shell: saved settings & statistics, synthesised sound effects,
   screen switching, and the main-menu wiring.
   ============================================================================= */
(function (global) {
  'use strict';

  var SETTINGS_KEY = 'dutch-blitz:settings';
  var STATS_KEY = 'dutch-blitz:stats';

  var DEFAULT_SETTINGS = { difficulty: 'normal', opponents: 3, sound: true };
  var DEFAULT_STATS = { games: 0, wins: 0, blitzes: 0, bestScore: 0, rounds: 0 };

  function $(id) { return document.getElementById(id); }

  /* ------------------------------------------------------------------ */
  /* LocalStorage                                                        */
  /* ------------------------------------------------------------------ */
  function readJSON(key, fallback) {
    try {
      var raw = global.localStorage.getItem(key);
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch (err) {
      return fallback;
    }
  }
  function writeJSON(key, value) {
    try { global.localStorage.setItem(key, JSON.stringify(value)); } catch (err) { /* ignore */ }
  }

  var settings = Object.assign({}, DEFAULT_SETTINGS, readJSON(SETTINGS_KEY, {}));

  var Storage = {
    getSettings: function () { return settings; },
    saveSettings: function () {
      writeJSON(SETTINGS_KEY, settings);
      refreshSoundButtons();
    },
    getStats: function () { return Object.assign({}, DEFAULT_STATS, readJSON(STATS_KEY, {})); },
    recordGame: function (g, extras) {
      var stats = Storage.getStats();
      stats.games += 1;
      if (g.winner === 0) stats.wins += 1;
      stats.blitzes += (extras && extras.blitzes) || 0;
      var myScore = g.players[0].totalScore;
      if (myScore > stats.bestScore) stats.bestScore = myScore;
      stats.rounds += g.round;
      writeJSON(STATS_KEY, stats);
      renderStats();
    },
    resetStats: function () {
      writeJSON(STATS_KEY, DEFAULT_STATS);
      renderStats();
    }
  };

  /* ------------------------------------------------------------------ */
  /* Sound — synthesised with the Web Audio API (no asset files)         */
  /* ------------------------------------------------------------------ */
  var Sound = (function () {
    var ctx = null;

    function ensure() {
      if (!ctx) {
        var AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) return null;
        try { ctx = new AC(); } catch (err) { return null; }
      }
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
      return ctx;
    }

    /* A preset is a list of tones: { f=Hz, t=start offset s, d=duration s,
       type=waveform, g=peak gain } */
    var PRESETS = {
      click:    [{ f: 520, t: 0, d: 0.05, type: 'triangle', g: 0.05 }],
      tick:     [{ f: 900, t: 0, d: 0.05, type: 'sine', g: 0.05 }],
      place:    [{ f: 640, t: 0, d: 0.06, type: 'triangle', g: 0.07 },
                 { f: 960, t: 0.05, d: 0.06, type: 'triangle', g: 0.05 }],
      flip:     [{ f: 300, t: 0, d: 0.07, type: 'sawtooth', g: 0.045 }],
      error:    [{ f: 180, t: 0, d: 0.15, type: 'square', g: 0.05 }],
      blitz:    [{ f: 523, t: 0, d: 0.14, type: 'triangle', g: 0.08 },
                 { f: 659, t: 0.04, d: 0.14, type: 'triangle', g: 0.08 },
                 { f: 784, t: 0.08, d: 0.2, type: 'triangle', g: 0.09 }],
      roundEnd: [{ f: 523, t: 0, d: 0.12, type: 'sine', g: 0.07 },
                 { f: 659, t: 0.1, d: 0.16, type: 'sine', g: 0.07 }],
      victory:  [{ f: 523, t: 0, d: 0.12, type: 'triangle', g: 0.08 },
                 { f: 659, t: 0.12, d: 0.12, type: 'triangle', g: 0.08 },
                 { f: 784, t: 0.24, d: 0.12, type: 'triangle', g: 0.08 },
                 { f: 1047, t: 0.36, d: 0.28, type: 'triangle', g: 0.09 }],
      defeat:   [{ f: 392, t: 0, d: 0.16, type: 'sine', g: 0.07 },
                 { f: 330, t: 0.16, d: 0.16, type: 'sine', g: 0.07 },
                 { f: 262, t: 0.32, d: 0.3, type: 'sine', g: 0.07 }]
    };

    function play(name) {
      if (!settings.sound) return;
      var preset = PRESETS[name];
      if (!preset) return;
      var ac = ensure();
      if (!ac) return;
      var now = ac.currentTime;
      preset.forEach(function (note) {
        var osc = ac.createOscillator();
        var gain = ac.createGain();
        osc.type = note.type || 'sine';
        osc.frequency.value = note.f;
        var start = now + (note.t || 0);
        var dur = note.d || 0.1;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(note.g || 0.06, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        osc.connect(gain);
        gain.connect(ac.destination);
        osc.start(start);
        osc.stop(start + dur + 0.02);
      });
    }

    return { play: play, ensure: ensure };
  })();

  /* ------------------------------------------------------------------ */
  /* Screens & modals                                                    */
  /* ------------------------------------------------------------------ */
  function showScreen(name) {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) {
      screens[i].classList.toggle('is-active', screens[i].getAttribute('data-screen') === name);
    }
    global.document.body.setAttribute('data-screen', name);
  }

  function openModal(id) {
    var m = $(id);
    if (m) { m.hidden = false; m.classList.add('is-open'); }
  }
  function closeModal(id) {
    var m = $(id);
    if (m) { m.hidden = true; m.classList.remove('is-open'); }
  }

  /* ------------------------------------------------------------------ */
  /* Menu rendering                                                      */
  /* ------------------------------------------------------------------ */
  function statChip(label, value) {
    var chip = global.DBCards.el('div', 'stat-chip');
    chip.appendChild(global.DBCards.el('span', 'stat-value', String(value)));
    chip.appendChild(global.DBCards.el('span', 'stat-label', label));
    return chip;
  }

  function renderStats() {
    var host = $('menu-stats');
    if (!host) return;
    var stats = Storage.getStats();
    host.innerHTML = '';
    host.appendChild(statChip('Games', stats.games));
    host.appendChild(statChip('Wins', stats.wins));
    host.appendChild(statChip('Blitzes', stats.blitzes));
    host.appendChild(statChip('Best score', stats.bestScore));
  }

  function refreshSoundButtons() {
    ['toggle-sound', 'btn-game-sound'].forEach(function (id) {
      var btn = $(id);
      if (!btn) return;
      btn.classList.toggle('is-on', !!settings.sound);
      btn.classList.toggle('is-off', !settings.sound);
      btn.setAttribute('aria-pressed', settings.sound ? 'true' : 'false');
      var label = btn.querySelector('.toggle-label');
      if (label) label.textContent = settings.sound ? 'Sound on' : 'Sound off';
    });
  }

  function toggleSound() {
    settings.sound = !settings.sound;
    Storage.saveSettings();
    if (settings.sound) Sound.play('click');
  }

  /* ------------------------------------------------------------------ */
  /* Menu wiring                                                         */
  /* ------------------------------------------------------------------ */
  function syncSettingsUI() {
    var diff = $('select-difficulty');
    if (diff) diff.value = settings.difficulty;
    var opp = $('select-opponents');
    if (opp) opp.value = String(settings.opponents);
    refreshSoundButtons();
  }

  function initMenu() {
    $('btn-play').addEventListener('click', function () {
      Sound.ensure();
      Sound.play('click');
      global.DBGame.startNewGame({
        opponents: Number(settings.opponents) || 3,
        difficulty: settings.difficulty
      });
    });

    $('btn-how').addEventListener('click', function () { Sound.play('click'); openModal('modal-how'); });
    $('btn-settings').addEventListener('click', function () { Sound.play('click'); syncSettingsUI(); openModal('modal-settings'); });

    document.querySelectorAll('[data-close]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        Sound.play('click');
        closeModal(btn.getAttribute('data-close'));
      });
    });

    document.querySelectorAll('.modal').forEach(function (modal) {
      modal.addEventListener('click', function (ev) {
        if (ev.target === modal) closeModal(modal.id);
      });
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape') return;
      document.querySelectorAll('.modal.is-open').forEach(function (m) { closeModal(m.id); });
    });

    $('toggle-sound').addEventListener('click', toggleSound);

    $('select-difficulty').addEventListener('change', function (ev) {
      settings.difficulty = ev.target.value;
      Storage.saveSettings();
      Sound.play('click');
    });

    $('select-opponents').addEventListener('change', function (ev) {
      settings.opponents = Number(ev.target.value);
      Storage.saveSettings();
      Sound.play('click');
    });

    $('btn-reset-stats').addEventListener('click', function () {
      Storage.resetStats();
      Sound.play('click');
    });
  }

  /* ------------------------------------------------------------------ */
  /* Bootstrap                                                           */
  /* ------------------------------------------------------------------ */
  function renderBrandSymbols() {
    var host = $('brand-symbols');
    if (!host || host.childNodes.length) return;
    global.DBCards.SEATS.forEach(function (seat) {
      host.appendChild(global.DBCards.symbolSvg(seat.symbol, 'brand-sym'));
    });
  }

  function boot() {
    global.DBGame.init();
    initMenu();
    syncSettingsUI();
    renderStats();
    renderBrandSymbols();
    showScreen('menu');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  global.DBApp = {
    Storage: Storage,
    Sound: Sound,
    showScreen: showScreen,
    openModal: openModal,
    closeModal: closeModal,
    toggleSound: function () { toggleSound(); },
    renderStats: renderStats
  };
})(window);
