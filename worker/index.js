/**
 * 五子棋 · 星穹连珠 — Cloudflare Worker 信令服务器
 * 使用 Durable Objects 实现房间隔离
 * 
 * 部署后端点：wss://<worker名称>.<账户>.workers.dev/room/<房间号>
 */

 export class GameRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();  // WebSocket → { side: 1|2 }
    this._roomId = null;  // 由 fetch 从 URL 中提取
  }

  async fetch(request) {
    // 从请求 URL 提取房间号（DO 实例按 roomId 创建，每个实例对应一个房间）
    const url = new URL(request.url);
    this._roomId = url.pathname.split("/room/")[1]?.toUpperCase() || "????";

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }

    const roomId = this._roomId;  // 直接使用实例属性

    switch (msg.type) {
      case "create": {
        if (this.sessions.has(ws)) break;
        this.sessions.set(ws, { side: 1 });
        this._send(ws, { type: "room_created", room: roomId, side: 1 });
        break;
      }

      case "join": {
        if (this.sessions.has(ws)) break;
        if (this.sessions.size >= 2) {
          this._send(ws, { type: "error", message: "房间已满" });
          ws.close(1000, "full");
          return;
        }
        this.sessions.set(ws, { side: 2 });
        this._send(ws, { type: "game_start", room: roomId, side: 2 });
        for (const [w, meta] of this.sessions.entries()) {
          if (meta.side === 1) this._send(w, { type: "game_start", room: roomId, side: 1 });
        }
        break;
      }

      case "move": {
        if (!this.sessions.has(ws)) return;
        if (typeof msg.r !== "number" || typeof msg.c !== "number") return;
        this._broadcast({ type: "move", r: msg.r, c: msg.c, player: msg.player }, ws);
        break;
      }

      case "restart": {
        this._broadcast({ type: "restart" }, ws);
        break;
      }

      case "leave": {
        this._broadcast({ type: "opponent_left" }, ws);
        this._cleanup();
        break;
      }

      case "ping": {
        this._send(ws, { type: "pong" });
        break;
      }
    }
  }

  async webSocketClose(ws) {
    this._broadcast({ type: "opponent_left" }, ws);
    this.sessions.delete(ws);
    if (this.sessions.size === 0) this._cleanup();
  }

  async webSocketError(ws) {
    this.sessions.delete(ws);
  }

  _send(ws, data) {
    try { ws.send(JSON.stringify(data)); } catch (e) {}
  }

  _broadcast(data, exclude) {
    for (const [w] of this.sessions.entries()) {
      if (w !== exclude) this._send(w, data);
    }
  }

  _cleanup() {
    for (const [w] of this.sessions.entries()) {
      try { w.close(1000, "clean"); } catch (e) {}
    }
    this.sessions.clear();
  }
}

// ──── Worker 入口 ────
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/room/")) {
      const roomId = url.pathname.split("/room/")[1] || "unknown";
      const id = env.GAME_ROOM.idFromName(roomId);
      const obj = env.GAME_ROOM.get(id);
      return obj.fetch(request);
    }
    if (url.pathname === "/health") return new Response("ok");
    return new Response("五子棋信令服务", {
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }
};
