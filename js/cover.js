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
    netStatus: document.getElementById('netStatus'),
    netActions: document.getElementById('netActions'),
    netJoinedActions: document.getElementById('netJoinedActions'),
    btnNetCreate: document.getElementById('btnNetCreate'),
    btnNetJoin: document.getElementById('btnNetJoin'),
    btnNetCopy: document.getElementById('btnNetCopy'),
    btnNetLeave: document.getElementById('btnNetLeave'),
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
      // 自动填入服务器地址：优先已保存的地址 → Worker 默认地址
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

  function resetNetPanel() {
    netMode = 'init';
    currentRoom = null;
    els.netStatus.textContent = '';
    els.netActions.style.display = '';
    els.netJoinedActions.style.display = 'none';
    els.netRoomRow.style.display = 'none';
    els.netRoomInput.value = '';
    els.btnNetJoin.textContent = '🚪 加入房间';
  }

  function updateNetUI(state, room, mySide) {
    // state from NetPlay: idle | connecting | waiting | playing
    if (state === 'connecting') {
      els.netStatus.textContent = '⏳ 连接中…';
      els.netActions.style.display = 'none';
      els.netJoinedActions.style.display = 'none';
      els.netRoomRow.style.display = 'none';
    } else if (state === 'waiting') {
      currentRoom = room;
      els.netStatus.textContent = '🏠 房间号: ' + room + ' — 等待对手加入…';
      els.netActions.style.display = 'none';
      els.netJoinedActions.style.display = '';
      els.netRoomRow.style.display = 'none';
    } else if (state === 'playing') {
      currentRoom = room;
      els.netStatus.textContent = '🎮 对局中 — ' + (mySide === 1 ? '黑方(你先手)' : '白方(你后手)');
      els.netActions.style.display = 'none';
      els.netJoinedActions.style.display = '';
      els.netRoomRow.style.display = 'none';
      // 自动开始游戏
      setNetVisible(false);
      callbacks.start({ mode: 'net', netSide: mySide, room: room });
    } else if (state === 'idle') {
      if (currentRoom) {
        els.netStatus.textContent = '⚠️ 连接断开';
      }
      resetNetPanel();
    }
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
          // 第一次点击：显示房间号输入框
          netMode = 'joining';
          els.netRoomRow.style.display = '';
          els.btnNetJoin.textContent = '✅ 确认加入';
          els.netRoomInput.focus();
        } else {
          // 第二次点击：连接并加入
          var code = els.netRoomInput.value.trim().toUpperCase();
          if (!code) { els.netStatus.textContent = '⚠️ 请输入房间号'; return; }
          var serverUrl = els.netServerInput.value.trim() || DEFAULT_SERVER;
          localStorage.setItem('gmx_server', serverUrl);
          window.NetPlay.joinRoom(serverUrl, code);
        }
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
      bindSeg(els.segDifficulty, function (v) {
        selected.difficulty = v;
      });
      bindSeg(els.segSide, function (v) {
        selected.humanSide = parseInt(v, 10);
      });
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

      // 绑定 NetPlay 状态回调
      window.NetPlay.on('onState', updateNetUI);
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
