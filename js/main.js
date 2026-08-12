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
      // 重开后回联机面板等待双方再次准备
      window.Gomoku.backToMenu();
      window.Cover.show();
    });
   window.NetPlay.on('onOpponentLeft', function () {
     window.Gomoku.backToMenu();
     alert('对手已离开房间');
   });
   window.NetPlay.on('onError', function (msg) {
     alert(msg);
   });
 })();
