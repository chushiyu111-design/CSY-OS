
import React, { useState } from 'react';
import type { TtsFormState } from '../tts/useTtsForm';

interface WeatherProps {
    enabled: boolean; apiKey: string; city: string;
    set: (field: string, value: any) => void;
    onTestStatus: (msg: string) => void;
}

export const WeatherSection = React.memo<WeatherProps>(({ enabled, apiKey, city, set, onTestStatus }) => {
    const testWeatherApi = async () => {
        if (!apiKey) { onTestStatus('请先填写 API Key'); return; }
        onTestStatus('正在测试...');
        try {
            const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric&lang=zh_cn`;
            const res = await fetch(url);
            if (res.ok) { const data = await res.json(); onTestStatus(`连接成功！${data.name}: ${data.weather[0]?.description}, ${Math.round(data.main.temp)}°C`); }
            else { onTestStatus(`连接失败: HTTP ${res.status}`); }
        } catch (e: any) { onTestStatus(`网络错误: ${e.message}`); }
    };

    return (
        <div className="bg-emerald-50/50 p-4 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><span className="text-lg">☀️</span><span className="text-sm font-bold text-emerald-700">天气感知</span></div>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={enabled} onChange={e => set('weatherEnabled', e.target.checked)} className="sr-only peer" />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
            </div>
            {enabled && (
                <div className="space-y-2">
                    <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">OpenWeatherMap API Key</label>
                        <input type="password" value={apiKey} onChange={e => set('weatherApiKey', e.target.value)} className="w-full bg-white/80 border border-emerald-200 rounded-xl px-3 py-2 text-sm font-mono" placeholder="获取: openweathermap.org" /></div>
                    <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">城市 (英文)</label>
                        <input type="text" value={city} onChange={e => set('weatherCity', e.target.value)} className="w-full bg-white/80 border border-emerald-200 rounded-xl px-3 py-2 text-sm" placeholder="Beijing, Shanghai, etc." /></div>
                    <button onClick={testWeatherApi} className="w-full py-2 bg-emerald-100 text-emerald-600 text-xs font-bold rounded-xl active:scale-95 transition-transform">测试天气API</button>
                </div>
            )}
        </div>
    );
});

interface NewsProps { enabled: boolean; apiKey: string; set: (field: string, value: any) => void; }

export const NewsSection = React.memo<NewsProps>(({ enabled, apiKey, set }) => (
    <div className="bg-blue-50/50 p-4 rounded-2xl space-y-3">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><span className="text-lg">📰</span><span className="text-sm font-bold text-blue-700">新闻热点</span></div>
            <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={enabled} onChange={e => set('newsEnabled', e.target.checked)} className="sr-only peer" />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
            </label>
        </div>
        {enabled && (
            <div className="space-y-2">
                <p className="text-xs text-blue-600/70">默认使用 Hacker News（英文科技新闻）。配置 Brave API 可获取中文新闻。</p>
                <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Brave Search API Key (推荐)</label>
                    <input type="password" value={apiKey} onChange={e => set('newsApiKey', e.target.value)} className="w-full bg-white/80 border border-blue-200 rounded-xl px-3 py-2 text-sm font-mono" placeholder="获取: brave.com/search/api" /></div>
                <p className="text-[10px] text-blue-500/70">免费2000次/月，支持中文新闻。<br />不配置则用 Hacker News（英文科技新闻）。</p>
            </div>
        )}
    </div>
));

interface NotionProps {
    enabled: boolean; apiKey: string; dbId: string; notesDbId: string;
    set: (field: string, value: any) => void;
    onTestStatus: (msg: string) => void;
}

export const NotionSection = React.memo<NotionProps>(({ enabled, apiKey, dbId, notesDbId, set, onTestStatus }) => {
    const testNotionApi = async () => {
        if (!apiKey || !dbId) { onTestStatus('请填写 Notion API Key 和 Database ID'); return; }
        onTestStatus('正在测试 Notion 连接...');
        try {
            const { NotionManager } = await import('../../../utils/realtimeContext');
            const result = await NotionManager.testConnection(apiKey, dbId);
            onTestStatus(result.message);
        } catch (e: any) { onTestStatus(`网络错误: ${e.message}`); }
    };

    return (
        <div className="bg-orange-50/50 p-4 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><span className="text-lg">📝</span><span className="text-sm font-bold text-orange-700">Notion 日记</span></div>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={enabled} onChange={e => set('notionEnabled', e.target.checked)} className="sr-only peer" />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                </label>
            </div>
            {enabled && (
                <div className="space-y-2">
                    <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Notion Integration Token</label>
                        <input type="password" value={apiKey} onChange={e => set('notionApiKey', e.target.value)} className="w-full bg-white/80 border border-orange-200 rounded-xl px-3 py-2 text-sm font-mono" placeholder="secret_..." /></div>
                    <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Database ID</label>
                        <input type="text" value={dbId} onChange={e => set('notionDbId', e.target.value)} className="w-full bg-white/80 border border-orange-200 rounded-xl px-3 py-2 text-sm font-mono" placeholder="从数据库URL复制" /></div>
                    <button onClick={testNotionApi} className="w-full py-2 bg-orange-100 text-orange-600 text-xs font-bold rounded-xl active:scale-95 transition-transform">测试Notion连接</button>
                    <div className="border-t border-orange-200/50 pt-2 mt-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">笔记数据库 ID（可选）</label>
                        <input type="text" value={notesDbId} onChange={e => set('notionNotesDbId', e.target.value)} className="w-full bg-white/80 border border-orange-200 rounded-xl px-3 py-2 text-sm font-mono" placeholder="用户日常笔记的数据库ID" />
                        <p className="text-[10px] text-orange-500/60 leading-relaxed mt-1">填写后角色可以偶尔看到你的笔记标题，温馨地提起你写的内容。留空则不启用。</p>
                    </div>
                    <p className="text-[10px] text-orange-500/70 leading-relaxed">
                        1. 在 <a href="https://www.notion.so/my-integrations" target="_blank" className="underline">Notion开发者</a> 创建Integration<br />
                        2. 创建一个日记数据库，添加"Name"(标题)和"Date"(日期)属性<br />
                        3. 在数据库右上角菜单中 Connect 你的 Integration
                    </p>
                </div>
            )}
        </div>
    );
});

interface FeishuProps {
    enabled: boolean; appId: string; appSecret: string; baseId: string; tableId: string;
    set: (field: string, value: any) => void;
    onTestStatus: (msg: string) => void;
}

export const FeishuSection = React.memo<FeishuProps>(({ enabled, appId, appSecret, baseId, tableId, set, onTestStatus }) => {
    const testFeishuApi = async () => {
        if (!appId || !appSecret || !baseId || !tableId) { onTestStatus('请填写飞书 App ID、App Secret、多维表格 ID 和数据表 ID'); return; }
        onTestStatus('正在测试飞书连接...');
        try {
            const { FeishuManager } = await import('../../../utils/realtimeContext');
            const result = await FeishuManager.testConnection(appId, appSecret, baseId, tableId);
            onTestStatus(result.message);
        } catch (e: any) { onTestStatus(`网络错误: ${e.message}`); }
    };

    return (
        <div className="bg-indigo-50/50 p-4 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><span className="text-lg">📒</span><span className="text-sm font-bold text-indigo-700">飞书日记</span><span className="text-[9px] bg-indigo-100 text-indigo-500 px-1.5 py-0.5 rounded-full">中国区</span></div>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={enabled} onChange={e => set('feishuEnabled', e.target.checked)} className="sr-only peer" />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
                </label>
            </div>
            <p className="text-[10px] text-indigo-500/70 leading-relaxed">Notion 的中国区替代方案，无需翻墙。使用飞书多维表格存储日记。</p>
            {enabled && (
                <div className="space-y-2">
                    <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">飞书 App ID</label><input type="text" value={appId} onChange={e => set('feishuAppId', e.target.value)} className="w-full bg-white/80 border border-indigo-200 rounded-xl px-3 py-2 text-sm font-mono" placeholder="cli_xxxxxxxx" /></div>
                    <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">飞书 App Secret</label><input type="password" value={appSecret} onChange={e => set('feishuAppSecret', e.target.value)} className="w-full bg-white/80 border border-indigo-200 rounded-xl px-3 py-2 text-sm font-mono" placeholder="xxxxxxxxxxxxxxxx" /></div>
                    <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">多维表格 App Token</label><input type="text" value={baseId} onChange={e => set('feishuBaseId', e.target.value)} className="w-full bg-white/80 border border-indigo-200 rounded-xl px-3 py-2 text-sm font-mono" placeholder="从多维表格URL中获取" /></div>
                    <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">数据表 Table ID</label><input type="text" value={tableId} onChange={e => set('feishuTableId', e.target.value)} className="w-full bg-white/80 border border-indigo-200 rounded-xl px-3 py-2 text-sm font-mono" placeholder="tblxxxxxxxx" /></div>
                    <button onClick={testFeishuApi} className="w-full py-2 bg-indigo-100 text-indigo-600 text-xs font-bold rounded-xl active:scale-95 transition-transform">测试飞书连接</button>
                    <p className="text-[10px] text-indigo-500/70 leading-relaxed">
                        1. 在 <a href="https://open.feishu.cn/app" target="_blank" className="underline">飞书开放平台</a> 创建企业自建应用，获取 App ID 和 Secret<br />
                        2. 在应用权限中添加「多维表格」相关权限<br />
                        3. 创建一个多维表格，添加字段: 标题(文本)、内容(文本)、日期(日期)、心情(文本)、角色(文本)<br />
                        4. 从多维表格 URL 中获取 App Token 和 Table ID
                    </p>
                </div>
            )}
        </div>
    );
});

interface XhsMcpProps {
    enabled: boolean; mcpUrl: string; nickname: string; userId: string;
    set: (field: string, value: any) => void;
    onTestStatus: (msg: string) => void;
    onUpdateConfig: (config: any) => void;
}

export const XhsMcpSection = React.memo<XhsMcpProps>(({ enabled, mcpUrl, nickname, userId, set, onTestStatus, onUpdateConfig }) => {
    const testXhsMcp = async () => {
        if (!mcpUrl) { onTestStatus('请填写 MCP Server URL'); return; }
        onTestStatus('正在连接 MCP Server...');
        try {
            const { XhsMcpClient } = await import('../../../utils/xhsMcpClient');
            const result = await XhsMcpClient.testConnection(mcpUrl);
            if (result.connected) {
                const toolCount = result.tools?.length || 0;
                const loginInfo = result.loggedIn
                    ? ` | ${result.nickname ? `账号: ${result.nickname}` : '已登录'}${result.userId ? ` (ID: ${result.userId})` : ''}`
                    : ' | ⚠️ 未登录，请先在浏览器中登录小红书';
                onTestStatus(`✅ MCP 连接成功! ${toolCount} 个工具可用${loginInfo}`);
                if (result.nickname && !nickname) set('xhsNickname', result.nickname);
                if (result.userId && !userId) set('xhsUserId', result.userId);
                onUpdateConfig({ enabled, serverUrl: mcpUrl, loggedInNickname: nickname || result.nickname, loggedInUserId: userId || result.userId });
            } else { onTestStatus(`❌ 连接失败: ${result.error}`); }
        } catch (e: any) { onTestStatus(`网络错误: ${e.message}`); }
    };

    return (
        <div className="bg-red-50/50 p-4 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><span className="text-lg">📕</span><span className="text-sm font-bold text-red-700">小红书 MCP</span><span className="text-[9px] bg-red-100 text-red-500 px-1.5 py-0.5 rounded-full">浏览器自动化</span></div>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={enabled} onChange={e => { set('xhsMcpEnabled', e.target.checked); set('xhsEnabled', e.target.checked); }} className="sr-only peer" />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500"></div>
                </label>
            </div>
            <p className="text-[10px] text-red-500/70 leading-relaxed">通过 MCP Server（浏览器自动化）操作小红书。角色可以搜索、浏览、发帖、评论。</p>
            {enabled && (
                <div className="space-y-2">
                    <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">MCP Server URL</label><input value={mcpUrl} onChange={e => set('xhsMcpUrl', e.target.value)} className="w-full bg-white/80 border border-red-200 rounded-xl px-3 py-2 text-[11px] font-mono" placeholder="http://localhost:18060/mcp" /></div>
                    <button onClick={testXhsMcp} className="w-full py-2 bg-red-100 text-red-600 text-xs font-bold rounded-xl active:scale-95 transition-transform">测试 MCP 连接</button>
                    <div className="grid grid-cols-2 gap-2">
                        <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">小红书昵称</label><input value={nickname} onChange={e => set('xhsNickname', e.target.value)} className="w-full bg-white/80 border border-red-200 rounded-xl px-3 py-2 text-[11px]" placeholder="手动填写（MCP检测可能不准）" /></div>
                        <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">用户 ID</label><input value={userId} onChange={e => set('xhsUserId', e.target.value)} className="w-full bg-white/80 border border-red-200 rounded-xl px-3 py-2 text-[11px] font-mono" placeholder="可选，用于查看主页" /></div>
                    </div>
                    <p className="text-[10px] text-red-500/70 leading-relaxed">
                        需要部署 xiaohongshu-mcp 并保持登录。在角色聊天设置中单独开关小红书。<br />
                        昵称和用户ID用于"查看自己的主页"功能。MCP自动检测可能不准，建议手动填写。<br />
                        项目: github.com/xpzouying/xiaohongshu-mcp
                    </p>
                </div>
            )}
        </div>
    );
});
