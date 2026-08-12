 (function () {
   'use strict';

   // WebSocket 信令客户端
   let ws = null;
   let url = '';
   let state = 'idle'; // idle | connecting | waiting | playing
   let room = null;
   let mySide = 0;  // 1=黑(先手), 2=白(后手)
   let reconnectTimer = null;
   let pingTimer = null;
   let pending = []; // 消息队列：ws 未 open 时暂存

   let callbacks = {
     onRoomCreated: function () {},
     onGameStart: function () {},
     onMove: function () {},
     onRestart: function () {},
     onOpponentLeft: function () {},
     onError: function () {},
     onState: function () {}
   };

   function connect(serverUrl) {
     if (ws) {
       try { ws.close(); } catch (e) {}
       ws = null;
     }
     url = serverUrl;
     state = 'connecting';
     pending = [];
     emitState();
     ws = new WebSocket(serverUrl);
     ws.onopen = function () {
       if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
       // 发送排队中的消息
       if (pending.length > 0) {
         var queue = pending.slice();
         pending = [];
         for (var i = 0; i < queue.length; i++) {
           send(queue[i]);
         }
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
     pingTimer = setInterval(function () {
       send({ type: 'ping' });
     }, 25000);
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
        mySide = msg.side;
        emitState();
        callbacks.onRoomCreated(room, mySide);
        break;

      case 'game_start':
        state = 'playing';
        room = msg.room;
        mySide = msg.side;
        emitState();
        callbacks.onGameStart(room, mySide);
        break;

      case 'move':
        if (typeof msg.r === 'number' && typeof msg.c === 'number') {
          callbacks.onMove(msg.r, msg.c, msg.player);
        }
        break;

      case 'restart':
        callbacks.onRestart();
        break;

      case 'opponent_left':
        state = 'idle';
        room = null;
        emitState();
        callbacks.onOpponentLeft();
        break;

      case 'error':
        callbacks.onError(msg.message || '未知错误');
        break;

      case 'pong':
        break;
    }
  }

  function createRoom(serverUrl) {
    // 客户端生成房间号
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var rid = '';
    for (var i = 0; i < 4; i++) rid += chars[Math.floor(Math.random() * chars.length)];
    room = rid;
    mySide = 1;
    url = serverUrl;
    state = 'connecting';
    emitState();
    connect(serverUrl + '/room/' + rid);
    pending.push({ type: 'create' });
  }

  function joinRoom(serverUrl, code) {
    room = code;
    mySide = 2;
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
    emitState();
  }

  function emitState() {
    callbacks.onState(state, room, mySide);
  }

  function getState() {
    return { state: state, room: room, mySide: mySide, url: url };
  }

  window.NetPlay = {
    connect: connect,
    createRoom: createRoom,
    joinRoom: joinRoom,
    sendMove: sendMove,
    requestRestart: requestRestart,
    leave: leave,
    getState: getState,
    on: function (event, fn) {
      callbacks[event] = fn;
    }
  };
})();
