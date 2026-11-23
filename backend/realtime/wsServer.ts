import type { Server as HttpServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { verifyJwt, type JwtClaims } from '../middleware/auth.js';

interface ConnectedClient {
  ws: WebSocket;
  user: JwtClaims;
}

class RealtimeHub {
  private wss: WebSocketServer | null = null;
  private clients = new Set<ConnectedClient>();

  attach(server: HttpServer): void {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws, req) => {
      try {
        const reqUrl = new URL(req.url || '/ws', 'http://localhost');
        const token = reqUrl.searchParams.get('token') || '';
        const claims = verifyJwt(token);

        const client: ConnectedClient = { ws, user: claims };
        this.clients.add(client);

        ws.send(
          JSON.stringify({
            type: 'connected',
            onlineUsers: this.getPresenceSnapshot(),
            timestamp: new Date().toISOString(),
          })
        );

        this.broadcastPresence();

        ws.on('close', () => {
          this.clients.delete(client);
          this.broadcastPresence();
        });

        ws.on('error', () => {
          this.clients.delete(client);
        });
      } catch {
        ws.close(1008, 'Unauthorized WebSocket connection');
      }
    });
  }

  getPresenceSnapshot(): Array<{ userId: string; name: string; role: string }> {
    const unique = new Map<string, { userId: string; name: string; role: string }>();
    for (const c of this.clients) {
      if (c.ws.readyState === WebSocket.OPEN) {
        unique.set(c.user.sub, {
          userId: c.user.sub,
          name: c.user.name,
          role: c.user.role,
        });
      }
    }
    return Array.from(unique.values());
  }

  private broadcastPresence(): void {
    this.broadcast('presence:update', {
      onlineUsers: this.getPresenceSnapshot(),
    });
  }

  broadcast(
    type: 'assignment:updated' | 'group:updated' | 'submission:updated' | 'grade:updated' | 'presence:update',
    payload: Record<string, unknown>
  ): void {
    const message = JSON.stringify({
      type,
      payload,
      timestamp: new Date().toISOString(),
    });
    for (const client of this.clients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
      }
    }
  }
}

export const realtimeHub = new RealtimeHub();
