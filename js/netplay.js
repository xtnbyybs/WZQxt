(function () {
  'use strict';

  let ws = null;
  let url = '';
  let state = 'idle'; // idle | connecting | waiting | playing
  let room = null;
  let mySide = 0;  // 1=黑先手, 2=白后手, 0=观战
  let myReady = false;
  let seatsData = [];  // [{ side, ready }]
  let specCount = 0;
  let reconnectTimer = null;
  let pingTimer = null;
  let pending = [];

  let callbacks = {
    onRoomCreated: function () {},
    onJoined: function () {},
    onGameStart: function () {},
    onMove: function () {},
    onRestart: function () {},
    onOpponentLeft: function () {},
    onSeatsUpdate: function () {},    // 座位/准备状态变更
    onSpecUpdate: function () {},      // 观战人数变更
    onError: function () {},
    onState: function () {}
  };

  function connect(serverUrl) {
    if (ws) { try { ws.close(); } catch (e) {}; ws = null; }
    url = serverUrl;
    state = 'connecting';
    pending = [];
    emitState();
    ws = new WebSocket(serverUrl);
    ws.onopen = function () {
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (pending.length > 0) {
        var queue = pending.slice();
        pending = [];
        for (var i = 0; i < queue.length; i++) { send(queue[i]); }
      }
    };
    ws.onmessage = function (e) {
      let msg;
      try { msg = JSON.parse(e.data); } catch (ex) { return; }
      handleMessage(msg);
    };
    ws.onclose = function () {
      ws = null;
      pending = [];
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pingTimer) clearInterval(pingTimer);
      if (state !== 'idle') {
        state = 'idle';
        emitState();
        callbacks.onError('连接已断开，请重试');
      }
    };
    ws.onerror = function () {};
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = setInterval(function () { send({ type: 'ping' }); }, 25000);
  }

  function send(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify(data)); } catch (e) {}
    } else {
      pending.push(data);
    }
  }

  function handleMessage(msg) {
    switch (msg.type) {
      case 'room_created':
        state = 'waiting';
        room = msg.room;
        mySide = msg.side || 1;
        myReady = msg.ready || false;
        seatsData = msg.seats || [];
        specCount = 0;
        emitState();
        callbacks.onRoomCreated(room, mySide);
        callbacks.onSeatsUpdate(seatsData, mySide);
        break;

      case 'joined':
        state = 'waiting';
        room = msg.room || room;
        mySide = msg.side || 2;
        myReady = msg.ready || false;
        seatsData = msg.seats || [];
        emitState();
        callbacks.onJoined(room, mySide);
        callbacks.onSeatsUpdate(seatsData, mySide);
        break;

      case 'player_joined':
        seatsData = msg.seats || seatsData;
        emitState();
        callbacks.onSeatsUpdate(seatsData, mySide);
        break;

      case 'ready_update':
        seatsData = msg.seats || seatsData;
        // 更新自己的ready状态
        if (msg.side === mySide) myReady = msg.ready;
        emitState();
        callbacks.onSeatsUpdate(seatsData, mySide);
        break;

      case 'game_start':
        state = 'playing';
        room = msg.room || room;
        mySide = msg.side; // 对战者收到1或2，观战者收到0
        seatsData = msg.seats || seatsData;
        myReady = true;
        emitState();
        callbacks.onGameStart(room, mySide);
        break;

      case 'move':
        if (typeof msg.r === 'number' && typeof msg.c === 'number') {
          callbacks.onMove(msg.r, msg.c, msg.player);
        }
        break;

      case 'restart':
        state = 'waiting';
        myReady = false;
        seatsData = msg.seats || [];
        emitState();
        callbacks.onRestart();
        callbacks.onSeatsUpdate(seatsData, mySide);
        break;

      case 'opponent_left':
        state = 'idle';
        room = null;
        mySide = 0;
        myReady = false;
        seatsData = msg.seats || [];
        emitState();
        callbacks.onOpponentLeft();
        break;

      case 'spectator':
        state = 'spectating';
        mySide = 0;
        myReady = false;
        seatsData = msg.seats || [];
        specCount = msg.specCount || 0;
        emitState();
        callbacks.onSeatsUpdate(seatsData, 0);
        callbacks.onSpecUpdate(specCount);
        break;

      case 'spectator_joined':
        specCount = msg.specCount || (specCount + 1);
        callbacks.onSpecUpdate(specCount);
        break;

      case 'spectator_left':
        specCount = msg.specCount || Math.max(0, specCount - 1);
        callbacks.onSpecUpdate(specCount);
        break;

      case 'error':
        callbacks.onError(msg.message || '未知错误');
        break;

      case 'pong':
        break;
    }
  }

  function createRoom(serverUrl) {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var rid = '';
    for (var i = 0; i < 4; i++) rid += chars[Math.floor(Math.random() * chars.length)];
    room = rid;
    mySide = 1;
    myReady = false;
    seatsData = [];
    url = serverUrl;
    state = 'connecting';
    emitState();
    connect(serverUrl + '/room/' + rid);
    pending.push({ type: 'create' });
  }

  function joinRoom(serverUrl, code) {
    room = code;
    mySide = 2;
    myReady = false;
    seatsData = [];
    url = serverUrl;
    state = 'connecting';
    emitState();
    connect(serverUrl + '/room/' + code);
    pending.push({ type: 'join', room: code });
  }

  function sendMove(r, c) {
    send({ type: 'move', r: r, c: c, player: mySide });
  }

  function requestRestart() {
    send({ type: 'restart' });
  }

  function sendReady(ready) {
    myReady = ready;
    send({ type: 'ready', ready: ready });
  }

  function leave() {
    send({ type: 'leave' });
    if (ws) {
      try { ws.close(); } catch (e) {}
      ws = null;
    }
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
    state = 'idle';
    room = null;
    mySide = 0;
    myReady = false;
    seatsData = [];
    specCount = 0;
    emitState();
  }

  function emitState() {
    callbacks.onState(state, room, mySide, { ready: myReady, seats: seatsData, specCount: specCount });
  }

  function getState() {
    return { state: state, room: room, mySide: mySide, url: url, ready: myReady, seats: seatsData, specCount: specCount };
  }

  window.NetPlay = {
    connect: connect,
    createRoom: createRoom,
    joinRoom: joinRoom,
    sendMove: sendMove,
    requestRestart: requestRestart,
    sendReady: sendReady,
    leave: leave,
    getState: getState,
    on: function (event, fn) { callbacks[event] = fn; }
  };
})();

