/**
 * Vercel Edge Function — MiniMax HTTP API 代理
 *
 * 解决 Vercel rewrites 会丢失自定义请求 Header（Authorization、Group-Id）的问题。
 * 前端照常请求 /minimax-api/...，vercel.json 将其路由到本函数，
 * 本函数读取请求路径并完整地将 Header 和 Body 转发给 MiniMax API。
 *
 * 路由配置见 vercel.json:
 *   { "source": "/minimax-api/:path*", "destination": "/api/tts-proxy?path=:path*" }
 */

export const config = {
    runtime: 'edge',
};

const MINIMAX_BASE = 'https://api.minimaxi.com';

export default async function handler(req: Request): Promise<Response> {
    // 处理 CORS 预检请求
    if (req.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Authorization, Content-Type, Group-Id',
            },
        });
    }

    const url = new URL(req.url);

    // 从 query 参数中读取目标子路径（vercel.json 通过 :path* 传入）
    // 例如：?path=v1/t2a_v2 → /v1/t2a_v2
    const subPath = url.searchParams.get('path') || '';

    // 保留其他 query 参数（排除 path 本身），例如 task_id=xxx
    const forwardSearch = new URLSearchParams(url.search);
    forwardSearch.delete('path');
    const queryString = forwardSearch.toString();

    const targetUrl = `${MINIMAX_BASE}/${subPath}${queryString ? `?${queryString}` : ''}`;

    console.log(`[tts-proxy] ${req.method} ${targetUrl}`);

    // 透传必要的 Header
    const forwardHeaders = new Headers();
    const authHeader = req.headers.get('Authorization');
    const contentType = req.headers.get('Content-Type');
    const groupId = req.headers.get('Group-Id');

    if (authHeader) forwardHeaders.set('Authorization', authHeader);
    if (contentType) forwardHeaders.set('Content-Type', contentType);
    if (groupId) forwardHeaders.set('Group-Id', groupId);

    // 转发请求到 MiniMax
    const upstreamResponse = await fetch(targetUrl, {
        method: req.method,
        headers: forwardHeaders,
        body: (req.method !== 'GET' && req.method !== 'HEAD') ? req.body : undefined,
        // @ts-ignore — Vercel Edge Runtime 需要
        duplex: 'half',
    });

    // 构建响应 Header
    const responseHeaders = new Headers();
    const upstreamContentType = upstreamResponse.headers.get('Content-Type');
    if (upstreamContentType) responseHeaders.set('Content-Type', upstreamContentType);
    responseHeaders.set('Access-Control-Allow-Origin', '*');

    return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: responseHeaders,
    });
}
