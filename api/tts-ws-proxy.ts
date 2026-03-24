/**
 * Vercel Edge Function — MiniMax TTS WebSocket 代理
 *
 * 解决浏览器 WebSocket 无法发送 Authorization header 的问题：
 * 浏览器连接到 /api/tts-ws-proxy?token=xxx，
 * 本函数作为代理，在请求头中加入 Authorization: Bearer xxx 后转发给 MiniMax。
 *
 * 使用方法（前端）:
 *   const wsUrl = `wss://sullytest-beta.vercel.app/api/tts-ws-proxy?token=${encodeURIComponent(token)}`;
 *   const ws = new WebSocket(wsUrl);
 *
 * 生产环境替换域名为正式链接。
 */

export const config = {
    runtime: 'edge',
};

const MINIMAX_WS_URL = 'wss://api.minimaxi.com/ws/v1/t2a_v2';

export default async function handler(req: Request): Promise<Response> {
    // 仅允许 WebSocket 升级请求
    const upgradeHeader = req.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
        return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    // 从 query 参数中取 token
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    if (!token) {
        return new Response('Missing token parameter', { status: 400 });
    }

    // 连接上游 MiniMax WebSocket，携带 Authorization header
    // @ts-ignore — Cloudflare/Vercel Edge WebSocket API
    const { 0: client, 1: server } = new WebSocketPair();

    // @ts-ignore
    server.accept();

    // 连接 MiniMax
    const upstream = new WebSocket(MINIMAX_WS_URL, {
        // @ts-ignore
        headers: {
            'Authorization': `Bearer ${token}`,
        },
    });

    // 上游 → 客户端（音频数据、事件）
    upstream.addEventListener('message', (evt) => {
        try {
            server.send(evt.data);
        } catch { /* client disconnected */ }
    });

    upstream.addEventListener('close', (evt) => {
        try {
            server.close(evt.code, evt.reason);
        } catch { }
    });

    upstream.addEventListener('error', () => {
        try {
            server.close(1011, 'upstream error');
        } catch { }
    });

    // 客户端 → 上游（task_start, task_continue, task_finish）
    server.addEventListener('message', (evt: MessageEvent) => {
        if (upstream.readyState === WebSocket.OPEN) {
            upstream.send(evt.data);
        }
    });

    server.addEventListener('close', () => {
        if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) {
            upstream.close();
        }
    });

    // @ts-ignore
    return new Response(null, { status: 101, webSocket: client });
}
