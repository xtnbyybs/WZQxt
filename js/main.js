 (function () {
   'use strict';

   window.Cover.init({
     start: function (settings) {
       window.Gomoku.startGame(settings);
     }
   });
   window.Gomoku.init({});

   // 联机回调
   window.NetPlay.on('onMove', function (r, c, player) {
     window.Gomoku.remoteMove(r, c, player);
   });
   window.NetPlay.on('onRestart', function () {
     // 双方同意重开：重新开始当前对局
     window.Gomoku.startGame({ mode: 'net', netSide: window.NetPlay.getState().mySide });
   });
   window.NetPlay.on('onOpponentLeft', function () {
     window.Gomoku.backToMenu();
     alert('对手已离开房间');
   });
   window.NetPlay.on('onError', function (msg) {
     alert(msg);
   });
 })();
