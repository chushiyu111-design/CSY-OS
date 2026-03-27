
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { getBackendUrl } from '../utils/backendClient';
import { useOS } from '../context/OSContext';
import { haptic } from '../utils/haptics';

/* ────────── Types ────────── */

interface CharStats {
    charId: string;
    memories: number;
    relations: number;
    temporalEdges: number;
    semanticEdges: number;
    linkedCount: number;
    unscannedCount: number;
}

interface PerCharStatsResponse {
    characters: CharStats[];
    graph: { nodes: number; edges: number };
}

interface BackfillResult {
    success: boolean;
    dryRun: boolean;
    characters: { charId: string; memoryCount: number; linksCreated: number; edgesCreated: number; skipped?: boolean }[];
    totals: { memories: number; linksCreated: number; edgesCreated: number };
    verification: { charId: string; total: number; withPrev: number; withNext: number; expected: number; complete: boolean }[];
    graphStats: { nodes: number; edges: number };
}

interface SemanticResult {
    success: boolean;
    dryRun: boolean;
    results: { charId: string; total: number; needsEdges: number; queued: number }[];
    totalQueued: number;
    note: string;
}

/* ────────── Component ────────── */

const CognitiveNetworkApp: React.FC = () => {
    const { closeApp, addToast, characters } = useOS();
    const [allStats, setAllStats] = useState<PerCharStatsResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [selectedCharId, setSelectedCharId] = useState<string | null>(null); // null = 全部
    const [backfillResult, setBackfillResult] = useState<BackfillResult | null>(null);
    const [semanticResult, setSemanticResult] = useState<SemanticResult | null>(null);
    const [backfilling, setBackfilling] = useState(false);
    const [semanticRunning, setSemanticRunning] = useState(false);
    const [showConfirm, setShowConfirm] = useState<'temporal' | 'semantic' | 'rescan' | null>(null);
    const [queueStatus, setQueueStatus] = useState<{ total: number; done: number; errors: number; isCircuitBroken: boolean } | null>(null);
    const [polling, setPolling] = useState(false);

    const charNameMap = useCallback((charId: string) => {
        const found = characters.find(c => c.id === charId);
        return found?.name || charId.slice(0, 12);
    }, [characters]);

    const charAvatarMap = useCallback((charId: string) => {
        const found = characters.find(c => c.id === charId);
        return found?.avatar || '';
    }, [characters]);

    const authHeaders = useCallback(() => {
        const h: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('csyos_backend_token') || 'csyos-secret-2024'}`,
        };
        const subKey = localStorage.getItem('sub_api_key') || '';
        const subUrl = localStorage.getItem('sub_api_base_url') || '';
        const subModel = localStorage.getItem('sub_api_model') || '';
        if (subKey) h['X-LLM-Key'] = subKey;
        if (subUrl) h['X-LLM-Base-URL'] = subUrl;
        if (subModel) h['X-LLM-Model'] = subModel;
        return h;
    }, []);

    const backendUrl = getBackendUrl();
    const isConnected = !!backendUrl;
    const hasSubApi = !!localStorage.getItem('sub_api_key');

    // 当前选中角色的数据
    const currentStats = useMemo(() => {
        if (!allStats) return null;
        if (!selectedCharId) {
            // 聚合
            return allStats.characters.reduce((acc, c) => ({
                memories: acc.memories + c.memories,
                relations: acc.relations + c.relations,
                temporalEdges: acc.temporalEdges + c.temporalEdges,
                semanticEdges: acc.semanticEdges + c.semanticEdges,
                linkedCount: acc.linkedCount + c.linkedCount,
                unscannedCount: acc.unscannedCount + c.unscannedCount,
            }), { memories: 0, relations: 0, temporalEdges: 0, semanticEdges: 0, linkedCount: 0, unscannedCount: 0 });
        }
        return allStats.characters.find(c => c.charId === selectedCharId) || null;
    }, [allStats, selectedCharId]);

    // 自动加载
    useEffect(() => {
        if (isConnected && !allStats) fetchStats();
    }, [isConnected]);

    const fetchStats = useCallback(async () => {
        const url = getBackendUrl();
        if (!url) return;
        setLoading(true);
        try {
            const resp = await fetch(`${url}/api/graph/stats-by-char`, { headers: authHeaders() });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            setAllStats(await resp.json());
        } catch (e: any) {
            addToast(`获取图谱状态失败: ${e.message}`, 'error');
        } finally { setLoading(false); }
    }, [authHeaders, addToast]);

    const doBackfill = useCallback(async (dryRun: boolean) => {
        const url = getBackendUrl();
        if (!url) return;
        setBackfilling(true);
        try {
            const resp = await fetch(`${url}/api/graph/backfill`, {
                method: 'POST', headers: authHeaders(), body: JSON.stringify({ dryRun }),
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const result: BackfillResult = await resp.json();
            setBackfillResult(result);
            if (!dryRun && result.success) {
                addToast(`✨ 时序关联编织完成`, 'success');
                fetchStats();
            }
        } catch (e: any) { addToast(`操作失败: ${e.message}`, 'error'); }
        finally { setBackfilling(false); setShowConfirm(null); }
    }, [authHeaders, addToast, fetchStats]);

    const doSemanticBackfill = useCallback(async (dryRun: boolean, forceRescan = false) => {
        const url = getBackendUrl();
        if (!url) return;
        setSemanticRunning(true);
        try {
            const body: any = { dryRun, forceRescan };
            if (selectedCharId) body.charId = selectedCharId;
            const resp = await fetch(`${url}/api/graph/backfill-semantic`, {
                method: 'POST', headers: authHeaders(), body: JSON.stringify(body),
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const result: SemanticResult = await resp.json();
            setSemanticResult(result);
            if (!dryRun && result.success) {
                if (result.totalQueued === 0) {
                    addToast(`✅ 所有记忆已关联完毕`, 'success');
                    setShowConfirm('rescan');
                } else {
                    addToast(`🧠 已提交 ${result.totalQueued} 条记忆到关联分析队列`, 'success');
                    setPolling(true);
                }
            }
        } catch (e: any) { addToast(`操作失败: ${e.message}`, 'error'); }
        finally { setSemanticRunning(false); setShowConfirm(prev => prev === 'semantic' ? null : prev); }
    }, [authHeaders, addToast, selectedCharId]);

    // 队列进度轮询
    useEffect(() => {
        if (!polling) return;
        const url = getBackendUrl();
        if (!url) return;

        const interval = setInterval(async () => {
            try {
                const resp = await fetch(`${url}/api/graph/queue`, { headers: authHeaders() });
                if (!resp.ok) return;
                const data = await resp.json();
                setQueueStatus(data);
                if (data.total > 0 && (data.done + data.errors >= data.total || data.isCircuitBroken)) {
                    setPolling(false);
                    fetchStats();
                }
            } catch { /* ignore */ }
        }, 5000);

        (async () => {
            try {
                const resp = await fetch(`${url}/api/graph/queue`, { headers: authHeaders() });
                if (resp.ok) setQueueStatus(await resp.json());
            } catch {}
        })();

        return () => clearInterval(interval);
    }, [polling, authHeaders, fetchStats]);

    /* ────────── Render ────────── */
    return (
        <div className="w-full h-full bg-gradient-to-b from-slate-50 to-white flex flex-col overflow-hidden">
            {/* Header */}
            <header className="shrink-0 flex items-center gap-3 px-4 pt-4 pb-2">
                <button
                    onClick={() => { haptic.light(); closeApp(); }}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 active:bg-slate-200 transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-slate-500">
                        <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
                    </svg>
                </button>
                <h1 className="text-lg font-bold text-slate-800 tracking-tight">认知网络</h1>
            </header>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-8 space-y-4">

                {/* ═══ Hero ═══ */}
                <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500 p-6 shadow-xl">
                    <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZyIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIxIiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDgpIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCBmaWxsPSJ1cmwoI2cpIiB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIi8+PC9zdmc+')] opacity-40" />
                    <div className="relative">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-white/80 text-lg">🧬</span>
                            <span className="text-[10px] font-bold text-white/50 tracking-[0.2em] uppercase">Cognitive Network</span>
                        </div>
                        <h2 className="text-xl font-bold text-white tracking-tight mb-1">记忆星图</h2>
                        <p className="text-[11px] text-white/60 leading-relaxed">
                            让 TA 的回忆不再是孤立的碎片，而是一张<br/>有温度、有脉络的记忆星图 ✨
                        </p>
                    </div>
                </section>

                {/* ═══ Character Tabs ═══ */}
                {allStats && allStats.characters.length > 0 && (
                    <section className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
                        {/* 全部 Tab */}
                        <button
                            onClick={() => { haptic.light(); setSelectedCharId(null); }}
                            className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[11px] font-bold transition-all active:scale-95 ${
                                !selectedCharId
                                    ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-md shadow-violet-200/50'
                                    : 'bg-white/70 text-slate-500 border border-slate-200/60'
                            }`}
                        >
                            <span className="text-sm">✨</span>
                            全部
                        </button>

                        {/* Per-char tabs */}
                        {allStats.characters.map(cs => {
                            const isActive = selectedCharId === cs.charId;
                            const avatar = charAvatarMap(cs.charId);
                            return (
                                <button
                                    key={cs.charId}
                                    onClick={() => { haptic.light(); setSelectedCharId(cs.charId); }}
                                    className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[11px] font-bold transition-all active:scale-95 ${
                                        isActive
                                            ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-md shadow-violet-200/50'
                                            : 'bg-white/70 text-slate-500 border border-slate-200/60'
                                    }`}
                                >
                                    {avatar ? (
                                        <img src={avatar} className="w-5 h-5 rounded-full object-cover" alt="" />
                                    ) : (
                                        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-violet-200 to-indigo-200 flex items-center justify-center text-[9px] text-violet-500 font-bold">
                                            {charNameMap(cs.charId).charAt(0)}
                                        </div>
                                    )}
                                    {charNameMap(cs.charId)}
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/20' : 'bg-slate-100 text-slate-400'}`}>
                                        {cs.memories}
                                    </span>
                                </button>
                            );
                        })}
                    </section>
                )}

                {/* ═══ Stats Dashboard ═══ */}
                {!isConnected ? (
                    <section className="bg-white/60 backdrop-blur-sm rounded-[24px] p-6 shadow-sm border border-white/50 text-center">
                        <div className="text-3xl mb-3 opacity-60">🔌</div>
                        <p className="text-xs text-slate-400">请先在「向量记忆引擎」中配置后端连接</p>
                    </section>
                ) : currentStats ? (
                    <section className="bg-white/70 backdrop-blur-sm rounded-[24px] p-5 shadow-sm border border-white/50">
                        <div className="grid grid-cols-2 gap-3">
                            {[
                                { value: currentStats.memories, label: '记忆碎片', icon: '💎', gradient: 'from-indigo-50 to-violet-50', border: 'border-indigo-100/60', text: 'text-indigo-700', sub: 'text-indigo-300' },
                                { value: currentStats.semanticEdges, label: '语义关联', icon: '🧠', gradient: 'from-violet-50 to-fuchsia-50', border: 'border-violet-100/60', text: 'text-violet-700', sub: 'text-violet-300' },
                                { value: currentStats.temporalEdges, label: '时序脉络', icon: '⏳', gradient: 'from-rose-50 to-pink-50', border: 'border-rose-100/60', text: 'text-rose-700', sub: 'text-rose-300' },
                                { value: currentStats.linkedCount, label: '链表覆盖', icon: '🔗', gradient: 'from-teal-50 to-emerald-50', border: 'border-teal-100/60', text: 'text-teal-700', sub: 'text-teal-300' },
                            ].map((item, i) => (
                                <div key={i} className={`bg-gradient-to-br ${item.gradient} rounded-[20px] p-4 border ${item.border}`}>
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <span className="text-sm">{item.icon}</span>
                                        <span className={`text-[9px] font-semibold ${item.sub} tracking-wider`}>{item.label}</span>
                                    </div>
                                    <div className={`text-[28px] font-extrabold ${item.text} tracking-tight leading-none`}>{item.value}</div>
                                </div>
                            ))}
                        </div>

                        {/* 未扫描提示 */}
                        {currentStats.unscannedCount > 0 && (
                            <div className="mt-3 px-3 py-2 bg-amber-50/80 border border-amber-100 rounded-xl flex items-center gap-2">
                                <span className="text-sm">📎</span>
                                <p className="text-[10px] text-amber-600/80 font-medium">
                                    {currentStats.unscannedCount} 条记忆尚未进行语义分析
                                </p>
                            </div>
                        )}

                        <button onClick={fetchStats} disabled={loading}
                            className="w-full mt-3 py-2 text-[10px] text-slate-300 font-medium active:text-slate-400 transition-colors disabled:opacity-40">
                            {loading ? '刷新中...' : '↻ 刷新统计'}
                        </button>
                    </section>
                ) : (
                    <section className="flex justify-center py-6">
                        <div className="w-6 h-6 border-2 border-violet-200 border-t-violet-500 rounded-full animate-spin" />
                    </section>
                )}

                {/* ═══ 时序记忆编织 ═══ */}
                <section className="bg-white/70 backdrop-blur-sm rounded-[24px] p-5 shadow-sm border border-white/50">
                    <div className="flex items-center gap-2.5 mb-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-sm shadow-sm">⛓️</div>
                        <div>
                            <h3 className="text-[13px] font-bold text-slate-700">时序记忆编织</h3>
                            <p className="text-[9px] text-slate-400">按时间线串联记忆，让联想沿着故事脉络延伸</p>
                        </div>
                    </div>

                    <div className="flex gap-2 mt-3">
                        <button onClick={() => doBackfill(true)} disabled={backfilling || !isConnected}
                            className="flex-1 py-3 bg-slate-50/80 border border-slate-200/80 rounded-2xl text-[11px] font-semibold text-slate-500 active:scale-[0.97] transition-all disabled:opacity-40">
                            {backfilling ? <Spinner /> : '👁 预览'}
                        </button>
                        <button onClick={() => setShowConfirm('temporal')} disabled={backfilling || !isConnected}
                            className="flex-[2] py-3 bg-gradient-to-r from-amber-500 to-orange-500 rounded-2xl text-[11px] font-bold text-white active:scale-[0.97] transition-all disabled:opacity-40 shadow-sm shadow-amber-200/50">
                            ✨ 开始编织
                        </button>
                    </div>

                    {showConfirm === 'temporal' && (
                        <ConfirmBar text="安全操作，可重复执行。确定开始编织时序关联？"
                            loading={backfilling} onCancel={() => setShowConfirm(null)} onConfirm={() => doBackfill(false)} />
                    )}
                </section>

                {/* ═══ 语义关联发现 ═══ */}
                <section className="bg-white/70 backdrop-blur-sm rounded-[24px] p-5 shadow-sm border border-white/50">
                    <div className="flex items-center gap-2.5 mb-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center text-white text-sm shadow-sm">🧠</div>
                        <div>
                            <h3 className="text-[13px] font-bold text-slate-700">深层语义关联</h3>
                            <p className="text-[9px] text-slate-400">
                                AI 分析记忆间的深层联系 · 需要副 API
                                {selectedCharId && <span className="text-violet-400"> · 仅对「{charNameMap(selectedCharId)}」生效</span>}
                            </p>
                        </div>
                    </div>

                    {!hasSubApi && (
                        <div className="mt-2 px-3 py-2.5 bg-violet-50/60 border border-violet-100 rounded-xl">
                            <p className="text-[10px] text-violet-400">请先配置「副 API」后使用此功能</p>
                        </div>
                    )}

                    <div className="flex gap-2 mt-3">
                        <button onClick={() => doSemanticBackfill(true)} disabled={semanticRunning || !isConnected || !hasSubApi}
                            className="flex-1 py-3 bg-slate-50/80 border border-slate-200/80 rounded-2xl text-[11px] font-semibold text-slate-500 active:scale-[0.97] transition-all disabled:opacity-40">
                            {semanticRunning ? <Spinner /> : '👁 预览'}
                        </button>
                        <button onClick={() => setShowConfirm('semantic')} disabled={semanticRunning || !isConnected || !hasSubApi}
                            className="flex-[2] py-3 bg-gradient-to-r from-violet-500 to-fuchsia-600 rounded-2xl text-[11px] font-bold text-white active:scale-[0.97] transition-all disabled:opacity-40 shadow-sm shadow-violet-200/50">
                            🧠 发现关联
                        </button>
                    </div>

                    {showConfirm === 'semantic' && (
                        <ConfirmBar text={selectedCharId
                            ? `将使用副 API 分析「${charNameMap(selectedCharId)}」的记忆关联。确定开始？`
                            : '将使用副 API 分析所有记忆关联（会消耗 token）。确定开始？'}
                            loading={semanticRunning} onCancel={() => setShowConfirm(null)} onConfirm={() => doSemanticBackfill(false)}
                            color="violet" />
                    )}

                    {showConfirm === 'rescan' && (
                        <div className="mt-3 p-3.5 rounded-2xl border bg-emerald-50/60 border-emerald-200/60">
                            <p className="text-[10px] text-emerald-600/80 mb-3 leading-relaxed">✅ 所有记忆已全部完成语义关联分析。如果需要重新扫描（如修改了 AI 模型），可以强制重新开始。</p>
                            <div className="flex gap-2">
                                <button onClick={() => setShowConfirm(null)} className="flex-1 py-2 bg-white/80 border border-slate-200 rounded-xl text-[10px] font-semibold text-slate-400">关闭</button>
                                <button onClick={() => { setShowConfirm(null); doSemanticBackfill(false, true); }} disabled={semanticRunning}
                                    className="flex-1 py-2 bg-emerald-500 text-white rounded-xl text-[10px] font-bold disabled:opacity-50">
                                    🔄 强制重扫
                                </button>
                            </div>
                        </div>
                    )}
                </section>

                {/* ═══ 实时进度 ═══ */}
                {queueStatus && queueStatus.total > 0 && (
                    <section className="bg-white/70 backdrop-blur-sm rounded-[24px] p-5 shadow-sm border border-white/50">
                        <div className="flex items-center gap-2 mb-3">
                            {polling ? (
                                <div className="w-5 h-5 border-2 border-violet-200 border-t-violet-500 rounded-full animate-spin" />
                            ) : (
                                <span className="text-base">{queueStatus.isCircuitBroken ? '⚠️' : '✅'}</span>
                            )}
                            <h3 className="text-[13px] font-bold text-slate-700 flex-1">
                                {polling ? '关联分析进行中...' : queueStatus.isCircuitBroken ? 'API 连接异常' : '关联分析完成'}
                            </h3>
                            <span className="text-[11px] font-bold text-violet-600">
                                {queueStatus.done}/{queueStatus.total}
                            </span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-2">
                            <div
                                className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full transition-all duration-500"
                                style={{ width: `${Math.round((queueStatus.done / Math.max(1, queueStatus.total)) * 100)}%` }}
                            />
                        </div>
                        <div className="flex justify-between text-[9px] text-slate-300">
                            <span>已完成 {queueStatus.done} · 失败 {queueStatus.errors}</span>
                            <span>{Math.round((queueStatus.done / Math.max(1, queueStatus.total)) * 100)}%</span>
                        </div>
                        {queueStatus.isCircuitBroken && (
                            <p className="text-[10px] text-amber-500 mt-2">连续失败次数过多，已自动暂停。请检查副 API 配置。</p>
                        )}
                    </section>
                )}

                {/* ═══ 时序编织结果 ═══ */}
                {backfillResult && (
                    <ResultCard
                        title={backfillResult.dryRun ? '时序分析预览' : '时序编织完成'}
                        isDryRun={backfillResult.dryRun}
                        items={(backfillResult.verification || [])
                            .filter(v => !selectedCharId || v.charId === selectedCharId)
                            .map(v => ({
                                name: charNameMap(v.charId),
                                avatar: charAvatarMap(v.charId),
                                count: v.total,
                                status: v.complete ? '✓ 完整' : `${v.withPrev}/${v.expected}`,
                                complete: v.complete,
                            }))}
                        stats={[
                            { value: backfillResult.totals.memories, label: '记忆' },
                            { value: backfillResult.totals.linksCreated, label: '指针更新' },
                            { value: backfillResult.totals.edgesCreated, label: '时序边' },
                        ]}
                    />
                )}

                {/* ═══ 语义分析结果 ═══ */}
                {semanticResult && (
                    <ResultCard
                        title={semanticResult.dryRun ? '语义分析预览' : '关联分析已提交'}
                        isDryRun={semanticResult.dryRun}
                        items={semanticResult.results
                            .filter(r => !selectedCharId || r.charId === selectedCharId)
                            .map(r => ({
                                name: charNameMap(r.charId),
                                avatar: charAvatarMap(r.charId),
                                count: r.total,
                                status: r.needsEdges > 0 ? `${r.needsEdges} 待分析` : '✓ 已完成',
                                complete: r.needsEdges === 0,
                            }))}
                        stats={[
                            { value: semanticResult.results.reduce((s, r) => s + r.total, 0), label: '记忆总数' },
                            { value: semanticResult.results.reduce((s, r) => s + r.needsEdges, 0), label: '待分析' },
                            { value: semanticResult.totalQueued, label: '已排队' },
                        ]}
                        note={semanticResult.dryRun ? undefined : '语义分析在后台进行，稍后刷新可查看新增关联'}
                    />
                )}

                {/* ═══ 图谱说明 ═══ */}
                {allStats && (
                    <section className="bg-white/50 backdrop-blur-sm rounded-[24px] p-5 shadow-sm border border-white/50">
                        <h3 className="text-[11px] font-bold text-slate-500 mb-3 tracking-wider">📖 数据说明</h3>
                        <div className="space-y-2 text-[10px] text-slate-400 leading-relaxed">
                            <p><span className="font-bold text-indigo-500">💎 记忆碎片</span> — 已提取的记忆条数</p>
                            <p><span className="font-bold text-violet-500">🧠 语义关联</span> — AI 分析出的记忆间深层联系（同一话题、因果关系等）</p>
                            <p><span className="font-bold text-rose-500">⏳ 时序脉络</span> — 时间顺序上相邻的记忆之间的 temporal_adjacent 边</p>
                            <p><span className="font-bold text-teal-500">🔗 链表覆盖</span> — 有 prev_id 指向前一条记忆的条数（链表完整度指标）</p>
                        </div>
                        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-[9px] text-slate-300">PPR Graph · {allStats.graph.nodes} 活跃节点 · {allStats.graph.edges} 有向边</span>
                        </div>
                    </section>
                )}

                <p className="text-[9px] text-slate-200 text-center pb-6 leading-relaxed tracking-wide">
                    Powered by PPR Graph Diffusion · Cognitive Engine
                </p>
            </div>
        </div>
    );
};

/* ────────── Sub-components ────────── */

const Spinner = () => (
    <div className="w-3.5 h-3.5 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin mx-auto" />
);

const ConfirmBar: React.FC<{
    text: string; loading: boolean; color?: 'amber' | 'violet';
    onCancel: () => void; onConfirm: () => void;
}> = ({ text, loading, color = 'amber', onCancel, onConfirm }) => {
    const isViolet = color === 'violet';
    return (
        <div className={`mt-3 p-3.5 rounded-2xl border ${isViolet ? 'bg-violet-50/60 border-violet-200/60' : 'bg-amber-50/60 border-amber-200/60'}`}>
            <p className={`text-[10px] mb-3 leading-relaxed ${isViolet ? 'text-violet-600/80' : 'text-amber-600/80'}`}>{text}</p>
            <div className="flex gap-2">
                <button onClick={onCancel} className="flex-1 py-2 bg-white/80 border border-slate-200 rounded-xl text-[10px] font-semibold text-slate-400">取消</button>
                <button onClick={onConfirm} disabled={loading}
                    className={`flex-1 py-2 text-white rounded-xl text-[10px] font-bold disabled:opacity-50 flex items-center justify-center ${isViolet ? 'bg-violet-500' : 'bg-amber-500'}`}>
                    {loading ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : '确认'}
                </button>
            </div>
        </div>
    );
};

const ResultCard: React.FC<{
    title: string; isDryRun: boolean;
    items: { name: string; avatar: string; count: number; status: string; complete: boolean }[];
    stats: { value: number; label: string }[];
    note?: string;
}> = ({ title, isDryRun, items, stats, note }) => (
    <section className="bg-white/70 backdrop-blur-sm rounded-[24px] p-5 shadow-sm border border-white/50">
        <div className="flex items-center gap-2 mb-3">
            <span className="text-base">{isDryRun ? '🔍' : '✅'}</span>
            <h3 className="text-[13px] font-bold text-slate-700 flex-1">{title}</h3>
            {isDryRun && <span className="text-[8px] bg-sky-50 text-sky-500 px-2 py-0.5 rounded-full font-bold tracking-wider">PREVIEW</span>}
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
            {stats.map((s, i) => (
                <div key={i} className="bg-slate-50/80 rounded-xl py-2 text-center">
                    <div className="text-[16px] font-bold text-slate-700">{s.value}</div>
                    <div className="text-[8px] text-slate-300 font-semibold">{s.label}</div>
                </div>
            ))}
        </div>

        {items.length > 0 && (
            <div className="space-y-1.5">
                {items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between bg-slate-50/60 rounded-xl px-3 py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                            {item.avatar ? (
                                <img src={item.avatar} className="w-6 h-6 rounded-full object-cover" alt="" />
                            ) : (
                                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center text-[10px]">
                                    {item.name.charAt(0)}
                                </div>
                            )}
                            <div className="min-w-0">
                                <div className="text-[11px] font-semibold text-slate-600 truncate">{item.name}</div>
                                <div className="text-[9px] text-slate-300">{item.count} 条记忆</div>
                            </div>
                        </div>
                        <span className={`text-[9px] font-bold px-2 py-1 rounded-lg shrink-0 ${item.complete ? 'bg-emerald-50 text-emerald-500' : 'bg-amber-50 text-amber-500'}`}>
                            {item.status}
                        </span>
                    </div>
                ))}
            </div>
        )}

        {note && <p className="text-[9px] text-slate-300 mt-3 text-center">{note}</p>}
    </section>
);

export default CognitiveNetworkApp;
