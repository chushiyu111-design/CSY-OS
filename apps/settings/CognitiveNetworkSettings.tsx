
import React, { useState, useCallback, useEffect } from 'react';
import { getBackendUrl } from '../../utils/backendClient';
import { useOS } from '../../context/OSContext';

/* ────────── Types ────────── */

interface GraphStats {
    graph: { inMemoryNodes: number; inMemoryEdges: number };
    database: { totalMemories: number; totalRelations: number; temporalEdges: number; temporallyLinked: number };
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

const CognitiveNetworkSettings: React.FC = () => {
    const { addToast, characters } = useOS();
    const [stats, setStats] = useState<GraphStats | null>(null);
    const [loading, setLoading] = useState(false);
    const [backfillResult, setBackfillResult] = useState<BackfillResult | null>(null);
    const [semanticResult, setSemanticResult] = useState<SemanticResult | null>(null);
    const [backfilling, setBackfilling] = useState(false);
    const [semanticRunning, setSemanticRunning] = useState(false);
    const [showConfirm, setShowConfirm] = useState<'temporal' | 'semantic' | 'rescan' | null>(null);
    const [queueStatus, setQueueStatus] = useState<{ total: number; done: number; errors: number; isCircuitBroken: boolean } | null>(null);
    const [polling, setPolling] = useState(false);

    // char_id → display name 映射
    const charNameMap = useCallback((charId: string) => {
        const found = characters.find(c => c.id === charId);
        return found?.name || charId.slice(0, 12);
    }, [characters]);

    const headers = useCallback(() => {
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

    // 自动加载统计
    useEffect(() => {
        if (isConnected && !stats) fetchStats();
    }, [isConnected]);

    const fetchStats = useCallback(async () => {
        const url = getBackendUrl();
        if (!url) return;
        setLoading(true);
        try {
            const resp = await fetch(`${url}/api/graph/stats`, { headers: headers() });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            setStats(await resp.json());
        } catch (e: any) {
            addToast(`获取图谱状态失败: ${e.message}`, 'error');
        } finally { setLoading(false); }
    }, [headers, addToast]);

    const doBackfill = useCallback(async (dryRun: boolean) => {
        const url = getBackendUrl();
        if (!url) return;
        setBackfilling(true);
        try {
            const resp = await fetch(`${url}/api/graph/backfill`, {
                method: 'POST', headers: headers(), body: JSON.stringify({ dryRun }),
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
    }, [headers, addToast, fetchStats]);

    const doSemanticBackfill = useCallback(async (dryRun: boolean, forceRescan = false) => {
        const url = getBackendUrl();
        if (!url) return;
        setSemanticRunning(true);
        try {
            const resp = await fetch(`${url}/api/graph/backfill-semantic`, {
                method: 'POST', headers: headers(), body: JSON.stringify({ dryRun, forceRescan }),
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
    }, [headers, addToast, fetchStats]);

    // 队列进度轮询
    useEffect(() => {
        if (!polling) return;
        const url = getBackendUrl();
        if (!url) return;

        const interval = setInterval(async () => {
            try {
                const resp = await fetch(`${url}/api/graph/queue`, { headers: headers() });
                if (!resp.ok) return;
                const data = await resp.json();
                setQueueStatus(data);

                // 完成或熔断时停止轮询
                if (data.total > 0 && (data.done + data.errors >= data.total || data.isCircuitBroken)) {
                    setPolling(false);
                    fetchStats(); // 刷新统计
                }
            } catch { /* ignore */ }
        }, 5000);

        // 立即查一次
        (async () => {
            try {
                const resp = await fetch(`${url}/api/graph/queue`, { headers: headers() });
                if (resp.ok) setQueueStatus(await resp.json());
            } catch {}
        })();

        return () => clearInterval(interval);
    }, [polling, headers, fetchStats]);

    /* ────────── Render ────────── */
    return (
        <div className="space-y-5">

            {/* ═══ Hero Section ═══ */}
            <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500 p-6 shadow-xl">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZyIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIxIiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDgpIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCBmaWxsPSJ1cmwoI2cpIiB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIi8+PC9zdmc+')] opacity-40" />
                <div className="relative">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-white/80 text-lg">🧬</span>
                        <span className="text-[10px] font-bold text-white/50 tracking-[0.2em] uppercase">Cognitive Network</span>
                    </div>
                    <h2 className="text-xl font-bold text-white tracking-tight mb-1">认知网络</h2>
                    <p className="text-[11px] text-white/60 leading-relaxed">
                        让 TA 的回忆不再是孤立的碎片，而是一张<br/>有温度、有脉络的记忆星图 ✨
                    </p>
                </div>
            </section>

            {/* ═══ 状态卡片 ═══ */}
            {!isConnected ? (
                <section className="bg-white/60 backdrop-blur-sm rounded-[24px] p-6 shadow-sm border border-white/50 text-center">
                    <div className="text-3xl mb-3 opacity-60">🔌</div>
                    <p className="text-xs text-slate-400">请先在「向量记忆引擎」中配置后端连接</p>
                </section>
            ) : stats ? (
                <section className="grid grid-cols-2 gap-3">
                    {[
                        { value: stats.database.totalMemories, label: '记忆碎片', gradient: 'from-indigo-50 to-violet-50', border: 'border-indigo-100/60', text: 'text-indigo-700', sub: 'text-indigo-300' },
                        { value: stats.database.totalRelations, label: '神经关联', gradient: 'from-violet-50 to-fuchsia-50', border: 'border-violet-100/60', text: 'text-violet-700', sub: 'text-violet-300' },
                        { value: stats.database.temporalEdges, label: '时间脉络', gradient: 'from-rose-50 to-pink-50', border: 'border-rose-100/60', text: 'text-rose-700', sub: 'text-rose-300' },
                        { value: stats.graph.inMemoryNodes, label: '活跃节点', gradient: 'from-teal-50 to-emerald-50', border: 'border-teal-100/60', text: 'text-teal-700', sub: 'text-teal-300' },
                    ].map((item, i) => (
                        <div key={i} className={`bg-gradient-to-br ${item.gradient} rounded-[20px] p-4 border ${item.border}`}>
                            <div className={`text-[28px] font-extrabold ${item.text} tracking-tight leading-none`}>{item.value}</div>
                            <div className={`text-[10px] font-semibold ${item.sub} mt-1.5 tracking-wider`}>{item.label}</div>
                        </div>
                    ))}
                    <button onClick={fetchStats} disabled={loading}
                        className="col-span-2 py-2 text-[10px] text-slate-300 font-medium active:text-slate-400 transition-colors disabled:opacity-40">
                        {loading ? '刷新中...' : '↻ 刷新'}
                    </button>
                </section>
            ) : (
                <section className="flex justify-center py-4">
                    <div className="w-6 h-6 border-2 border-violet-200 border-t-violet-500 rounded-full animate-spin" />
                </section>
            )}

            {/* ═══ 时序记忆编织 ═══ */}
            <section className="bg-white/70 backdrop-blur-sm rounded-[24px] p-5 shadow-sm border border-white/50">
                <div className="flex items-center gap-2.5 mb-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-sm shadow-sm">⛓️</div>
                    <div>
                        <h3 className="text-[13px] font-bold text-slate-700">时序记忆编织</h3>
                        <p className="text-[9px] text-slate-400">按时间线串联 TA 的记忆，让联想沿着故事脉络延伸</p>
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
                        <p className="text-[9px] text-slate-400">AI 分析记忆间的深层联系 · 需要副 API</p>
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
                    <ConfirmBar text="将使用副 API 分析记忆关联（会消耗少量 token）。确定开始？"
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

            {backfillResult && (
                <ResultCard
                    title={backfillResult.dryRun ? '时序分析预览' : '时序编织完成'}
                    isDryRun={backfillResult.dryRun}
                    items={backfillResult.verification?.map(v => ({
                        name: charNameMap(v.charId),
                        count: v.total,
                        status: v.complete ? '✓ 完整' : `${v.withPrev}/${v.expected}`,
                        complete: v.complete,
                    })) || []}
                    stats={[
                        { value: backfillResult.totals.memories, label: '记忆' },
                        { value: backfillResult.totals.linksCreated, label: '新链接' },
                        { value: backfillResult.totals.edgesCreated, label: '时序边' },
                    ]}
                />
            )}

            {semanticResult && (
                <ResultCard
                    title={semanticResult.dryRun ? '语义分析预览' : '关联分析已提交'}
                    isDryRun={semanticResult.dryRun}
                    items={semanticResult.results.map(r => ({
                        name: charNameMap(r.charId),
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

            <p className="text-[9px] text-slate-200 text-center pb-6 leading-relaxed tracking-wide">
                Powered by PPR Graph Diffusion · Cognitive Engine
            </p>
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
    items: { name: string; count: number; status: string; complete: boolean }[];
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
                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center text-[10px]">
                                {item.name.charAt(0)}
                            </div>
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

export default CognitiveNetworkSettings;
