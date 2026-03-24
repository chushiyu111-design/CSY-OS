
/**
 * XHS MCP Client — 通过 xiaohongshu-mcp (浏览器自动化) 操作小红书
 *
 * 实现 MCP Streamable HTTP 协议:
 * - POST JSON-RPC 2.0 到 /mcp
 * - Accept: application/json, text/event-stream
 * - 初始化握手: initialize → 获取 Mcp-Session-Id → notifications/initialized
 * - 后续请求带 Mcp-Session-Id header
 * - 响应可能是 JSON 或 SSE (text/event-stream)
 *
 * 注意: xiaohongshu-mcp 服务器的 CORS 缺少 Access-Control-Expose-Headers，
 * 导致浏览器无法读取 Mcp-Session-Id。需要通过 scripts/mcp-proxy.mjs 代理。
 *
 * Server: https://github.com/xpzouying/xiaohongshu-mcp
 */

export interface McpToolResult {
    success: boolean;
    data?: any;
    error?: string;
}

interface McpJsonRpcRequest {
    jsonrpc: '2.0';
    method: string;
    params?: any;
    id?: number;  // notifications don't have id
}

interface McpJsonRpcResponse {
    jsonrpc: '2.0';
    id?: number;
    result?: any;
    error?: { code: number; message: string; data?: any };
}

// ==================== Session State ====================

let requestIdCounter = 0;
let currentSessionId: string | null = null;
let isInitialized = false;
let discoveredTools: { name: string; description?: string }[] = [];

// ==================== Tool Name Resolution ====================

/**
 * 工具名别名表 — 覆盖不同版本 xiaohongshu-mcp 可能使用的名称
 * key = 我们的标准名, value = 服务器可能用的候选名（按优先级）
 */
const TOOL_NAME_ALIASES: Record<string, string[]> = {
    'check_login':     ['check_login', 'checkLogin', 'check_login_status', 'checkLoginStatus'],
    'search':          ['search', 'search_notes', 'searchNotes', 'search_feeds', 'searchFeeds'],
    'get_recommend':   ['get_recommend', 'getRecommend', 'list_feeds', 'listFeeds', 'get_feed_list', 'getFeedList', 'list_notes', 'listNotes'],
    'get_note_detail': ['get_note_detail', 'getNoteDetail', 'get_feed_detail', 'getFeedDetail'],
    'publish_note':    ['publish_note', 'publishNote', 'publish_post', 'publishPost', 'publish_content', 'publishContent'],
    'comment':         ['comment', 'post_comment', 'postComment', 'post_comment_to_feed', 'postCommentToFeed'],
    'get_user_info':   ['get_user_info', 'getUserInfo', 'get_user_profile', 'getUserProfile', 'user_profile', 'userProfile'],
    'like_feed':       ['like_feed', 'likeFeed', 'like_note', 'likeNote'],
    'favorite_feed':   ['favorite_feed', 'favoriteFeed', 'favorite_note', 'favoriteNote', 'collect_note', 'collectNote'],
    'reply_comment':   ['reply_comment', 'replyComment', 'reply_comment_in_feed', 'replyCommentInFeed'],
};

/**
 * 根据服务器实际可用的工具列表，解析我们想要调用的工具名
 */
const resolveToolName = (desiredName: string): string => {
    if (!discoveredTools.length) return desiredName;

    // 1. Exact match
    if (discoveredTools.some(t => t.name === desiredName)) return desiredName;

    // 2. Check alias table
    const aliases = TOOL_NAME_ALIASES[desiredName];
    if (aliases) {
        for (const alias of aliases) {
            if (discoveredTools.some(t => t.name === alias)) return alias;
        }
    }

    // 3. Normalized match (remove _ and lowercase)
    const norm = (s: string) => s.replace(/[_-]/g, '').toLowerCase();
    const desired = norm(desiredName);
    const match = discoveredTools.find(t => norm(t.name) === desired);
    if (match) return match.name;

    // 4. Fallback — return original and let server error
    console.warn(`[MCP] 未找到工具 "${desiredName}" 的匹配，可用: ${discoveredTools.map(t => t.name).join(', ')}`);
    return desiredName;
};

/**
 * 从小红书笔记 URL 中提取 noteId
 * 支持格式: https://www.xiaohongshu.com/explore/xxxx?xsec_token=yyy
 */
const extractNoteIdFromUrl = (url: string): string => {
    // 尝试从 URL 提取 noteId
    const match = url.match(/\/explore\/([a-f0-9]+)/i) || url.match(/\/discovery\/item\/([a-f0-9]+)/i) || url.match(/\/([a-f0-9]{24})/);
    return match ? match[1] : url; // fallback: 原值可能本身就是 feed_id
};

/**
 * 从 URL query string 中提取 xsec_token
 */
const extractXsecTokenFromUrl = (url: string): string | undefined => {
    try {
        const u = new URL(url);
        return u.searchParams.get('xsec_token') || undefined;
    } catch {
        return undefined;
    }
};

/**
 * 根据目标工具名适配参数名（不同服务器版本参数名可能不同）
 */
const adaptParams = (resolvedName: string, args: Record<string, any>): Record<string, any> => {
    const norm = resolvedName.replace(/[_-]/g, '').toLowerCase();

    // "url" field → "feed_id" (+ xsec_token) for servers that use feed_id
    if (args.url && !args.feed_id) {
        const feedIdTools = ['getfeeddetail', 'getnotedetail', 'postcomment', 'postcommenttofeed', 'replycommentinfeed'];
        if (feedIdTools.some(n => norm === n)) {
            const adapted = { ...args };
            adapted.feed_id = extractNoteIdFromUrl(args.url);
            // 如果 URL 中有 xsec_token 且参数中没有，自动提取
            if (!adapted.xsec_token) {
                const token = extractXsecTokenFromUrl(args.url);
                if (token) adapted.xsec_token = token;
            }
            delete adapted.url;
            return adapted;
        }
    }
    return args;
};

const buildRequest = (method: string, params?: any, isNotification = false): McpJsonRpcRequest => {
    const req: McpJsonRpcRequest = {
        jsonrpc: '2.0',
        method,
        params,
    };
    if (!isNotification) {
        req.id = ++requestIdCounter;
    }
    return req;
};

// ==================== SSE Response Parser ====================

/**
 * 解析 SSE (text/event-stream) 响应
 * 格式: event: message\ndata: {...}\n\n
 */
const parseSseResponse = (text: string): McpJsonRpcResponse | null => {
    const lines = text.split('\n');
    const dataLines: string[] = [];

    for (const line of lines) {
        if (line.startsWith('data: ')) {
            dataLines.push(line.slice(6));
        } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5));
        }
    }

    if (dataLines.length === 0) return null;

    // Try parsing each data line as JSON-RPC (take the last valid one)
    for (let i = dataLines.length - 1; i >= 0; i--) {
        try {
            return JSON.parse(dataLines[i]);
        } catch { continue; }
    }
    return null;
};

/**
 * 解析响应 — 自动处理 JSON 和 SSE 两种格式
 */
const parseResponse = (text: string, contentType: string): McpJsonRpcResponse => {
    // SSE format
    if (contentType.includes('text/event-stream') || text.trimStart().startsWith('event:') || text.trimStart().startsWith('data:')) {
        const parsed = parseSseResponse(text);
        if (parsed) return parsed;
    }

    // Plain JSON
    try {
        return JSON.parse(text);
    } catch {
        // Fallback: try to find JSON in the text
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
            try { return JSON.parse(match[0]); } catch { /* fall through */ }
        }
        throw new Error(`MCP: 无法解析响应: ${text.slice(0, 300)}`);
    }
};

// ==================== Core HTTP ====================

/**
 * 发送 MCP JSON-RPC 请求
 */
const mcpPost = async (
    serverUrl: string,
    body: McpJsonRpcRequest,
    expectResponse = true,
): Promise<{ response: McpJsonRpcResponse | null; sessionId: string | null }> => {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
    };

    if (currentSessionId) {
        headers['Mcp-Session-Id'] = currentSessionId;
    }

    const resp = await fetch(serverUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });

    // Extract session ID from response
    const sessionId = resp.headers.get('Mcp-Session-Id') || resp.headers.get('mcp-session-id');

    // 202 Accepted = notification acknowledged, no body
    if (resp.status === 202) {
        return { response: null, sessionId };
    }

    if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error(`MCP HTTP ${resp.status}: ${errText.slice(0, 200)}`);
    }

    if (!expectResponse) {
        return { response: null, sessionId };
    }

    const contentType = resp.headers.get('content-type') || '';
    const text = await resp.text();
    const parsed = parseResponse(text, contentType);

    return { response: parsed, sessionId };
};

/**
 * 完整的 MCP 调用（带自动初始化）
 */
const mcpCall = async (serverUrl: string, method: string, params?: any): Promise<McpJsonRpcResponse> => {
    // Auto-initialize if needed
    if (!isInitialized) {
        await doInitialize(serverUrl);
    }

    const body = buildRequest(method, params);
    const { response } = await mcpPost(serverUrl, body);

    if (!response) {
        throw new Error('MCP: 未收到响应');
    }
    return response;
};

// ==================== Initialize Handshake ====================

const doInitialize = async (serverUrl: string): Promise<void> => {
    // Step 1: Send initialize request
    const initReq = buildRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'AetherOS-XhsFreeRoam', version: '1.0.0' },
    });

    const { response, sessionId } = await mcpPost(serverUrl, initReq);

    // Store session ID if provided
    if (sessionId) {
        currentSessionId = sessionId;
    }

    if (response?.error) {
        throw new Error(`MCP Initialize failed: ${response.error.message}`);
    }

    // Detect CORS issue: server should have returned a session ID
    if (!currentSessionId) {
        console.warn(
            '[MCP] ⚠️ 无法读取 Mcp-Session-Id 响应头（CORS 限制）。\n' +
            '请使用 CORS 代理: node scripts/mcp-proxy.mjs\n' +
            '然后把 MCP URL 改为 http://localhost:18061/mcp'
        );
        throw new Error(
            'MCP 连接失败: 浏览器 CORS 限制无法读取 Session ID。\n' +
            '请运行 CORS 代理: node scripts/mcp-proxy.mjs\n' +
            '然后把设置里的 MCP URL 改为 http://localhost:18061/mcp'
        );
    }

    // Step 2: Send initialized notification (no id, no response expected)
    const notifReq = buildRequest('notifications/initialized', {}, true);
    await mcpPost(serverUrl, notifReq, false);

    // Step 3: Discover available tools
    try {
        const toolsReq = buildRequest('tools/list');
        const { response: toolsResp } = await mcpPost(serverUrl, toolsReq);
        if (toolsResp?.result?.tools) {
            discoveredTools = toolsResp.result.tools.map((t: any) => ({ name: t.name, description: t.description }));
            console.log('[MCP] 发现工具:', discoveredTools.map(t => t.name).join(', '));
        }
    } catch (e) {
        console.warn('[MCP] tools/list 调用失败，将使用默认工具名', e);
    }

    isInitialized = true;
};

/**
 * 调用 MCP Tool
 */
const callTool = async (serverUrl: string, toolName: string, args: Record<string, any> = {}): Promise<McpToolResult> => {
    try {
        // 必须先初始化，否则 discoveredTools 为空，resolveToolName 无法正确映射
        if (!isInitialized) {
            await doInitialize(serverUrl);
        }
        const resolved = resolveToolName(toolName);
        const adapted = adaptParams(resolved, args);
        if (resolved !== toolName) {
            console.log(`[MCP] 工具名映射: ${toolName} → ${resolved}`);
        }
        const resp = await mcpCall(serverUrl, 'tools/call', { name: resolved, arguments: adapted });

        if (resp.error) {
            return { success: false, error: `MCP Error [${resp.error.code}]: ${resp.error.message}` };
        }

        // MCP tool results come as content array
        const result = resp.result;
        if (result?.content) {
            const textParts = result.content
                .filter((c: any) => c.type === 'text')
                .map((c: any) => c.text);
            const fullText = textParts.join('\n');
            console.log(`[MCP] ${toolName} 响应文本长度: ${fullText.length}, 前200字: ${fullText.slice(0, 200)}`);

            // MCP tool-level error: result.isError = true
            if (result.isError) {
                return { success: false, error: fullText || 'MCP 工具执行失败' };
            }
            // Try parsing as JSON
            try {
                const parsed = JSON.parse(fullText);
                return { success: true, data: parsed };
            } catch {
                return { success: true, data: fullText };
            }
        }

        console.log(`[MCP] ${toolName} 无 content 字段, result keys:`, result ? Object.keys(result) : 'null');
        return { success: true, data: result };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

// ==================== Public API ====================

export const XhsMcpClient = {

    /**
     * 重置会话状态（重新连接时调用）
     */
    resetSession: () => {
        currentSessionId = null;
        isInitialized = false;
        requestIdCounter = 0;
        discoveredTools = [];
    },

    /**
     * 测试连接并初始化
     */
    testConnection: async (serverUrl: string): Promise<{ connected: boolean; tools?: string[]; error?: string; nickname?: string; userId?: string; loggedIn?: boolean }> => {
        try {
            // Reset state for fresh test
            XhsMcpClient.resetSession();

            // Initialize handshake (also discovers tools)
            await doInitialize(serverUrl);

            // Tools already discovered during init
            const tools = discoveredTools.map(t => t.name);

            // 尝试获取登录用户信息
            let nickname: string | undefined;
            let userId: string | undefined;
            let loggedIn = false;
            try {
                const loginResult = await callTool(serverUrl, 'check_login', {});
                if (loginResult.success && loginResult.data) {
                    const d = loginResult.data;
                    // check_login_status 返回纯文本: "✅ 已登录\n用户名: xxx\n用户ID: yyy\n..."
                    if (typeof d === 'string') {
                        loggedIn = d.includes('已登录');
                        const nameMatch = d.match(/用户名[:：]\s*(.+)/);
                        if (nameMatch) nickname = nameMatch[1].trim();
                        // 尝试提取 user_id（多种格式）
                        const idMatch = d.match(/(?:用户ID|user_id|userId|red_id|ID)[:：]\s*(\S+)/i);
                        if (idMatch) userId = idMatch[1].trim();
                    } else {
                        // 兼容未来可能的 JSON 格式
                        loggedIn = !!(d.logged_in || d.loggedIn || d.is_logged_in || d.isLoggedIn);
                        nickname = d.nickname || d.name || d.username || undefined;
                        userId = d.user_id || d.userId || d.id || d.red_id || undefined;
                    }
                    console.log(`[MCP] 登录状态: ${loggedIn ? '已登录' : '未登录'}${nickname ? `, 用户名: ${nickname}` : ''}${userId ? `, userId: ${userId}` : ''}`);
                }
            } catch (e) {
                console.warn('[MCP] 获取登录状态失败，跳过:', e);
            }

            return { connected: true, tools, nickname, userId, loggedIn };
        } catch (e: any) {
            return { connected: false, error: e.message };
        }
    },

    /**
     * 确保已初始化（在 run 开始时调用）
     */
    ensureInitialized: async (serverUrl: string): Promise<void> => {
        if (!isInitialized) {
            XhsMcpClient.resetSession();
            await doInitialize(serverUrl);
        }
    },

    /**
     * 检查小红书登录状态
     */
    checkLogin: async (serverUrl: string): Promise<McpToolResult> => {
        return callTool(serverUrl, 'check_login');
    },

    /**
     * 搜索小红书笔记
     */
    search: async (serverUrl: string, keyword: string): Promise<McpToolResult> => {
        return callTool(serverUrl, 'search', { keyword });
    },

    /**
     * 获取推荐内容 / 刷首页
     */
    getRecommend: async (serverUrl: string): Promise<McpToolResult> => {
        return callTool(serverUrl, 'get_recommend');
    },

    /**
     * 获取笔记详情（含评论）
     * @param xsecToken — 从搜索/推荐结果中获取的 xsec_token，get_feed_detail 需要此参数
     * @param options.loadAllComments — 是否加载所有评论（滚动+展开更多回复），默认 false
     */
    getNoteDetail: async (serverUrl: string, noteUrl: string, xsecToken?: string, options?: { loadAllComments?: boolean }): Promise<McpToolResult> => {
        const args: Record<string, any> = { url: noteUrl };
        if (xsecToken) args.xsec_token = xsecToken;
        if (options?.loadAllComments) {
            args.load_all_comments = true;
            args.click_more_replies = true;
        }
        return callTool(serverUrl, 'get_note_detail', args);
    },

    /**
     * 发布图文笔记
     */
    publishNote: async (serverUrl: string, params: {
        title: string;
        content: string;
        images?: string[];
        tags?: string[];
        is_private?: boolean;
    }): Promise<McpToolResult> => {
        // 确保 images 始终传递（MCP 服务器 schema 可能将其标记为 required）
        const args = { ...params, images: params.images || [] };
        return callTool(serverUrl, 'publish_note', args);
    },

    /**
     * 评论笔记
     * @param xsecToken — 从搜索/推荐结果中获取的 xsec_token，post_comment_to_feed 需要此参数
     */
    comment: async (serverUrl: string, noteUrl: string, content: string, xsecToken?: string): Promise<McpToolResult> => {
        const args: Record<string, any> = { url: noteUrl, content };
        if (xsecToken) args.xsec_token = xsecToken;
        return callTool(serverUrl, 'comment', args);
    },

    /**
     * 点赞笔记
     */
    likeFeed: async (serverUrl: string, feedId: string, xsecToken: string, unlike = false): Promise<McpToolResult> => {
        return callTool(serverUrl, 'like_feed', { feed_id: feedId, xsec_token: xsecToken, ...(unlike ? { unlike: true } : {}) });
    },

    /**
     * 收藏笔记
     */
    favoriteFeed: async (serverUrl: string, feedId: string, xsecToken: string, unfavorite = false): Promise<McpToolResult> => {
        return callTool(serverUrl, 'favorite_feed', { feed_id: feedId, xsec_token: xsecToken, ...(unfavorite ? { unfavorite: true } : {}) });
    },

    /**
     * 回复评论
     * @param userId — 评论作者的 user_id，MCP 服务端用它作为备选方式定位评论
     * @param parentCommentId — 父评论 ID（回复子评论时需要），xiaohongshu-mcp PR#440+ 支持
     */
    replyComment: async (serverUrl: string, feedId: string, xsecToken: string, content: string, commentId?: string, userId?: string, parentCommentId?: string): Promise<McpToolResult> => {
        const args: Record<string, any> = { feed_id: feedId, xsec_token: xsecToken, content };
        if (commentId) args.comment_id = commentId;
        if (userId) args.user_id = userId;
        if (parentCommentId) args.parent_comment_id = parentCommentId;
        return callTool(serverUrl, 'reply_comment', args);
    },

    /**
     * 获取用户主页信息（需要 user_id + xsec_token）
     */
    getUserProfile: async (serverUrl: string, userId: string, xsecToken?: string): Promise<McpToolResult> => {
        const args: Record<string, any> = { user_id: userId };
        if (xsecToken) args.xsec_token = xsecToken;
        return callTool(serverUrl, 'get_user_info', args);
    },
};

// ==================== Helpers ====================

/**
 * 从 MCP 返回的 data 中提取笔记数组 — 兼容各种格式
 */
export const extractNotesFromMcpData = (data: any): any[] => {
    if (!data) return [];
    // Direct array
    if (Array.isArray(data)) return data;
    // Common nested keys
    for (const key of ['notes', 'items', 'feeds', 'data', 'list', 'results', 'note_list', 'noteList']) {
        if (Array.isArray(data[key])) return data[key];
    }
    // Deep search: find first array in the object
    if (typeof data === 'object') {
        for (const val of Object.values(data)) {
            if (Array.isArray(val) && val.length > 0) {
                console.log(`[MCP] extractNotes: 在 key 中找到数组, length=${val.length}`);
                return val;
            }
        }
    }
    // If data is a string (non-JSON text), return empty
    if (typeof data === 'string') {
        console.warn('[MCP] extractNotes: data 是纯文本，无法提取笔记:', data.slice(0, 200));
        return [];
    }
    console.warn('[MCP] extractNotes: 未找到笔记数组, data keys:', Object.keys(data));
    return [];
};

/**
 * 将 MCP 笔记数据标准化为 XhsNote 格式
 */
export const normalizeNote = (n: any): { noteId: string; title: string; desc: string; author: string; authorId: string; likes: number; xsecToken?: string; coverUrl?: string; type?: string } => {
    // 兼容 noteCard (camelCase) 和 notecard (lowercase) 两种格式
    const card = n.noteCard || n.notecard;
    // 封面图 — 小红书 noteCard.cover 可能是对象 {url, urlDefault, urlPre} 或直接字符串
    const coverObj = card?.cover || n.cover;
    const rawCoverUrl = typeof coverObj === 'string' ? coverObj
        : coverObj?.urlDefault || coverObj?.url_default || coverObj?.url || coverObj?.urlPre || undefined;
    // 强制 HTTPS — 避免移动端 WebView 混合内容被拦截 & 防盗链问题
    const coverUrl = rawCoverUrl?.replace(/^http:\/\//, 'https://');
    return {
        noteId: n.noteId || n.note_id || n.id || card?.note_id || card?.noteId || '',
        title: n.title || n.display_title || n.displayTitle || card?.display_title || card?.displayTitle || '',
        desc: (n.desc || n.description || n.content || card?.desc || card?.description || '').slice(0, 500),
        author: n.author || n.nickname || n.user?.nickname || card?.user?.nickname || '',
        authorId: n.authorId || n.author_id || n.user?.user_id || card?.user?.user_id || '',
        likes: n.likes || n.liked_count || n.interact_info?.liked_count || card?.interact_info?.liked_count || card?.interactInfo?.likedCount || 0,
        xsecToken: n.xsecToken || n.xsec_token || card?.xsec_token || card?.xsecToken || undefined,
        coverUrl,
        type: n.type || card?.type || undefined,  // 'normal' | 'video'
    };
};
