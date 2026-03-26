
import React, { useState } from 'react';
import { useOS } from '../../context/OSContext';
import { DB } from '../../utils/db';
import { pushMemories } from '../../utils/backendClient';

const EmbeddingSettings: React.FC = () => {
    const { addToast } = useOS();

    const [embeddingProvider, setEmbeddingProvider] = useState(() => localStorage.getItem('embedding_provider') || 'openai');
    const [embeddingKey, setEmbeddingKey] = useState(() => localStorage.getItem('embedding_api_key') || '');
    const [embeddingUrl, setEmbeddingUrl] = useState(() => localStorage.getItem('embedding_base_url') || 'https://api.siliconflow.cn/v1');
    const [embeddingModel, setEmbeddingModel] = useState(() => localStorage.getItem('embedding_model') || 'BAAI/bge-m3');
    const [embeddingModels, setEmbeddingModels] = useState<string[]>([]);
    const [embeddingTestStatus, setEmbeddingTestStatus] = useState('');
    const [isLoadingEmbedModels, setIsLoadingEmbedModels] = useState(false);
    const [cohereRerankKey, setCohereRerankKey] = useState(() => localStorage.getItem('cohere_rerank_api_key') || '');
    const [rerankUsePaid, setRerankUsePaid] = useState(() => localStorage.getItem('cohere_rerank_use_paid') === 'true');

    const switchEmbeddingProvider = (provider: 'openai' | 'cohere') => {
        const oldProvider = embeddingProvider;
        if (embeddingKey.trim()) localStorage.setItem(`embedding_api_key_${oldProvider}`, embeddingKey.trim());
        const newKey = localStorage.getItem(`embedding_api_key_${provider}`) || '';
        setEmbeddingKey(newKey);
        setEmbeddingProvider(provider);
        setEmbeddingModels([]);
        setEmbeddingTestStatus('');
        if (provider === 'cohere') {
            setEmbeddingUrl(localStorage.getItem('embedding_base_url_cohere') || 'https://api.cohere.com/v2');
            setEmbeddingModel(localStorage.getItem('embedding_model_cohere') || 'embed-v4.0');
        } else {
            setEmbeddingUrl(localStorage.getItem('embedding_base_url_openai') || 'https://api.siliconflow.cn/v1');
            setEmbeddingModel(localStorage.getItem('embedding_model_openai') || 'BAAI/bge-m3');
        }
    };

    const handleSave = () => {
        const oldProvider = localStorage.getItem('embedding_provider') || 'openai';
        if (embeddingKey.trim()) {
            localStorage.setItem('embedding_provider', embeddingProvider);
            localStorage.setItem('embedding_api_key', embeddingKey.trim());
            localStorage.setItem('embedding_base_url', embeddingUrl.trim());
            localStorage.setItem('embedding_model', embeddingModel.trim());
            localStorage.setItem(`embedding_api_key_${embeddingProvider}`, embeddingKey.trim());
            localStorage.setItem(`embedding_base_url_${embeddingProvider}`, embeddingUrl.trim());
            localStorage.setItem(`embedding_model_${embeddingProvider}`, embeddingModel.trim());
            if (embeddingProvider === 'cohere' && cohereRerankKey.trim()) {
                localStorage.setItem('cohere_rerank_api_key', cohereRerankKey.trim());
            } else if (embeddingProvider !== 'cohere') {
                localStorage.removeItem('cohere_rerank_api_key');
                localStorage.removeItem('cohere_rerank_use_paid');
            }
            if (oldProvider !== embeddingProvider) {
                addToast(`已切换到 ${embeddingProvider === 'cohere' ? 'Cohere' : 'OpenAI 兼容'}。建议在「记忆中心」重新向量化已有记忆以获得最佳检索效果。`, 'info');
            } else {
                addToast('向量引擎配置已保存', 'success');
            }
        } else {
            localStorage.removeItem('embedding_api_key');
            addToast('API Key 已清除', 'info');
        }
    };

    const handleTest = async () => {
        if (!embeddingKey.trim()) { setEmbeddingTestStatus('请先填写 Key'); return; }
        setEmbeddingTestStatus('测试中...');
        try {
            const baseUrl = embeddingUrl.replace(/\/+$/, '');
            let resp;
            if (embeddingProvider === 'cohere') {
                resp = await fetch(`${baseUrl}/embed`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${embeddingKey.trim()}` },
                    body: JSON.stringify({ model: embeddingModel, texts: ['测试向量化'], input_type: 'search_document', embedding_types: ['float'] }),
                });
                if (resp.ok) {
                    const data = await resp.json();
                    const dim = data.embeddings?.float?.[0]?.length || '?';
                    setEmbeddingTestStatus(`✅ Cohere 连接成功 (${embeddingModel}, 维度: ${dim})`);
                } else {
                    const err = await resp.text();
                    setEmbeddingTestStatus(`❌ HTTP ${resp.status}: ${err.slice(0, 100)}`);
                }
            } else {
                resp = await fetch(`${baseUrl}/embeddings`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${embeddingKey.trim()}` },
                    body: JSON.stringify({ model: embeddingModel, input: '测试向量化', encoding_format: 'float' }),
                });
                if (resp.ok) {
                    const data = await resp.json();
                    const dim = data.data?.[0]?.embedding?.length || '?';
                    setEmbeddingTestStatus(`✅ 连接成功 (${embeddingModel}, 维度: ${dim})`);
                } else {
                    const err = await resp.text();
                    setEmbeddingTestStatus(`❌ HTTP ${resp.status}: ${err.slice(0, 100)}`);
                }
            }
        } catch (e: any) { setEmbeddingTestStatus(`❌ 网络错误: ${e.message}`); }
    };

    return (
        <>
        <section className="relative overflow-hidden bg-[#f0f7ee]/70 backdrop-blur-sm rounded-3xl p-6 shadow-sm border border-[#d4e8d0]/60">
            <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-gradient-to-br from-[#c8e8c0]/30 to-[#d4e4f7]/30 blur-2xl pointer-events-none" />

            <div className="relative flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-gradient-to-br from-[#c8e8c0]/60 to-[#d4e8d0]/60 backdrop-blur-sm rounded-2xl text-[#6b9b60]">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" /></svg>
                    </div>
                    <div>
                        <h2 className="text-sm font-semibold text-[#5a7a52] tracking-wider">向量记忆引擎</h2>
                        <p className="text-[10px] text-[#8bab82]">{embeddingProvider === 'cohere' ? 'Cohere Embed-v4 · 高质量检索' : 'OpenAI 兼容接口 · 默认硅基流动'}</p>
                    </div>
                </div>
            </div>

            <div className="relative space-y-4">
                {/* Provider Selector */}
                <div>
                    <label className="text-[10px] font-bold text-[#8bab82] uppercase tracking-widest mb-1.5 block pl-1">供应商</label>
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => switchEmbeddingProvider('openai')}
                            className={`py-2.5 rounded-xl text-xs font-bold transition-all ${embeddingProvider === 'openai' ? 'bg-[#6b9b60]/15 text-[#5a7a52] ring-1 ring-[#6b9b60]/30' : 'bg-white/50 text-[#8bab82] border border-[#d4e8d0]/60'}`}>
                            OpenAI 兼容
                        </button>
                        <button onClick={() => switchEmbeddingProvider('cohere')}
                            className={`py-2.5 rounded-xl text-xs font-bold transition-all ${embeddingProvider === 'cohere' ? 'bg-[#6b9b60]/15 text-[#5a7a52] ring-1 ring-[#6b9b60]/30' : 'bg-white/50 text-[#8bab82] border border-[#d4e8d0]/60'}`}>
                            Cohere
                        </button>
                    </div>
                    <p className="text-[9px] text-[#8bab82] mt-1 pl-1">
                        {embeddingProvider === 'cohere' ? 'Cohere embed-v4 + rerank-v3.5，检索质量最佳，Trial 可免费使用' : '支持硅基流动、OpenAI、智谱 等 OpenAI 兼容接口'}
                    </p>
                </div>

                {/* Base URL */}
                <div>
                    <label className="text-[10px] font-bold text-[#8bab82] uppercase tracking-widest mb-1.5 block pl-1">Base URL</label>
                    <input type="text" value={embeddingUrl} onChange={e => setEmbeddingUrl(e.target.value)}
                        placeholder={embeddingProvider === 'cohere' ? 'https://api.cohere.com/v2' : 'https://api.siliconflow.cn/v1'}
                        className="w-full bg-white/60 border border-[#d4e8d0]/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all" />
                </div>

                {/* API Key */}
                <div>
                    <label className="text-[10px] font-bold text-[#8bab82] uppercase tracking-widest mb-1.5 block pl-1">API Key</label>
                    <input type="password" value={embeddingKey} onChange={e => setEmbeddingKey(e.target.value)} placeholder="sk-..."
                        className="w-full bg-white/60 border border-[#d4e8d0]/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all" />
                    {embeddingProvider === 'cohere' ? (
                        <a href="https://dashboard.cohere.com/" target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#6b9b60] hover:underline mt-1.5 inline-block pl-1">→ 免费注册 Cohere (Production Key，embed 用)</a>
                    ) : (
                        <a href="https://cloud.siliconflow.cn/account/ak" target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#6b9b60] hover:underline mt-1.5 inline-block pl-1">→ 免费获取硅基流动 API Key (SiliconFlow)</a>
                    )}
                </div>

                {/* Cohere Rerank Trial Key */}
                {embeddingProvider === 'cohere' && (
                    <div className="bg-[#e6f0e4]/50 rounded-2xl p-3 space-y-2">
                        <label className="text-[10px] font-bold text-[#8bab82] uppercase tracking-widest block pl-1">Rerank Trial Key（免费，每月 1000 次）</label>
                        <input type="password" value={cohereRerankKey} onChange={e => setCohereRerankKey(e.target.value)} placeholder="Trial Key..."
                            className="w-full bg-white/60 border border-[#d4e8d0]/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all" />
                        <p className="text-[9px] text-[#8bab82] pl-1 leading-relaxed">
                            Rerank 用来精排检索结果，提升记忆召回质量。Trial Key 每月 1,000 次免费。
                            <br />用完后会提示是否切换到付费模式（每次约 ¥0.014，每月约 ¥86）。
                        </p>
                        {rerankUsePaid && (
                            <div className="flex items-center justify-between bg-amber-50 border border-amber-200/60 rounded-xl px-3 py-2">
                                <span className="text-[10px] text-amber-700 font-bold">⚡ Rerank 付费模式已开启</span>
                                <button onClick={() => { setRerankUsePaid(false); localStorage.setItem('cohere_rerank_use_paid', 'false'); addToast('已关闭 Rerank 付费模式，将使用 Trial Key', 'info'); }}
                                    className="text-[9px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded font-bold active:scale-95 transition-transform">关闭付费</button>
                            </div>
                        )}
                    </div>
                )}

                {/* Model Selector */}
                <div>
                    <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10px] font-bold text-[#8bab82] uppercase tracking-widest pl-1">模型</label>
                        <button
                            onClick={async () => {
                                if (!embeddingKey.trim()) { addToast('请先填写 API Key', 'info'); return; }
                                setIsLoadingEmbedModels(true);
                                try {
                                    const baseUrl = embeddingUrl.replace(/\/+$/, '');
                                    const resp = await fetch(`${baseUrl}/models`, { headers: { 'Authorization': `Bearer ${embeddingKey.trim()}` } });
                                    if (resp.ok) {
                                        const data = await resp.json();
                                        const models = (data.data || []).filter((m: any) => { const id = (m.id || '').toLowerCase(); return id.includes('embed') || id.includes('bge') || id.includes('e5') || id.includes('gte') || id.includes('jina'); }).map((m: any) => m.id as string);
                                        setEmbeddingModels(models);
                                        if (models.length === 0) addToast('未找到向量模型，可手动输入', 'info');
                                        else addToast(`拉取到 ${models.length} 个向量模型`, 'success');
                                    } else { addToast(`拉取失败: HTTP ${resp.status}`, 'error'); }
                                } catch (e: any) { addToast(`拉取失败: ${e.message}`, 'error'); }
                                finally { setIsLoadingEmbedModels(false); }
                            }}
                            disabled={isLoadingEmbedModels}
                            className="text-[10px] bg-[#e6f0e4] text-[#6b9b60] px-2 py-0.5 rounded font-bold hover:bg-[#d4e8d0] transition-colors disabled:opacity-50"
                        >{isLoadingEmbedModels ? '拉取中...' : '拉取模型'}</button>
                    </div>
                    {embeddingModels.length > 0 ? (
                        <select value={embeddingModel} onChange={e => setEmbeddingModel(e.target.value)}
                            className="w-full bg-white/60 border border-[#d4e8d0]/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all">
                            {!embeddingModels.includes(embeddingModel) && <option value={embeddingModel}>{embeddingModel}</option>}
                            {embeddingModels.map(m => {
                                const desc: Record<string, string> = {
                                    'BAAI/bge-m3': '免费 · 多语言 · 推荐', 'BAAI/bge-large-zh-v1.5': '免费 · 纯中文',
                                    'BAAI/bge-large-en-v1.5': '免费 · 纯英文', 'netease-youdao/bce-embedding-base_v1': '免费 · 中英双语',
                                    'BAAI/bge-reranker-v2-m3': '免费 · 重排序模型', 'Pro/BAAI/bge-m3': '付费Pro · 更快',
                                    'Pro/BAAI/bge-reranker-v2-m3': '付费Pro · 重排序',
                                    'Qwen/Qwen3-Embedding-8B': '付费 · 通义8B', 'Qwen/Qwen3-Embedding-4B': '付费 · 通义4B',
                                    'Qwen/Qwen3-Embedding-0.6B': '付费 · 通义0.6B · 轻量',
                                };
                                return <option key={m} value={m}>{m}{desc[m] ? ` — ${desc[m]}` : ''}</option>;
                            })}
                        </select>
                    ) : (
                        <input type="text" value={embeddingModel} onChange={e => setEmbeddingModel(e.target.value)} placeholder="BAAI/bge-m3"
                            className="w-full bg-white/60 border border-[#d4e8d0]/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all" />
                    )}
                    <p className="text-[9px] text-[#8bab82] mt-1 pl-1">
                        {embeddingProvider === 'cohere' ? '推荐: embed-v4.0（最新，检索最强）' : '推荐: BAAI/bge-m3（中文最佳）、BAAI/bge-large-zh-v1.5（纯中文）'}
                    </p>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                    <button onClick={handleSave} className="flex-1 py-3 rounded-2xl font-bold text-white shadow-lg shadow-[#6b9b60]/20 bg-gradient-to-r from-[#6b9b60] to-[#7bab70] active:scale-95 transition-all">保存</button>
                    <button onClick={handleTest} className="flex-1 py-3 rounded-2xl font-bold bg-white border border-[#d4e8d0] text-[#6b9b60] active:scale-95 transition-all">测试</button>
                </div>

                {embeddingTestStatus && (
                    <p className={`text-xs px-1 ${embeddingTestStatus.includes('✅') ? 'text-emerald-600' : embeddingTestStatus.includes('❌') ? 'text-red-500' : 'text-[#8bab82]'}`}>
                        {embeddingTestStatus}
                    </p>
                )}

                <p className="text-[10px] text-[#8bab82] leading-relaxed px-1">
                    向量记忆引擎让 AI 在每次对话时自动检索相关记忆，实现「语义理解」级别的记忆召回。支持任何 OpenAI 兼容接口。
                </p>
            </div>

            <div className="relative grid grid-cols-2 gap-2 text-center mt-4">
                <div className={`py-3 rounded-2xl text-[10px] font-bold backdrop-blur-sm ${embeddingKey ? 'bg-[#e6f5ee]/60 text-[#7faa95] border border-[#d0e8da]/50' : 'bg-[#f0ebe5]/60 text-[#b8aaa0] border border-[#e5ddd4]/50'}`}>
                    <div className="text-xs mb-1 opacity-70">{embeddingKey ? '●' : '○'}</div>
                    {embeddingKey ? '已配置' : '未配置'}
                </div>
                <div className="py-3 rounded-2xl text-[10px] font-bold bg-[#f0f7ee]/60 backdrop-blur-sm text-[#6b9b60] border border-[#d4e8d0]/50">
                    <div className="text-[9px] mb-1 font-mono opacity-70">MODEL</div>
                    {embeddingModel.split('/').pop()}
                </div>
            </div>
        </section>

        {/* Backend Pass — only token needed, URL is hardcoded */}
        <BackendPassCard />
        </>
    );
};

const BackendPassCard: React.FC = () => {
    const [backendUrl, setBackendUrlInput] = useState(() => localStorage.getItem('csyos_backend_url') || 'http://localhost:6677');
    const [token, setToken] = useState(() => localStorage.getItem('csyos_backend_token') || '');
    const [status, setStatus] = useState('');

    const handleSave = () => {
        const trimmed = token.trim();
        const trimmedUrl = backendUrl.replace(/\/+$/, '').trim();
        if (trimmedUrl) {
            localStorage.setItem('csyos_backend_url', trimmedUrl);
        } else {
            localStorage.removeItem('csyos_backend_url');
        }
        
        if (trimmed) {
            localStorage.setItem('csyos_backend_token', trimmed);
            localStorage.removeItem('csyos_backend_alive'); // invalidate cache
            setStatus('✅ 已保存，后端引擎已启用');
        } else {
            localStorage.removeItem('csyos_backend_token');
            localStorage.removeItem('csyos_backend_alive');
            setStatus('已关闭后端引擎，使用本地模式');
        }
    };

    const handleTest = async () => {
        if (!token.trim()) { setStatus('请先填写通行证密码'); return; }
        setStatus('连接中...');
        const currentUrl = backendUrl.replace(/\/+$/, '').trim() || 'http://localhost:6677';
        try {
            const resp = await fetch(`${currentUrl}/health`, {
                headers: { 'Authorization': `Bearer ${token.trim()}` },
                signal: AbortSignal.timeout(5000),
            });
            if (resp.ok) {
                const data = await resp.json();
                setStatus(`✅ 已连接 · ${data.memoryCount || 0} 条记忆 · 延迟 ${Date.now() - data.timestamp > 0 ? '<1s' : '正常'}`);
            } else {
                setStatus(`❌ 连接失败 (HTTP ${resp.status})${resp.status === 401 ? ' — 密码错误' : ''}`);
            }
        } catch (e: any) {
            setStatus(`❌ 无法连接 · ${e.message?.includes('timeout') ? '连接超时' : '服务器离线或地址错误'}`);
        }
    };

    const handleSync = async () => {
        if (!token.trim()) { setStatus('请先填写通行证密码'); return; }
        setStatus('正在打包本地记忆...');
        try {
            const chars = await DB.getAllCharacters();
            let totalSynced = 0;
            for (const c of chars) {
                const mems = await DB.getAllVectorMemories(c.id);
                if (mems.length > 0) {
                    setStatus(`正在同步 ${c.name} 的 ${mems.length} 条记忆...`);
                    const result = await pushMemories(c.id, mems);
                    if (result) totalSynced += result.synced;
                }
            }
            setStatus(`✅ 同步完成！共上传 ${totalSynced} 条记忆到云端。`);
        } catch (e: any) {
            setStatus(`❌ 同步失败: ${e.message}`);
        }
    };

    return (
        <section className="relative overflow-hidden bg-[#eef0f7]/70 backdrop-blur-sm rounded-3xl p-6 shadow-sm border border-[#d0d4e8]/60 mt-4">
            <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-gradient-to-br from-[#c0c8e8]/30 to-[#d4d8f0]/30 blur-2xl pointer-events-none" />
            
            <div className="relative flex items-center gap-3 mb-5">
                <div className="p-2.5 bg-gradient-to-br from-[#c0c8e8]/60 to-[#d0d4e8]/60 backdrop-blur-sm rounded-2xl text-[#6068a0]">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 0 1-3-3m3 3a3 3 0 1 0 0 6h13.5a3 3 0 1 0 0-6m-16.5-3a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3m-19.5 0a4.5 4.5 0 0 1 .9-2.7L5.737 5.1a3.375 3.375 0 0 1 2.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 0 1 .9 2.7m0 0a3 3 0 0 1-3 3m0 3h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Zm-3 6h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Z" /></svg>
                </div>
                <div>
                    <h2 className="text-sm font-semibold text-[#525a8a] tracking-wider">独立后端引擎</h2>
                    <p className="text-[10px] text-[#8088b8]">可选 · 启用后记忆检索在独立服务器运行</p>
                </div>
            </div>

            <div className="relative space-y-3">
                <div>
                    <label className="text-[10px] font-bold text-[#8088b8] uppercase tracking-widest mb-1.5 block pl-1">后端服务器地址</label>
                    <input
                        type="text"
                        value={backendUrl}
                        onChange={e => setBackendUrlInput(e.target.value)}
                        placeholder="例如: http://192.168.x.x:6677"
                        className="w-full bg-white/60 border border-[#d0d4e8]/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all"
                    />
                </div>
                <div>
                    <label className="text-[10px] font-bold text-[#8088b8] uppercase tracking-widest mb-1.5 block pl-1">通行证密码</label>
                    <input
                        type="password"
                        value={token}
                        onChange={e => setToken(e.target.value)}
                        placeholder="留空 = 使用本地模式（不需要后端）"
                        className="w-full bg-white/60 border border-[#d0d4e8]/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all"
                    />
                    <p className="text-[9px] text-[#8088b8] mt-1 pl-1">
                        填写后自动启用后端引擎（支持图联想等高级功能）。
                        留空则使用本地模式，功能完全不受影响。
                    </p>
                </div>

                <div className="flex gap-2">
                    <button onClick={handleSave} className="flex-1 py-2.5 rounded-2xl font-bold text-white shadow-lg shadow-[#6068a0]/20 bg-gradient-to-r from-[#6068a0] to-[#7078b0] active:scale-95 transition-all text-sm">保存</button>
                    <button onClick={handleTest} className="flex-1 py-2.5 rounded-2xl font-bold bg-white border border-[#d0d4e8] text-[#6068a0] active:scale-95 transition-all text-sm">测试连接</button>
                    {status.includes('✅ 已连接') && (
                        <button onClick={handleSync} className="flex-[1.5] py-2.5 rounded-2xl font-bold bg-[#e6eaf5] text-[#525a8a] active:scale-95 transition-all text-sm flex items-center justify-center gap-1 border border-[#d0d4e8]/50">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" /></svg>
                            一键上传记忆
                        </button>
                    )}
                </div>

                {status && (
                    <p className={`text-xs px-1 ${status.includes('✅') ? 'text-emerald-600' : status.includes('❌') ? 'text-red-500' : 'text-[#8088b8]'}`}>
                        {status}
                    </p>
                )}
            </div>

            <div className="relative mt-3">
                <div className={`py-2.5 rounded-2xl text-center text-[10px] font-bold backdrop-blur-sm ${token ? 'bg-[#e6eaf5]/60 text-[#6068a0] border border-[#d0d4e8]/50' : 'bg-[#f0ebe5]/60 text-[#b8aaa0] border border-[#e5ddd4]/50'}`}>
                    <div className="text-xs mb-0.5 opacity-70">{token ? '●' : '○'}</div>
                    {token ? '后端引擎已启用' : '本地模式'}
                </div>
            </div>
        </section>
    );
};

export default EmbeddingSettings;
