
import React, { useState } from 'react';
import { useOS } from '../../context/OSContext';
import { NotionManager, FeishuManager } from '../../utils/realtimeContext';
import { XhsMcpClient } from '../../utils/xhsMcpClient';
import Modal from '../../components/os/Modal';

const RealtimeSettings: React.FC = () => {
    const { realtimeConfig, updateRealtimeConfig, addToast } = useOS();

    const [rtWeatherEnabled, setRtWeatherEnabled] = useState(realtimeConfig.weatherEnabled);
    const [rtWeatherKey, setRtWeatherKey] = useState(realtimeConfig.weatherApiKey);
    const [rtWeatherCity, setRtWeatherCity] = useState(realtimeConfig.weatherCity);
    const [rtNewsEnabled, setRtNewsEnabled] = useState(realtimeConfig.newsEnabled);
    const [rtNewsApiKey, setRtNewsApiKey] = useState(realtimeConfig.newsApiKey || '');
    const [rtNotionEnabled, setRtNotionEnabled] = useState(realtimeConfig.notionEnabled);
    const [rtNotionKey, setRtNotionKey] = useState(realtimeConfig.notionApiKey);
    const [rtNotionDbId, setRtNotionDbId] = useState(realtimeConfig.notionDatabaseId);
    const [rtNotionNotesDbId, setRtNotionNotesDbId] = useState(realtimeConfig.notionNotesDatabaseId || '');
    const [rtFeishuEnabled, setRtFeishuEnabled] = useState(realtimeConfig.feishuEnabled);
    const [rtFeishuAppId, setRtFeishuAppId] = useState(realtimeConfig.feishuAppId);
    const [rtFeishuAppSecret, setRtFeishuAppSecret] = useState(realtimeConfig.feishuAppSecret);
    const [rtFeishuBaseId, setRtFeishuBaseId] = useState(realtimeConfig.feishuBaseId);
    const [rtFeishuTableId, setRtFeishuTableId] = useState(realtimeConfig.feishuTableId);
    const [rtXhsEnabled, setRtXhsEnabled] = useState(realtimeConfig.xhsEnabled);
    const [rtXhsMcpEnabled, setRtXhsMcpEnabled] = useState(realtimeConfig.xhsMcpConfig?.enabled ?? false);
    const [rtXhsMcpUrl, setRtXhsMcpUrl] = useState(realtimeConfig.xhsMcpConfig?.serverUrl || '');
    const [rtXhsNickname, setRtXhsNickname] = useState(realtimeConfig.xhsMcpConfig?.loggedInNickname || '');
    const [rtXhsUserId, setRtXhsUserId] = useState(realtimeConfig.xhsMcpConfig?.loggedInUserId || '');
    const [rtTestStatus, setRtTestStatus] = useState('');
    const [showRealtimeModal, setShowRealtimeModal] = useState(false);

    const handleSaveRealtimeConfig = () => {
        updateRealtimeConfig({
            weatherEnabled: rtWeatherEnabled, weatherApiKey: rtWeatherKey, weatherCity: rtWeatherCity,
            newsEnabled: rtNewsEnabled, newsApiKey: rtNewsApiKey,
            notionEnabled: rtNotionEnabled, notionApiKey: rtNotionKey, notionDatabaseId: rtNotionDbId,
            notionNotesDatabaseId: rtNotionNotesDbId || undefined,
            feishuEnabled: rtFeishuEnabled, feishuAppId: rtFeishuAppId, feishuAppSecret: rtFeishuAppSecret,
            feishuBaseId: rtFeishuBaseId, feishuTableId: rtFeishuTableId,
            xhsEnabled: rtXhsEnabled,
            xhsMcpConfig: { enabled: rtXhsMcpEnabled, serverUrl: rtXhsMcpUrl, loggedInNickname: rtXhsNickname || undefined, loggedInUserId: rtXhsUserId || undefined }
        });
        addToast('实时感知配置已保存', 'success');
        setShowRealtimeModal(false);
    };

    const testWeatherApi = async () => {
        if (!rtWeatherKey) { setRtTestStatus('请先填写 API Key'); return; }
        setRtTestStatus('正在测试...');
        try {
            const url = `https://api.openweathermap.org/data/2.5/weather?q=${rtWeatherCity}&appid=${rtWeatherKey}&units=metric&lang=zh_cn`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                setRtTestStatus(`连接成功！${data.name}: ${data.weather[0]?.description}, ${Math.round(data.main.temp)}°C`);
            } else { setRtTestStatus(`连接失败: HTTP ${res.status}`); }
        } catch (e: any) { setRtTestStatus(`网络错误: ${e.message}`); }
    };

    const testNotionApi = async () => {
        if (!rtNotionKey || !rtNotionDbId) { setRtTestStatus('请填写 Notion API Key 和 Database ID'); return; }
        setRtTestStatus('正在测试 Notion 连接...');
        try { const result = await NotionManager.testConnection(rtNotionKey, rtNotionDbId); setRtTestStatus(result.message); }
        catch (e: any) { setRtTestStatus(`网络错误: ${e.message}`); }
    };

    const testFeishuApi = async () => {
        if (!rtFeishuAppId || !rtFeishuAppSecret || !rtFeishuBaseId || !rtFeishuTableId) { setRtTestStatus('请填写飞书 App ID、App Secret、多维表格 ID 和数据表 ID'); return; }
        setRtTestStatus('正在测试飞书连接...');
        try { const result = await FeishuManager.testConnection(rtFeishuAppId, rtFeishuAppSecret, rtFeishuBaseId, rtFeishuTableId); setRtTestStatus(result.message); }
        catch (e: any) { setRtTestStatus(`网络错误: ${e.message}`); }
    };

    const testXhsMcp = async () => {
        if (!rtXhsMcpUrl) { setRtTestStatus('请填写 MCP Server URL'); return; }
        setRtTestStatus('正在连接 MCP Server...');
        try {
            const result = await XhsMcpClient.testConnection(rtXhsMcpUrl);
            if (result.connected) {
                const toolCount = result.tools?.length || 0;
                const loginInfo = result.loggedIn
                    ? ` | ${result.nickname ? `账号: ${result.nickname}` : '已登录'}${result.userId ? ` (ID: ${result.userId})` : ''}`
                    : ' | ⚠️ 未登录，请先在浏览器中登录小红书';
                setRtTestStatus(`✅ MCP 连接成功! ${toolCount} 个工具可用${loginInfo}`);
                if (result.nickname && !rtXhsNickname) setRtXhsNickname(result.nickname);
                if (result.userId && !rtXhsUserId) setRtXhsUserId(result.userId);
                updateRealtimeConfig({ xhsMcpConfig: { enabled: rtXhsMcpEnabled, serverUrl: rtXhsMcpUrl, loggedInNickname: rtXhsNickname || result.nickname, loggedInUserId: rtXhsUserId || result.userId } });
            } else { setRtTestStatus(`❌ 连接失败: ${result.error}`); }
        } catch (e: any) { setRtTestStatus(`网络错误: ${e.message}`); }
    };

    return (
        <>
            {/* 实时感知概览卡片 */}
            <section className="bg-white/60 backdrop-blur-sm rounded-3xl p-5 shadow-sm border border-white/50">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-violet-100/50 rounded-xl text-violet-600">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" /></svg>
                        </div>
                        <h2 className="text-sm font-semibold text-slate-600 tracking-wider">实时感知</h2>
                    </div>
                    <button onClick={() => setShowRealtimeModal(true)} className="text-[10px] bg-violet-100 text-violet-600 px-3 py-1.5 rounded-full font-bold shadow-sm active:scale-95 transition-transform">配置</button>
                </div>

                <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                    让AI角色感知真实世界：天气、新闻热点、当前时间。角色可以根据天气关心你、聊聊最近的热点话题。
                </p>

                <div className="grid grid-cols-5 gap-2 text-center">
                    <div className={`py-3 rounded-xl text-xs font-bold ${rtWeatherEnabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
                        <div className="text-lg mb-1">{rtWeatherEnabled ? '☀️' : '🌫️'}</div>天气
                    </div>
                    <div className={`py-3 rounded-xl text-xs font-bold ${rtNewsEnabled ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-400'}`}>
                        <div className="text-lg mb-1">{rtNewsEnabled ? '📰' : '📄'}</div>新闻
                    </div>
                    <div className={`py-3 rounded-xl text-xs font-bold ${rtNotionEnabled ? 'bg-orange-50 text-orange-600' : 'bg-slate-50 text-slate-400'}`}>
                        <div className="text-lg mb-1">{rtNotionEnabled ? '📝' : '📋'}</div>Notion
                    </div>
                    <div className={`py-3 rounded-xl text-xs font-bold ${rtFeishuEnabled ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-400'}`}>
                        <div className="text-lg mb-1">{rtFeishuEnabled ? '📒' : '📋'}</div>飞书
                    </div>
                    <div className={`py-3 rounded-xl text-xs font-bold ${rtXhsEnabled ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-400'}`}>
                        <div className="text-lg mb-1">{rtXhsEnabled ? '📕' : '📋'}</div>小红书
                    </div>
                </div>
            </section>

            {/* 实时感知配置 Modal */}
            <Modal isOpen={showRealtimeModal} title="实时感知配置" onClose={() => setShowRealtimeModal(false)}
                footer={<button onClick={handleSaveRealtimeConfig} className="w-full py-3 bg-violet-500 text-white font-bold rounded-2xl shadow-lg">保存配置</button>}>
                <div className="space-y-5 max-h-[60vh] overflow-y-auto no-scrollbar">
                    {/* 天气配置 */}
                    <div className="bg-emerald-50/50 p-4 rounded-2xl space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2"><span className="text-lg">☀️</span><span className="text-sm font-bold text-emerald-700">天气感知</span></div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={rtWeatherEnabled} onChange={e => setRtWeatherEnabled(e.target.checked)} className="sr-only peer" />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                            </label>
                        </div>
                        {rtWeatherEnabled && (
                            <div className="space-y-2">
                                <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">OpenWeatherMap API Key</label>
                                    <input type="password" value={rtWeatherKey} onChange={e => setRtWeatherKey(e.target.value)} className="w-full bg-white/80 border border-emerald-200 rounded-xl px-3 py-2 text-sm font-mono" placeholder="获取: openweathermap.org" /></div>
                                <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">城市 (英文)</label>
                                    <input type="text" value={rtWeatherCity} onChange={e => setRtWeatherCity(e.target.value)} className="w-full bg-white/80 border border-emerald-200 rounded-xl px-3 py-2 text-sm" placeholder="Beijing, Shanghai, etc." /></div>
                                <button onClick={testWeatherApi} className="w-full py-2 bg-emerald-100 text-emerald-600 text-xs font-bold rounded-xl active:scale-95 transition-transform">测试天气API</button>
                            </div>
                        )}
                    </div>

                    {/* 新闻配置 */}
                    <div className="bg-blue-50/50 p-4 rounded-2xl space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2"><span className="text-lg">📰</span><span className="text-sm font-bold text-blue-700">新闻热点</span></div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={rtNewsEnabled} onChange={e => setRtNewsEnabled(e.target.checked)} className="sr-only peer" />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                            </label>
                        </div>
                        {rtNewsEnabled && (
                            <div className="space-y-2">
                                <p className="text-xs text-blue-600/70">默认使用 Hacker News（英文科技新闻）。配置 Brave API 可获取中文新闻。</p>
                                <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Brave Search API Key (推荐)</label>
                                    <input type="password" value={rtNewsApiKey} onChange={e => setRtNewsApiKey(e.target.value)} className="w-full bg-white/80 border border-blue-200 rounded-xl px-3 py-2 text-sm font-mono" placeholder="获取: brave.com/search/api" /></div>
                                <p className="text-[10px] text-blue-500/70">免费2000次/月，支持中文新闻。<br />不配置则用 Hacker News（英文科技新闻）。</p>
                            </div>
                        )}
                    </div>

                    {/* Notion 配置 */}
                    <div className="bg-orange-50/50 p-4 rounded-2xl space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2"><span className="text-lg">📝</span><span className="text-sm font-bold text-orange-700">Notion 日记</span></div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={rtNotionEnabled} onChange={e => setRtNotionEnabled(e.target.checked)} className="sr-only peer" />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                            </label>
                        </div>
                        {rtNotionEnabled && (
                            <div className="space-y-2">
                                <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Notion Integration Token</label>
                                    <input type="password" value={rtNotionKey} onChange={e => setRtNotionKey(e.target.value)} className="w-full bg-white/80 border border-orange-200 rounded-xl px-3 py-2 text-sm font-mono" placeholder="secret_..." /></div>
                                <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Database ID</label>
                                    <input type="text" value={rtNotionDbId} onChange={e => setRtNotionDbId(e.target.value)} className="w-full bg-white/80 border border-orange-200 rounded-xl px-3 py-2 text-sm font-mono" placeholder="从数据库URL复制" /></div>
                                <button onClick={testNotionApi} className="w-full py-2 bg-orange-100 text-orange-600 text-xs font-bold rounded-xl active:scale-95 transition-transform">测试Notion连接</button>
                                <div className="border-t border-orange-200/50 pt-2 mt-2">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">笔记数据库 ID（可选）</label>
                                    <input type="text" value={rtNotionNotesDbId} onChange={e => setRtNotionNotesDbId(e.target.value)} className="w-full bg-white/80 border border-orange-200 rounded-xl px-3 py-2 text-sm font-mono" placeholder="用户日常笔记的数据库ID" />
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

                    {/* 飞书配置 */}
                    <div className="bg-indigo-50/50 p-4 rounded-2xl space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2"><span className="text-lg">📒</span><span className="text-sm font-bold text-indigo-700">飞书日记</span><span className="text-[9px] bg-indigo-100 text-indigo-500 px-1.5 py-0.5 rounded-full">中国区</span></div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={rtFeishuEnabled} onChange={e => setRtFeishuEnabled(e.target.checked)} className="sr-only peer" />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
                            </label>
                        </div>
                        <p className="text-[10px] text-indigo-500/70 leading-relaxed">Notion 的中国区替代方案，无需翻墙。使用飞书多维表格存储日记。</p>
                        {rtFeishuEnabled && (
                            <div className="space-y-2">
                                <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">飞书 App ID</label><input type="text" value={rtFeishuAppId} onChange={e => setRtFeishuAppId(e.target.value)} className="w-full bg-white/80 border border-indigo-200 rounded-xl px-3 py-2 text-sm font-mono" placeholder="cli_xxxxxxxx" /></div>
                                <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">飞书 App Secret</label><input type="password" value={rtFeishuAppSecret} onChange={e => setRtFeishuAppSecret(e.target.value)} className="w-full bg-white/80 border border-indigo-200 rounded-xl px-3 py-2 text-sm font-mono" placeholder="xxxxxxxxxxxxxxxx" /></div>
                                <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">多维表格 App Token</label><input type="text" value={rtFeishuBaseId} onChange={e => setRtFeishuBaseId(e.target.value)} className="w-full bg-white/80 border border-indigo-200 rounded-xl px-3 py-2 text-sm font-mono" placeholder="从多维表格URL中获取" /></div>
                                <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">数据表 Table ID</label><input type="text" value={rtFeishuTableId} onChange={e => setRtFeishuTableId(e.target.value)} className="w-full bg-white/80 border border-indigo-200 rounded-xl px-3 py-2 text-sm font-mono" placeholder="tblxxxxxxxx" /></div>
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

                    {/* 小红书 MCP */}
                    <div className="bg-red-50/50 p-4 rounded-2xl space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2"><span className="text-lg">📕</span><span className="text-sm font-bold text-red-700">小红书 MCP</span><span className="text-[9px] bg-red-100 text-red-500 px-1.5 py-0.5 rounded-full">浏览器自动化</span></div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={rtXhsMcpEnabled} onChange={e => { setRtXhsMcpEnabled(e.target.checked); setRtXhsEnabled(e.target.checked); }} className="sr-only peer" />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500"></div>
                            </label>
                        </div>
                        <p className="text-[10px] text-red-500/70 leading-relaxed">通过 MCP Server（浏览器自动化）操作小红书。角色可以搜索、浏览、发帖、评论。</p>
                        {rtXhsMcpEnabled && (
                            <div className="space-y-2">
                                <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">MCP Server URL</label><input value={rtXhsMcpUrl} onChange={e => setRtXhsMcpUrl(e.target.value)} className="w-full bg-white/80 border border-red-200 rounded-xl px-3 py-2 text-[11px] font-mono" placeholder="http://localhost:18060/mcp" /></div>
                                <button onClick={testXhsMcp} className="w-full py-2 bg-red-100 text-red-600 text-xs font-bold rounded-xl active:scale-95 transition-transform">测试 MCP 连接</button>
                                <div className="grid grid-cols-2 gap-2">
                                    <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">小红书昵称</label><input value={rtXhsNickname} onChange={e => setRtXhsNickname(e.target.value)} className="w-full bg-white/80 border border-red-200 rounded-xl px-3 py-2 text-[11px]" placeholder="手动填写（MCP检测可能不准）" /></div>
                                    <div><label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">用户 ID</label><input value={rtXhsUserId} onChange={e => setRtXhsUserId(e.target.value)} className="w-full bg-white/80 border border-red-200 rounded-xl px-3 py-2 text-[11px] font-mono" placeholder="可选，用于查看主页" /></div>
                                </div>
                                <p className="text-[10px] text-red-500/70 leading-relaxed">
                                    需要部署 xiaohongshu-mcp 并保持登录。在角色聊天设置中单独开关小红书。<br />
                                    昵称和用户ID用于"查看自己的主页"功能。MCP自动检测可能不准，建议手动填写。<br />
                                    项目: github.com/xpzouying/xiaohongshu-mcp
                                </p>
                            </div>
                        )}
                    </div>

                    {/* 测试状态 */}
                    {rtTestStatus && (
                        <div className={`p-3 rounded-xl text-xs font-medium text-center ${rtTestStatus.includes('成功') ? 'bg-emerald-100 text-emerald-700' : rtTestStatus.includes('失败') || rtTestStatus.includes('错误') ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
                            {rtTestStatus}
                        </div>
                    )}
                </div>
            </Modal>
        </>
    );
};

export default RealtimeSettings;
