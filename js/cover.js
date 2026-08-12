(function () {
  'use strict';

  const els = {
    cover: document.getElementById('cover'),
    btnPvp: document.getElementById('btnPvp'),
    btnVsAi: document.getElementById('btnVsAi'),
    btnNet: document.getElementById('btnNet'),
    aiConfig: document.getElementById('aiConfig'),
    netPanel: document.getElementById('netPanel'),
    netServerInput: document.getElementById('netServerInput'),
    netRoomRow: document.getElementById('netRoomRow'),
    netRoomInput: document.getElementById('netRoomInput'),
    netSeats: document.getElementById('netSeats'),
    netStatus: document.getElementById('netStatus'),
    netActions: document.getElementById('netActions'),
    netWaitingActions: document.getElementById('netWaitingActions'),
    netSpecActions: document.getElementById('netSpecActions'),
    btnNetCreate: document.getElementById('btnNetCreate'),
    btnNetJoin: document.getElementById('btnNetJoin'),
    btnNetReady: document.getElementById('btnNetReady'),
    btnNetCopy: document.getElementById('btnNetCopy'),
    btnNetLeave: document.getElementById('btnNetLeave'),
    btnNetSpecLeave: document.getElementById('btnNetSpecLeave'),
    btnNetBack: document.getElementById('btnNetBack'),
    segDifficulty: document.getElementById('segDifficulty'),
    segSide: document.getElementById('segSide'),
    btnAiStart: document.getElementById('btnAiStart'),
    btnAiBack: document.getElementById('btnAiBack'),
    btnSettings: document.getElementById('btnSettings'),
    settingsPanel: document.getElementById('settingsPanel'),
    segAuto: document.getElementById('segAuto'),
    sliderInterval: document.getElementById('sliderInterval'),
    intervalVal: document.getElementById('intervalVal'),
    sliderDuration: document.getElementById('sliderDuration'),
    durationVal: document.getElementById('durationVal'),
    segPieceFx: document.getElementById('segPieceFx'),
    segBoardFx: document.getElementById('segBoardFx'),
    segConnLines: document.getElementById('segConnLines'),
    btnSettingsClose: document.getElementById('btnSettingsClose')
  };

  let callbacks = { start: function () {} };
  const selected = { difficulty: 'easy', humanSide: 0 };

  function bindSeg(el, onPick) {
    const btns = el.querySelectorAll('button');
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        btns.forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        onPick(b.dataset.value);
        window.SFX.click();
      });
    });
  }

  function setSegByValue(el, value) {
    const btns = el.querySelectorAll('button');
    btns.forEach(function (b) {
      b.classList.toggle('active', b.dataset.value === String(value));
    });
  }

  function setConfigVisible(v) {
    els.aiConfig.classList.toggle('hidden', !v);
  }

  function setSettingsVisible(v) {
    els.settingsPanel.classList.toggle('hidden', !v);
  }

  var DEFAULT_SERVER = 'wss://lj.2111803140.workers.dev';

  function setNetVisible(v) {
    els.netPanel.classList.toggle('hidden', !v);
    if (v) {
      if (!els.netServerInput.value) {
        var saved = localStorage.getItem('gmx_server');
        els.netServerInput.value = saved || DEFAULT_SERVER;
      }
    }
  }

  function syncSettingsUI() {
    const s = window.GC.settings;
    els.segAuto.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('active', b.dataset.value === (s.auto ? '1' : '0'));
    });
    els.sliderInterval.value = String(s.interval);
    els.intervalVal.textContent = s.interval + ' 秒';
    els.sliderDuration.value = String(s.duration);
    els.durationVal.textContent = s.duration.toFixed(1) + ' 秒';
    setSegByValue(els.segPieceFx, s.pieceFx ? '1' : '0');
    setSegByValue(els.segBoardFx, s.boardFx ? '1' : '0');
    setSegByValue(els.segConnLines, s.connLines ? '1' : '0');
  }

  var netMode = 'init'; // init | joining
  var currentRoom = null;
  var mySide = 0;
  var myReady = false;
  var seatsData = [];
  var specCount = 0;

  function resetNetPanel() {
    netMode = 'init';
    currentRoom = null;
    mySide = 0;
    myReady = false;
    seatsData = [];
    specCount = 0;
    els.netSeats.style.display = 'none';
    els.netSeats.textContent = '';
    els.netStatus.textContent = '';
    els.netActions.style.display = '';
    els.netWaitingActions.style.display = 'none';
    els.netSpecActions.style.display = 'none';
    els.netRoomRow.style.display = 'none';
    els.netRoomInput.value = '';
    els.btnNetJoin.textContent = '🚪 加入房间';
    els.btnNetReady.textContent = '✅ 准备';
  }

  function renderSeats() {
    if (seatsData.length === 0) {
      els.netSeats.style.display = 'none';
      return;
    }
    els.netSeats.style.display = '';
    var parts = [];
    seatsData.forEach(function (s) {
      var label = s.side === 1 ? '⚫ 黑方' : '⚪ 白方';
      var status = s.ready ? ' ✓已准备' : ' ⏳未准备';
      parts.push(label + status);
    });
    if (specCount > 0) {
      parts.push('👁 观战 ×' + specCount);
    }
    els.netSeats.textContent = parts.join(' ｜ ');
  }

  function updateNetUI(state, room, side, extra) {
    extra = extra || {};
    seatsData = extra.seats || [];
    specCount = extra.specCount || 0;

    if (state === 'connecting') {
      els.netStatus.textContent = '⏳ 连接中…';
      els.netActions.style.display = 'none';
      els.netWaitingActions.style.display = 'none';
      els.netSpecActions.style.display = 'none';
      els.netRoomRow.style.display = 'none';
      els.netSeats.style.display = 'none';
    } else if (state === 'waiting') {
      currentRoom = room;
      mySide = side;
      myReady = extra.ready || false;
      renderSeats();
      els.btnNetReady.textContent = myReady ? '❌ 取消准备' : '✅ 准备';
      els.netStatus.textContent = '🏠 房间号: ' + room;
      els.netActions.style.display = 'none';
      els.netWaitingActions.style.display = '';
      els.netSpecActions.style.display = 'none';
      els.netRoomRow.style.display = 'none';
    } else if (state === 'playing') {
      currentRoom = room;
      mySide = side;
      // 游戏开始：自动隐藏联机面板进入对局
      setNetVisible(false);
      callbacks.start({ mode: 'net', netSide: side, room: room });
    } else if (state === 'spectating') {
      currentRoom = room;
      mySide = 0;
      specCount = specCount;
      renderSeats();
      els.netStatus.textContent = '🏠 房间号: ' + room + ' — 👁 观战中';
      els.netActions.style.display = 'none';
      els.netWaitingActions.style.display = 'none';
      els.netSpecActions.style.display = '';
      els.netRoomRow.style.display = 'none';
      // 观战也自动进入对局
      callbacks.start({ mode: 'net', netSide: 0, room: room });
    } else if (state === 'idle') {
      if (currentRoom) {
        els.netStatus.textContent = '⚠️ 连接断开';
      }
      resetNetPanel();
    }
  }

  function onSeatsUpdate(seats, myS) {
    seatsData = seats;
    mySide = myS;
    renderSeats();
  }

  function onSpecUpdate(count) {
    specCount = count;
    renderSeats();
  }

  window.Cover = {
    init: function (cb) {
      callbacks = cb || callbacks;
      els.btnPvp.addEventListener('click', function () {
        window.SFX.click();
        callbacks.start({ mode: 'pvp' });
      });
      els.btnVsAi.addEventListener('click', function () {
        window.SFX.click();
        setConfigVisible(true);
      });
      els.btnNet.addEventListener('click', function () {
        window.SFX.click();
        setConfigVisible(false);
        resetNetPanel();
        setNetVisible(true);
      });
      els.btnNetBack.addEventListener('click', function () {
        window.SFX.click();
        window.NetPlay.leave();
        setNetVisible(false);
        resetNetPanel();
      });
      els.btnNetCreate.addEventListener('click', function () {
        window.SFX.click();
        var serverUrl = els.netServerInput.value.trim() || DEFAULT_SERVER;
        localStorage.setItem('gmx_server', serverUrl);
        window.NetPlay.createRoom(serverUrl);
      });
      els.btnNetJoin.addEventListener('click', function () {
        window.SFX.click();
        if (netMode === 'init') {
          netMode = 'joining';
          els.netRoomRow.style.display = '';
          els.btnNetJoin.textContent = '✅ 确认加入';
          els.netRoomInput.focus();
        } else {
          var code = els.netRoomInput.value.trim().toUpperCase();
          if (!code) { els.netStatus.textContent = '⚠️ 请输入房间号'; return; }
          var serverUrl = els.netServerInput.value.trim() || DEFAULT_SERVER;
          localStorage.setItem('gmx_server', serverUrl);
          window.NetPlay.joinRoom(serverUrl, code);
        }
      });
      els.btnNetReady.addEventListener('click', function () {
        window.SFX.click();
        var newReady = !myReady;
        myReady = newReady;
        els.btnNetReady.textContent = myReady ? '❌ 取消准备' : '✅ 准备';
        window.NetPlay.sendReady(newReady);
      });
      els.btnNetCopy.addEventListener('click', function () {
        if (currentRoom) {
          navigator.clipboard.writeText(currentRoom).then(function () {
            els.netStatus.textContent = '📋 已复制房间号: ' + currentRoom;
          }).catch(function () {
            els.netStatus.textContent = '📋 房间号: ' + currentRoom + ' (长按复制)';
          });
        }
      });
      els.btnNetLeave.addEventListener('click', function () {
        window.SFX.click();
        window.NetPlay.leave();
        resetNetPanel();
        setNetVisible(false);
      });
      els.btnNetSpecLeave.addEventListener('click', function () {
        window.SFX.click();
        window.NetPlay.leave();
        resetNetPanel();
        setNetVisible(false);
      });
      els.btnAiBack.addEventListener('click', function () {
        window.SFX.click();
        setConfigVisible(false);
      });
      els.btnSettings.addEventListener('click', function () {
        window.SFX.click();
        setConfigVisible(false);
        setSettingsVisible(els.settingsPanel.classList.contains('hidden'));
        syncSettingsUI();
      });
      els.btnSettingsClose.addEventListener('click', function () {
        window.SFX.click();
        setSettingsVisible(false);
      });
      els.btnAiStart.addEventListener('click', function () {
        window.SFX.click();
        callbacks.start({
          mode: 'ai',
          difficulty: selected.difficulty,
          humanSide: selected.humanSide
        });
      });
      bindSeg(els.segDifficulty, function (v) { selected.difficulty = v; });
      bindSeg(els.segSide, function (v) { selected.humanSide = parseInt(v, 10); });
      bindSeg(els.segAuto, function (v) {
        window.GC.settings.auto = v === '1';
        window.GC.saveSettings();
        if (window.Gomoku && window.Gomoku.refreshAutoChip) window.Gomoku.refreshAutoChip();
      });
      bindSeg(els.segPieceFx, function (v) {
        window.GC.settings.pieceFx = v === '1';
        window.GC.saveSettings();
      });
      bindSeg(els.segBoardFx, function (v) {
        window.GC.settings.boardFx = v === '1';
        window.GC.saveSettings();
      });
      els.sliderInterval.addEventListener('input', function () {
        window.GC.settings.interval = parseInt(els.sliderInterval.value, 10);
        els.intervalVal.textContent = window.GC.settings.interval + ' 秒';
        window.GC.saveSettings();
      });
      els.sliderDuration.addEventListener('input', function () {
        window.GC.settings.duration = parseFloat(els.sliderDuration.value);
        els.durationVal.textContent = window.GC.settings.duration.toFixed(1) + ' 秒';
        window.GC.saveSettings();
      });

      // 绑定 NetPlay 回调
      window.NetPlay.on('onState', updateNetUI);
      window.NetPlay.on('onSeatsUpdate', onSeatsUpdate);
      window.NetPlay.on('onSpecUpdate', onSpecUpdate);
    },
    show: function () {
      setConfigVisible(false);
      setSettingsVisible(false);
      setNetVisible(false);
      resetNetPanel();
      syncSettingsUI();
      els.cover.classList.remove('hidden');
    },
    hide: function () {
      els.cover.classList.add('hidden');
    }
  };
})();
