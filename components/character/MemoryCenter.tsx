import React, { useState, useMemo, useRef, useEffect } from 'react';
import { MemoryFragment, CharacterProfile, VectorMemory, Message } from '../../types';
import Modal from '../os/Modal';
import { DEFAULT_REFINE_PROMPTS } from '../../constants/archivePrompts';
import { DB } from '../../utils/db';
import { VectorMemoryExtractor } from '../../utils/vectorMemoryExtractor';
import { EmbeddingService, getEmbeddingConfig } from '../../utils/embeddingService';

interface MemoryCenterProps {
    // Traditional Memory Props
    memories: MemoryFragment[];
    refinedMemories: Record<string, string>;
    activeMemoryMonths: string[];
    charName: string;
    userName: string;
    onRefine: (year: string, month: string, summary: string, formattedPrompt?: string) => Promise<void>;
    onDeleteMemories: (ids: string[]) => void;
    onUpdateMemory: (id: string, newSummary: string) => void;
    onToggleActiveMonth: (year: string, month: string) => void;
    onUpdateRefinedMemory: (year: string, month: string, newContent: string) => void;
    onDeleteRefinedMemory: (year: string, month: string) => void;

    // Vector Memory Props
    formData: CharacterProfile;
    handleChange: (key: keyof CharacterProfile, value: any) => void;
    addToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
    apiConfig: any;
}

const MemoryCenter: React.FC<MemoryCenterProps> = ({
    memories,
    refinedMemories,
    activeMemoryMonths,
    charName,
    userName,
    onRefine,
    onDeleteMemories,
    onUpdateMemory,
    onToggleActiveMonth,
    onUpdateRefinedMemory,
    onDeleteRefinedMemory,
    formData,
    handleChange,
    addToast,
    apiConfig
}) => {
    // --- Global State ---
    const [activeTab, setActiveTab] = useState<'timeline' | 'vector' | 'stats'>('timeline');

    // --- Timeline State (Archivist) ---
    const [viewState, setViewState] = useState<{
        level: 'root' | 'year' | 'month';
        selectedYear: string | null;
        selectedMonth: string | null;
    }>({ level: 'root', selectedYear: null, selectedMonth: null });
    
    const [isRefining, setIsRefining] = useState(false);
    const [isManageMode, setIsManageMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [editMemory, setEditMemory] = useState<MemoryFragment | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const [editingCore, setEditingCore] = useState<{ year: string, month: string, content: string } | null>(null);
    const [showCoreDeleteConfirm, setShowCoreDeleteConfirm] = useState(false);
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [archivePrompts, setArchivePrompts] = useState<{ id: string, name: string, content: string }[]>(DEFAULT_REFINE_PROMPTS);
    const [selectedPromptId, setSelectedPromptId] = useState<string>('refine_atmosphere');
    const [showPromptPanel, setShowPromptPanel] = useState(false);

    // --- Vector Memory State ---
    const [vmCount, setVmCount] = useState(0);
    const [vmList, setVmList] = useState<VectorMemory[]>([]);
    const [isBatching, setIsBatching] = useState(false);
    const [batchProgress, setBatchProgress] = useState('');
    const [batchStart, setBatchStart] = useState('1');
    const [batchEnd, setBatchEnd] = useState('100');
    const [totalMsgCount, setTotalMsgCount] = useState(0);
    
    const [searchQuery, setSearchQuery] = useState('');
    const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'importance' | 'frequent'>('newest');
    const [expandedVmId, setExpandedVmId] = useState<string | null>(null);
    const [sourceMessages, setSourceMessages] = useState<Record<string, Message[]>>({});
    const [loadingSource, setLoadingSource] = useState(false);

    const abortRef = useRef<AbortController | null>(null);
    const [isAborting, setIsAborting] = useState(false);

    // --- 情感基因溯源 State ---
    const [isBackfilling, setIsBackfilling] = useState(false);
    const [backfillProgress, setBackfillProgress] = useState('');
    const backfillAbortRef = useRef(false);

    // --- Stats State ---
    const { tree, stats } = useMemo(() => {
        const tree: Record<string, Record<string, MemoryFragment[]>> = {};
        let totalChars = 0;
        const safeMemories = Array.isArray(memories) ? memories : [];
        safeMemories.forEach(m => {
            totalChars += m.summary.length;
            let year = '未知年份', month = '未知';
            const dateMatch = m.date.match(/(\d{4})[-/年](\d{1,2})/);
            if (dateMatch) {
                year = dateMatch[1];
                month = dateMatch[2].padStart(2, '0');
            } else if (m.date.includes('unknown')) year = '未归档';
            if (!tree[year]) tree[year] = {};
            if (!tree[year][month]) tree[year][month] = [];
            tree[year][month].push(m);
        });
        const sortedTree: typeof tree = {};
        Object.keys(tree).sort((a, b) => b.localeCompare(a)).forEach(y => {
            sortedTree[y] = {};
            Object.keys(tree[y]).sort((a, b) => b.localeCompare(a)).forEach(m => {
                sortedTree[y][m] = tree[y][m].sort((ma, mb) => mb.date.localeCompare(ma.date));
            });
        });
        return { tree: sortedTree, stats: { totalChars, count: safeMemories.length } };
    }, [memories]);

    // Initial Loads
    useEffect(() => {
        const savedPrompts = localStorage.getItem('character_refine_prompts');
        if (savedPrompts) {
            try {
                const parsed = JSON.parse(savedPrompts);
                const merged = [...DEFAULT_REFINE_PROMPTS, ...parsed.filter((p: any) => !p.id.startsWith('refine_'))];
                setArchivePrompts(merged);
            } catch (e) { }
        }
    }, []);

    useEffect(() => {
        if (formData?.id) {
            refreshVmList();
            DB.getMessagesByCharId(formData.id).then(msgs => {
                const chatMsgs = msgs.filter(m => (m.role === 'user' || m.role === 'assistant') && (m.type === 'text' || m.type === 'call_log'));
                setTotalMsgCount(chatMsgs.length);
                setBatchEnd(String(chatMsgs.length));
            }).catch(() => {});
        }
    }, [formData?.id, formData?.vectorMemoryEnabled]);

    const refreshVmList = async () => {
        if (!formData?.id) return;
        const mems = await DB.getAllVectorMemories(formData.id);
        setVmList(mems);
        setVmCount(mems.length);
    };

    // --- Timeline Handlers ---
    const handleYearClick = (year: string) => setViewState({ level: 'year', selectedYear: year, selectedMonth: null });
    const handleMonthClick = (month: string) => setViewState(prev => ({ ...prev, level: 'month', selectedMonth: month }));
    const handleBack = () => {
        if (viewState.level === 'month') setViewState(prev => ({ ...prev, level: 'year', selectedMonth: null }));
        else if (viewState.level === 'year') setViewState({ level: 'root', selectedYear: null, selectedMonth: null });
    };

    const triggerRefine = async () => {
        if (!viewState.selectedYear || !viewState.selectedMonth) return;
        setIsRefining(true);
        const monthMems = tree[viewState.selectedYear][viewState.selectedMonth];
        const combinedText = monthMems.map(m => `${m.date}: ${m.summary} (${m.mood || '无'})`).join('\n');

        let formattedPrompt: string | undefined;
        const templateObj = archivePrompts.find(p => p.id === selectedPromptId);
        if (templateObj) {
            const dateStr = `${viewState.selectedYear}-${viewState.selectedMonth}`;
            formattedPrompt = templateObj.content
                .replace(/\$\{dateStr\}/g, dateStr)
                .replace(/\$\{char\.name\}/g, charName)
                .replace(/\$\{userProfile\.name\}/g, userName)
                .replace(/\$\{rawLog.*?\}/g, combinedText.substring(0, 10000));
            formattedPrompt = `[角色记忆精炼: ${charName} - ${dateStr}]\n${formattedPrompt}`;
        }

        try { await onRefine(viewState.selectedYear, viewState.selectedMonth, combinedText, formattedPrompt); } finally { setIsRefining(false); }
    };

    const toggleSelection = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelectedIds(next);
    };

    const requestDelete = () => { if (selectedIds.size > 0) setShowDeleteConfirm(true); };
    const performDelete = () => { onDeleteMemories(Array.from(selectedIds)); setSelectedIds(new Set()); setIsManageMode(false); setShowDeleteConfirm(false); };

    const handleCoreTouchStart = (content: string) => {
        if (!viewState.selectedYear || !viewState.selectedMonth) return;
        const y = viewState.selectedYear;
        const m = viewState.selectedMonth;
        longPressTimer.current = setTimeout(() => {
            setEditingCore({ year: y, month: m, content });
        }, 600);
    };

    const handleCoreTouchEnd = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const saveCoreEdit = () => {
        if (editingCore) {
            onUpdateRefinedMemory(editingCore.year, editingCore.month, editingCore.content);
            setEditingCore(null);
        }
    };

    const confirmCoreDelete = () => {
        if (editingCore) {
            onDeleteRefinedMemory(editingCore.year, editingCore.month);
            setEditingCore(null);
            setShowCoreDeleteConfirm(false);
        }
    };

    // --- Vector Handlers ---
    const handleDeleteMemory = async (id: string) => {
        await DB.deleteVectorMemory(id);
        setVmList(prev => prev.filter(m => m.id !== id));
        setVmCount(prev => prev - 1);
        addToast('已删除', 'info');
    };

    const handleBatchChat = async () => {
        const embKey = localStorage.getItem('embedding_api_key');
        if (!embKey) { addToast('请先在设置中配置 Embedding API Key', 'error'); return; }

        // Use secondary API if configured, otherwise fall back to main API
        const subKey = localStorage.getItem('sub_api_key');
        const subUrl = localStorage.getItem('sub_api_base_url');
        const subModel = localStorage.getItem('sub_api_model');
        const extractConfig = (subKey && subUrl && subModel)
            ? { baseUrl: subUrl, apiKey: subKey, model: subModel }
            : apiConfig;

        if (!extractConfig?.apiKey) { addToast('请先在设置中配置 API（主 API 或副 API）', 'error'); return; }

        setIsBatching(true);
        const ctrl = new AbortController();
        abortRef.current = ctrl;

        const startVal = Math.max(1, parseInt(batchStart) || 1);
        const endVal = Math.min(totalMsgCount, parseInt(batchEnd) || totalMsgCount);

        try {
            const total = await VectorMemoryExtractor.batchExtractFromMessages(
                formData.id,
                startVal - 1,
                endVal - 1,
                extractConfig,
                embKey,
                formData.name || 'AI',
                (w, tw, mc) => setBatchProgress(`窗口 ${w}/${tw}，已提取 ${mc} 条记忆`),
                ctrl.signal
            );
            addToast(`批量提取完成！共创建 ${total} 条向量记忆`, 'success');
        } catch (e: any) {
            if (e.name !== 'AbortError') addToast(`批量提取失败: ${e.message}`, 'error');
        } finally {
            setIsBatching(false);
            setIsAborting(false);
            setBatchProgress('');
            abortRef.current = null;
            refreshVmList();
        }
    };

    const handleImportToolData = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const text = ev.target?.result as string;
                const data = JSON.parse(text);

                if (data.format !== 'nuomi-vector-memory' || !Array.isArray(data.memories)) {
                    addToast('文件格式不正确，需要独立工具站导出的 JSON 合集', 'error');
                    return;
                }

                setIsBatching(true);
                let count = 0;
                for (const mem of data.memories) {
                    mem.charId = formData.id; // Map to current character
                    await DB.saveVectorMemory(mem);
                    count++;
                }
                
                addToast(`成功合入 ${count} 条外部向量记忆！`, 'success');
                refreshVmList();
            } catch (err) {
                console.error(err);
                addToast('解析导入文件失败', 'error');
            } finally {
                setIsBatching(false);
                e.target.value = '';
            }
        };
        reader.readAsText(file);
    };

    const handleImportMemories = async () => {
        const embKey = localStorage.getItem('embedding_api_key');
        if (!embKey) { addToast('请先配置 Embedding API Key', 'error'); return; }

        const items: { title: string; content: string; source: string }[] = [];
        for (const mem of memories) {
            if (mem.summary) items.push({ title: mem.date || '未标注日期', content: mem.summary, source: 'diary' });
        }
        for (const [month, text] of Object.entries(refinedMemories)) {
            if (text) items.push({ title: `${month}月精炼`, content: text, source: 'refined' });
        }

        if (items.length === 0) { addToast('没有可导入的已有记忆', 'info'); return; }

        setIsBatching(true);
        const config = getEmbeddingConfig();
        let created = 0;

        try {
            for (let i = 0; i < items.length; i++) {
                setBatchProgress(`正在向量化 ${i + 1}/${items.length}`);
                const item = items[i];
                const vector = await EmbeddingService.embed(`${item.title}: ${item.content}`, undefined, embKey);
                const newMem: VectorMemory = {
                    id: `vmem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    charId: formData.id,
                    title: item.title.slice(0, 20),
                    content: item.content.slice(0, 500),
                    importance: 5,
                    mentionCount: 0,
                    lastMentioned: 0,
                    createdAt: Date.now(),
                    vector,
                    modelId: config.model,
                    source: 'import',
                };
                await DB.saveVectorMemory(newMem);
                created++;
                if (i < items.length - 1) await new Promise(r => setTimeout(r, 200));
            }
            addToast(`导入完成！新创建 ${created} 条向量记忆`, 'success');
        } catch (e: any) {
            addToast(`导入失败: ${e.message}`, 'error');
        } finally {
            setIsBatching(false);
            setBatchProgress('');
            refreshVmList();
        }
    };

    const handleClearAll = async () => {
        if (!confirm('确认清空该角色的所有向量记忆？此操作不可撤销。')) return;
        await DB.clearVectorMemories(formData.id);
        refreshVmList();
        addToast('已清空所有向量记忆', 'info');
    };

    // --- 情感基因溯源 Handler ---
    const handleBackfillSnapshots = async () => {
        const subKey = localStorage.getItem('sub_api_key');
        const subUrl = localStorage.getItem('sub_api_base_url');
        const subModel = localStorage.getItem('sub_api_model');
        if (!subKey || !subUrl || !subModel) {
            addToast('请先在副 API 设置中配置模型（用于情感基因溯源）', 'error');
            return;
        }
        const subApiConfig = { baseUrl: subUrl, apiKey: subKey, model: subModel };

        // Find memories without hormone snapshots
        const needBackfill = vmList.filter(m => !m.hormoneSnapshot && m.sourceMessageIds && m.sourceMessageIds.length > 0);
        if (needBackfill.length === 0) {
            addToast('所有记忆已完成情感基因标注 ✓', 'info');
            return;
        }

        setIsBackfilling(true);
        backfillAbortRef.current = false;
        setBackfillProgress(`准备处理 ${needBackfill.length} 条记忆...`);

        try {
            const ids = needBackfill.map(m => m.id);
            const charName = formData.name || 'AI';

            // Process in batches of 5
            let done = 0;
            const BATCH = 5;
            for (let i = 0; i < ids.length; i += BATCH) {
                if (backfillAbortRef.current) break;
                const batch = ids.slice(i, i + BATCH);
                await VectorMemoryExtractor.backfillNewMemories(batch, charName, subApiConfig);
                done += batch.length;
                setBackfillProgress(`🧬 已处理 ${done}/${needBackfill.length} 条记忆`);
            }

            if (backfillAbortRef.current) {
                addToast(`情感基因溯源已中止（${done}/${needBackfill.length}）`, 'info');
            } else {
                addToast(`✨ 情感基因溯源完成！${done} 条记忆已标注`, 'success');
            }
        } catch (e: any) {
            addToast(`情感基因溯源失败: ${e.message}`, 'error');
        } finally {
            setIsBackfilling(false);
            setBackfillProgress('');
            refreshVmList();
        }
    };

    const toggleExpandVm = async (vmem: VectorMemory) => {
        if (expandedVmId === vmem.id) {
            setExpandedVmId(null);
            return;
        }
        setExpandedVmId(vmem.id);
        // Load source messages if they exist and haven't been loaded
        if (vmem.sourceMessageIds && vmem.sourceMessageIds.length > 0 && !sourceMessages[vmem.id]) {
            setLoadingSource(true);
            try {
                const msgs = await DB.getMessagesByIds(vmem.sourceMessageIds);
                setSourceMessages(prev => ({ ...prev, [vmem.id]: msgs }));
            } catch (err) {
                console.error("Failed to load source messages:", err);
            } finally {
                setLoadingSource(false);
            }
        }
    };

    // --- Computed Views ---
    const sortedFilteredVms = useMemo(() => {
        let list = [...vmList];
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            list = list.filter(m => m.title.toLowerCase().includes(q) || m.content.toLowerCase().includes(q));
        }
        switch (sortOrder) {
            case 'newest': list.sort((a, b) => b.createdAt - a.createdAt); break;
            case 'oldest': list.sort((a, b) => a.createdAt - b.createdAt); break;
            case 'importance': list.sort((a, b) => b.importance - a.importance); break;
            case 'frequent': list.sort((a, b) => b.mentionCount - a.mentionCount); break;
        }
        return list;
    }, [vmList, searchQuery, sortOrder]);


    // ========== RENDERERS ==========

    const renderTimelineTab = () => {
        if (!memories || memories.length === 0) return <div className="flex flex-col items-center justify-center h-48 text-slate-400"><p className="text-xs">暂无记忆档案</p></div>;

        const renderYears = () => (
            <div className="grid grid-cols-2 gap-3 animate-fade-in">
                {Object.keys(tree).map(year => (
                    <div key={year} onClick={() => handleYearClick(year)} className="bg-white/50 backdrop-blur-md p-4 rounded-3xl border border-white/60 shadow-sm active:scale-95 transition-all flex flex-col justify-between h-28 group cursor-pointer hover:bg-white/80">
                        <div className="flex justify-between items-start">
                            <div className="p-2 bg-indigo-50 rounded-xl text-indigo-500"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg></div>
                            <span className="text-[10px] bg-white/60 shadow-sm px-2 py-1 rounded-full text-slate-500 font-mono font-medium">{Object.values(tree[year]).reduce((acc, curr: any) => acc + curr.length, 0)} 项</span>
                        </div>
                        <div><h3 className="text-xl font-bold text-slate-700">{year}</h3><p className="text-[10px] text-slate-400 font-medium">年度档案归档</p></div>
                    </div>
                ))}
            </div>
        );

        const renderMonths = () => viewState.selectedYear && tree[viewState.selectedYear] && (
            <div className="grid grid-cols-3 gap-3 animate-fade-in">
                {Object.keys(tree[viewState.selectedYear]).map(month => {
                    const monthKey = `${viewState.selectedYear}-${month}`;
                    const isActive = activeMemoryMonths.includes(monthKey);
                    return (
                        <div key={month} className="relative group">
                            <div onClick={() => handleMonthClick(month)} className="bg-white/60 backdrop-blur-md p-3 rounded-3xl border border-white/60 shadow-sm active:scale-95 transition-all flex flex-col justify-center items-center gap-2 aspect-square cursor-pointer hover:bg-white/80 relative overflow-hidden">
                                {refinedMemories?.[monthKey] && <div className="absolute top-0 right-0 w-4 h-4 bg-indigo-400 rounded-bl-xl shadow-sm"></div>}
                                <span className="text-3xl font-light text-slate-700">{parseInt(month)}<span className="text-xs ml-0.5 text-slate-400 font-bold">月</span></span>
                                <div className="h-0.5 w-6 bg-indigo-200 rounded-full"></div>
                                <span className="text-[10px] font-medium text-slate-400">{tree[viewState.selectedYear!][month].length} 条记忆</span>
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); onToggleActiveMonth(viewState.selectedYear!, month); }} className={`absolute -top-1 -right-1 p-1.5 rounded-full shadow-md z-10 transition-colors ${isActive ? 'bg-indigo-500 text-white' : 'bg-white text-slate-300 border border-slate-100'}`}>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /><path fillRule="evenodd" d="M1.323 11.447C2.811 6.976 7.028 3.75 12.001 3.75c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113-1.487 4.471-5.705 7.697-10.677 7.697-4.97 0-9.186-3.223-10.675-7.69a1.762 1.762 0 0 1 0-1.113ZM17.25 12a5.25 5.25 0 1 1-10.5 0 5.25 5.25 0 0 1 10.5 0Z" clipRule="evenodd" /></svg>
                            </button>
                        </div>
                    );
                })}
            </div>
        );

        const renderMemories = () => {
            if (!viewState.selectedYear || !viewState.selectedMonth) return null;
            const key = `${viewState.selectedYear}-${viewState.selectedMonth}`;
            const refinedContent = refinedMemories?.[key];
            const rawMemories = tree[viewState.selectedYear]?.[viewState.selectedMonth] || [];
            const isActive = activeMemoryMonths.includes(key);

            const groupedByDay: Record<string, MemoryFragment[]> = {};
            rawMemories.forEach(m => { if (!groupedByDay[m.date]) groupedByDay[m.date] = []; groupedByDay[m.date].push(m); });

            if (rawMemories.length === 0) return <div className="flex flex-col items-center justify-center h-32 text-slate-300"><p className="text-xs">本月记忆已清空</p></div>;

            return (
                <div className="space-y-6 animate-fade-in pb-8">
                    {/* Core Memory Card */}
                    <div className="bg-white/70 backdrop-blur-md rounded-3xl p-4 border border-white shadow-sm relative group overflow-hidden">
                        <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-indigo-400 to-purple-400"></div>
                        <div className="flex justify-between items-start mb-3 pl-2">
                            <div className="flex items-center gap-2 text-indigo-800"><span className="text-base">💎</span><h4 className="text-[11px] font-bold tracking-widest uppercase">核心记忆上下文</h4></div>
                            <div className="flex gap-1.5">
                                <button onClick={() => setShowPromptPanel(!showPromptPanel)} className="text-[10px] bg-white text-slate-500 w-6 h-6 flex items-center justify-center rounded-full border border-slate-100 shadow-sm hover:bg-slate-50 transition-colors">
                                    ⚙️
                                </button>
                                <button onClick={triggerRefine} disabled={isRefining} className="text-[10px] bg-gradient-to-r from-indigo-500 to-purple-500 text-white px-3 py-1 rounded-full shadow-sm shadow-indigo-200 hover:opacity-90 transition-opacity flex items-center font-bold">{isRefining ? '生成中...' : (refinedContent ? '重新精炼' : 'AI 生成')}</button>
                            </div>
                        </div>
                        {showPromptPanel && (
                            <div className="mb-3 pl-2 bg-white/50 p-3 rounded-2xl border border-white">
                                <label className="text-[9px] font-bold text-slate-400 uppercase mb-2 block tracking-widest">选择精炼提示词模板</label>
                                <div className="flex flex-col gap-1.5">
                                    {archivePrompts.map(p => (
                                        <div key={p.id} onClick={() => setSelectedPromptId(p.id)} className={`px-3 py-2 rounded-xl border cursor-pointer text-xs font-bold transition-all ${selectedPromptId === p.id ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm' : 'bg-white/50 border-white text-slate-500 hover:bg-white'}`}>
                                            {p.name}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {refinedContent && (
                            <div
                                className="pl-2 text-sm text-slate-700 leading-relaxed font-medium bg-white/40 p-3 rounded-2xl border border-white cursor-pointer active:scale-[0.99] transition-transform select-none"
                                onTouchStart={() => handleCoreTouchStart(refinedContent)} onTouchEnd={handleCoreTouchEnd} onMouseDown={() => handleCoreTouchStart(refinedContent)} onMouseUp={handleCoreTouchEnd} onMouseLeave={handleCoreTouchEnd} onContextMenu={(e) => { e.preventDefault(); setEditingCore({ year: viewState.selectedYear!, month: viewState.selectedMonth!, content: refinedContent }); }}
                                title="长按编辑/删除"
                            >
                                {refinedContent}
                            </div>
                        )}
                        <div className="mt-3 pl-2 flex justify-end">
                            <button onClick={() => onToggleActiveMonth(viewState.selectedYear!, viewState.selectedMonth!)} className={`text-[9px] px-3 py-1.5 rounded-full shadow-sm transition-all font-bold tracking-wide flex items-center gap-1 ${isActive ? 'bg-indigo-500 text-white' : 'bg-white text-slate-400 border border-slate-100 hover:bg-slate-50'}`}>
                                {isActive ? '✨ 详细回忆已激活 (Token+)' : '仅注入核心记忆'}
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center justify-between px-2">
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Daily Time Logs</h4>
                        <div className="flex gap-2">
                            {isManageMode && selectedIds.size > 0 && <button onClick={(e) => { e.stopPropagation(); requestDelete(); }} className="text-[10px] bg-red-400 text-white px-3 py-1 rounded-full font-bold shadow-sm active:scale-95 transition-transform">删除 ({selectedIds.size})</button>}
                            <button onClick={() => { setIsManageMode(!isManageMode); setSelectedIds(new Set()); }} className={`text-[10px] px-3 py-1 rounded-full border shadow-sm transition-colors font-bold ${isManageMode ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-500 border-white hover:bg-slate-50'}`}>{isManageMode ? '完成管理' : '批量管理'}</button>
                        </div>
                    </div>

                    <div className="pl-2 relative">
                        {/* Continuous timeline line */}
                        <div className="absolute left-4 top-2 bottom-0 w-[2px] bg-gradient-to-b from-indigo-200 via-purple-200 to-transparent z-0"></div>
                        
                        {Object.entries(groupedByDay).map(([date, dayMemories]) => (
                            <div key={date} className="relative pl-8 pb-6 last:pb-0 z-10">
                                <div className="absolute left-[7px] top-1 w-3 h-3 bg-white rounded-full border-2 border-indigo-300 shadow-sm"></div>
                                <div className="mb-2 -mt-1 flex items-center gap-2"><span className="text-xs font-bold text-indigo-900/60 font-mono tracking-tight">{date}</span>{dayMemories.length > 1 && <span className="text-[9px] px-1.5 py-0.5 bg-white/60 shadow-sm rounded-md text-slate-400 font-bold">{dayMemories.length} 记录</span>}</div>
                                <div className="space-y-3">
                                    {dayMemories.map((mem) => (
                                        <div key={mem.id} className={`relative group transition-all duration-300 ${isManageMode ? 'cursor-pointer' : ''}`} onClick={() => { if (isManageMode) toggleSelection(mem.id); }}>
                                            {isManageMode && <div className={`absolute -left-[30px] top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border flex items-center justify-center transition-colors z-20 ${selectedIds.has(mem.id) ? 'bg-indigo-500 border-indigo-500' : 'bg-white border-slate-300'}`}>{selectedIds.has(mem.id) && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}</div>}
                                            <div className={`bg-white/80 backdrop-blur-sm p-3.5 rounded-2xl rounded-tl-sm border border-white shadow-sm hover:shadow hover:bg-white transition-all relative ${isManageMode && selectedIds.has(mem.id) ? 'ring-2 ring-indigo-400 ring-offset-1' : ''}`}>
                                                {!isManageMode && (
                                                    <button onClick={(e) => { e.stopPropagation(); setEditMemory(mem); }} className="absolute top-2 right-2 p-1.5 text-slate-300 hover:text-indigo-500 bg-transparent hover:bg-slate-50 rounded-full transition-colors z-10" title="编辑">
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>
                                                    </button>
                                                )}
                                                {mem.mood && <div className="mb-1.5 pr-6"><span className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-md font-bold uppercase tracking-wider">{mem.mood}</span></div>}
                                                <p className="text-[13px] text-slate-600 leading-relaxed text-justify whitespace-pre-wrap font-medium">{mem.summary}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            );
        };

        return (
            <div className="flex flex-col h-full relative">
                {viewState.level === 'root' && renderYears()}
                {viewState.level === 'year' && <><div className="mb-4 flex items-center gap-2"><button onClick={handleBack} className="p-1.5 bg-white/60 backdrop-blur-sm rounded-full text-slate-500 hover:text-slate-800 shadow-sm border border-white"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" /></svg></button><h3 className="text-sm font-bold text-slate-600">{viewState.selectedYear} 年度回顾</h3></div>{renderMonths()}</>}
                {viewState.level === 'month' && <><div className="mb-4 flex items-center gap-2"><button onClick={handleBack} className="p-1.5 bg-white/60 backdrop-blur-sm rounded-full text-slate-500 hover:text-slate-800 shadow-sm border border-white"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" /></svg></button><h3 className="text-sm font-bold text-slate-600">{viewState.selectedYear}年 {viewState.selectedMonth}月</h3></div>{renderMemories()}</>}
            </div>
        );
    };

    const renderVectorTab = () => {
        const windowCount = Math.max(1, Math.ceil(((parseInt(batchEnd) || 1) - (parseInt(batchStart) || 1) + 1) / 30));
        
        return (
            <div className="space-y-5 animate-fade-in relative z-0">
                {/* Policy Config Card */}
                <div className="bg-white/60 backdrop-blur-md rounded-3xl p-4 border border-white shadow-sm flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-sm">🌐</span>
                            <h3 className="text-[11px] font-bold text-slate-700 tracking-widest uppercase">向量检索服务</h3>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" checked={formData.vectorMemoryEnabled || false} onChange={e => handleChange('vectorMemoryEnabled', e.target.checked)} className="sr-only peer" />
                            <div className="w-10 h-5 bg-slate-200/50 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:shadow-sm after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-400"></div>
                        </label>
                    </div>
                    {formData.vectorMemoryEnabled && (
                        <div className="space-y-3 pt-2 border-t border-slate-100/50">
                            <div className="flex items-center justify-between">
                                <div><p className="text-[10px] font-bold text-slate-600">隐式自动提取</p><p className="text-[8px] text-slate-400">达到阈值后在后台异步提取并生成向量</p></div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" checked={formData.vectorMemoryAutoExtract !== false} onChange={e => handleChange('vectorMemoryAutoExtract', e.target.checked)} className="sr-only peer" />
                                    <div className="w-8 h-4 bg-slate-200/50 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-400"></div>
                                </label>
                            </div>
                            <div>
                                <div className="flex justify-between items-center mb-1"><label className="text-[9px] font-bold text-slate-500">提取间隔阈值</label><span className="text-[9px] text-slate-400">{formData.vectorMemoryExtractInterval || 30} 消息</span></div>
                                <input type="range" min="10" max="100" step="5" value={formData.vectorMemoryExtractInterval || 30} onChange={e => handleChange('vectorMemoryExtractInterval', parseInt(e.target.value))} className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-400" />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-slate-600 mb-1.5">Context 融和模式</p>
                                <div className="flex bg-slate-100/50 rounded-2xl p-1 gap-1 border border-white">
                                    {[
                                        { value: 'traditional' as const, label: '叠加', desc: '传统+向量' },
                                        { value: 'hybrid' as const, label: '混合', desc: '核心+向量' },
                                        { value: 'vector' as const, label: '纯向量', desc: '仅向量搜索' }
                                    ].map(opt => {
                                        const currentMode = formData.vectorMemoryMode || (formData.vectorMemoryTakeover ? 'vector' : 'hybrid');
                                        const isActive = currentMode === opt.value;
                                        return (
                                            <button key={opt.value} onClick={() => handleChange('vectorMemoryMode', opt.value)} className={`flex-1 py-1.5 rounded-xl text-center transition-all ${isActive ? 'bg-white shadow-sm ring-1 ring-slate-200/50' : 'hover:bg-white/40'}`}>
                                                <p className={`text-[10px] font-bold ${isActive ? 'text-slate-800' : 'text-slate-500'}`}>{opt.label}</p>
                                                <p className={`text-[8px] ${isActive ? 'text-slate-500' : 'text-slate-400'}`}>{opt.desc}</p>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {formData.vectorMemoryEnabled && (
                    <>
                        {/* Batch Operations */}
                        <div className="bg-white/60 backdrop-blur-md rounded-3xl p-4 border border-white shadow-sm space-y-3">
                            <h4 className="text-[11px] font-bold text-slate-700 tracking-widest uppercase">存档清洗与提取</h4>
                            <div className="space-y-2">
                                <p className="text-[10px] text-slate-500 font-medium">1. 增量补充向量记忆 (消耗 Token)</p>
                                <div className="flex items-center justify-between gap-2 bg-slate-50/50 p-2 rounded-2xl border border-white">
                                    <div className="flex items-center gap-1">
                                        <input type="number" min={1} max={totalMsgCount} value={batchStart} onChange={e => setBatchStart(e.target.value)} className="w-14 bg-white border border-slate-100 rounded-lg px-1 py-1 text-[10px] text-center font-mono focus:outline-emerald-400" />
                                        <span className="text-[10px] text-slate-400">-</span>
                                        <input type="number" min={1} max={totalMsgCount} value={batchEnd} onChange={e => setBatchEnd(e.target.value)} className="w-14 bg-white border border-slate-100 rounded-lg px-1 py-1 text-[10px] text-center font-mono focus:outline-emerald-400" />
                                        <span className="text-[9px] text-slate-400 ml-1 whitespace-nowrap">条历史记录</span>
                                    </div>
                                    <button onClick={handleBatchChat} disabled={isBatching} className="py-1 px-3 rounded-xl text-[10px] font-bold text-white bg-slate-800 active:scale-95 transition-all shadow-sm hover:bg-slate-700 disabled:opacity-50 whitespace-nowrap">
                                        开始提取
                                    </button>
                                </div>
                            </div>
                            <div className="pt-2 border-t border-slate-100/50 flex justify-between items-center">
                                <p className="text-[10px] text-slate-500 font-medium">2. 迁移传统日志 (免 Token)</p>
                                <button onClick={handleImportMemories} disabled={isBatching} className="py-1 px-3 rounded-xl text-[10px] font-bold text-slate-700 bg-white border border-slate-200 active:scale-95 transition-all shadow-sm hover:bg-slate-50 disabled:opacity-50">
                                    一键清洗导入
                                </button>
                            </div>
                            <div className="pt-2 border-t border-slate-100/50 flex justify-between items-center">
                                <p className="text-[10px] text-slate-500 font-medium">3. 导入外部向量合集 (独立站)</p>
                                <label className={`py-1 px-3 rounded-xl text-[10px] font-bold text-white bg-indigo-500 active:scale-95 transition-all shadow-sm hover:bg-indigo-400 cursor-pointer ${isBatching ? 'opacity-50 pointer-events-none' : ''}`}>
                                    ⬇️ 导入 JSON
                                    <input type="file" accept=".json" className="hidden" onChange={handleImportToolData} disabled={isBatching} />
                                </label>
                            </div>
                            {batchProgress && (
                                <div className="flex items-center justify-between bg-emerald-50 text-emerald-600 text-[10px] font-bold px-3 py-2 rounded-xl mt-2 animate-pulse border border-emerald-100">
                                    <span>{batchProgress}</span>
                                    {isBatching && <button onClick={() => { setIsAborting(true); abortRef.current?.abort(); }} disabled={isAborting} className={`font-bold ${isAborting ? 'text-slate-400' : 'text-red-500 hover:opacity-80'}`}>{isAborting ? '正在中止...' : '中止'}</button>}
                                </div>
                            )}
                        </div>

                        {/* 情感基因溯源 */}
                        {vmCount > 0 && (
                            <div className="bg-white/60 backdrop-blur-md rounded-3xl p-4 border border-white shadow-sm space-y-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h4 className="text-[11px] font-bold text-slate-700 tracking-widest uppercase flex items-center gap-1.5">🧬 情感基因溯源</h4>
                                        <p className="text-[8px] text-slate-400 mt-0.5">为已有记忆回填激素快照，需副 API（消耗 Token）</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[9px] text-slate-400 font-mono">
                                            {vmList.filter(m => m.hormoneSnapshot).length}/{vmCount} 已标注
                                        </span>
                                        <button
                                            onClick={handleBackfillSnapshots}
                                            disabled={isBackfilling || isBatching}
                                            className="py-1 px-3 rounded-xl text-[10px] font-bold text-white bg-gradient-to-r from-purple-500 to-indigo-500 active:scale-95 transition-all shadow-sm hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
                                        >
                                            {isBackfilling ? '溯源中...' : '开始溯源'}
                                        </button>
                                    </div>
                                </div>
                                {backfillProgress && (
                                    <div className="flex items-center justify-between bg-purple-50 text-purple-600 text-[10px] font-bold px-3 py-2 rounded-xl animate-pulse border border-purple-100">
                                        <span>{backfillProgress}</span>
                                        {isBackfilling && (
                                            <button
                                                onClick={() => { backfillAbortRef.current = true; }}
                                                className="font-bold text-red-500 hover:opacity-80"
                                            >
                                                中止
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* List & Filtering */}
                        <div className="space-y-3">
                            <div className="flex gap-2 items-center bg-white/60 p-1.5 rounded-2xl backdrop-blur-md border border-white shadow-sm">
                                <div className="flex-1 relative">
                                    <input type="text" placeholder="搜索记忆碎片..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-slate-50/50 border-none rounded-xl pl-8 pr-3 py-1.5 text-xs focus:ring-1 focus:ring-slate-300" />
                                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
                                </div>
                                <select value={sortOrder} onChange={e => setSortOrder(e.target.value as any)} className="bg-white border-none rounded-xl text-[10px] font-bold text-slate-600 py-1.5 pr-6 cursor-pointer focus:ring-1 focus:ring-slate-300 shadow-sm appearance-none outline-none">
                                    <option value="newest">最新生成</option>
                                    <option value="oldest">最早记录</option>
                                    <option value="importance">重要度优先</option>
                                    <option value="frequent">频繁调用</option>
                                </select>
                            </div>
                            
                            <div className="space-y-2">
                                {sortedFilteredVms.length === 0 ? (
                                    <p className="text-[10px] text-slate-400 text-center py-6 bg-white/40 rounded-3xl border border-white border-dashed">无匹配的向量记忆</p>
                                ) : (
                                    sortedFilteredVms.map(m => {
                                        const isExpanded = expandedVmId === m.id;
                                        return (
                                            <div key={m.id} className="bg-white/70 backdrop-blur-md rounded-2xl border border-white shadow-sm overflow-hidden transition-all duration-300 group">
                                                <div onClick={() => toggleExpandVm(m)} className="p-3 flex items-start justify-between gap-3 cursor-pointer hover:bg-slate-50/50 transition-colors">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold shrink-0 ${m.importance >= 8 ? 'bg-red-50 text-red-500' : m.importance >= 5 ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
                                                                LV.{m.importance}
                                                            </span>
                                                            <h5 className="text-[11px] font-bold text-slate-700 truncate">{m.title}</h5>
                                                            {m.deprecated && <span className="text-[8px] bg-red-100 text-red-600 px-1 rounded font-bold">已过时</span>}
                                                            {m.source === 'import' && <span className="text-[8px] text-slate-400 bg-slate-100 px-1 rounded">Import</span>}
                                                        </div>
                                                        <p className={`text-[10px] text-slate-500 leading-relaxed font-medium transition-all ${isExpanded ? '' : 'line-clamp-1'}`}>{m.content}</p>
                                                    </div>
                                                    <div className="flex flex-col items-end gap-1 shrink-0">
                                                        <span className="text-[8px] text-slate-400 font-mono">{new Date(m.createdAt).toLocaleDateString()}</span>
                                                        <span className="text-[9px] text-slate-300 font-bold items-center flex gap-0.5">👁 {m.mentionCount}</span>
                                                    </div>
                                                </div>
                                                
                                                {isExpanded && (
                                                    <div className="px-3 pb-3 pt-1 border-t border-slate-100/50 bg-slate-50/30 animate-fade-in relative">
                                                        {m.emotionalJourney && (
                                                            <div className="mb-3">
                                                                <span className="text-[9px] font-bold text-slate-400 tracking-wider">EMOTIONAL CONTEXT</span>
                                                                <p className="text-[10px] text-slate-600 font-medium italic mt-0.5">"{m.emotionalJourney}"</p>
                                                            </div>
                                                        )}
                                                        {m.deprecated && m.deprecatedReason && (
                                                            <div className="mb-3 bg-red-50/50 p-2 rounded-xl border border-red-100 text-[10px] text-red-600">
                                                                <span className="font-bold">过时原因: </span>{m.deprecatedReason}
                                                            </div>
                                                        )}
                                                        
                                                        <div className="mb-3">
                                                            <span className="text-[9px] font-bold text-slate-400 tracking-wider flex items-center justify-between">
                                                                <span>SOURCE ARCHIVE ({m.sourceMessageIds?.length || 0})</span>
                                                                {loadingSource && <span className="animate-pulse">Loading...</span>}
                                                            </span>
                                                            {sourceMessages[m.id] ? (
                                                                <div className="mt-1.5 space-y-1.5 max-h-48 overflow-y-auto pr-1 stylish-scrollbar">
                                                                    {sourceMessages[m.id].length > 0 ? sourceMessages[m.id].map(msg => (
                                                                        <div key={msg.id} className="bg-white/80 p-2 rounded-xl border border-slate-100 text-[9px]">
                                                                            <span className={`font-bold mr-1 ${msg.role === 'user' ? 'text-indigo-500' : 'text-slate-700'}`}>{msg.role === 'user' ? userName : charName}:</span>
                                                                            <span className="text-slate-600 leading-relaxed">{msg.content}</span>
                                                                        </div>
                                                                    )) : <p className="text-[9px] text-slate-400">无关联的原始对话记录。</p>}
                                                                </div>
                                                            ) : !loadingSource && (
                                                                <p className="text-[9px] text-slate-400 mt-1">溯源记录不可用。</p>
                                                            )}
                                                        </div>
                                                        
                                                        <div className="flex justify-end pt-2 border-t border-slate-200/50">
                                                            <button onClick={() => handleDeleteMemory(m.id)} className="text-[9px] text-red-400 hover:text-red-500 font-bold px-2 py-1 rounded hover:bg-red-50 transition-colors">删除碎片</button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                            
                            {vmCount > 0 && (
                                <button onClick={handleClearAll} className="w-full text-[10px] py-3 text-red-400 font-bold hover:bg-red-50/50 rounded-2xl transition-colors">
                                    清空所有向量记忆库
                                </button>
                            )}
                        </div>
                    </>
                )}
            </div>
        );
    };

    const renderStatsTab = () => {
        return (
            <div className="space-y-4 animate-fade-in">
                {/* Master summary */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/60 backdrop-blur-md p-4 rounded-3xl border border-white shadow-sm flex flex-col justify-center">
                        <span className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">传统日记体</span>
                        <div className="flex items-baseline gap-1 mt-1">
                            <span className="text-3xl font-light text-indigo-500">{stats.count}</span>
                            <span className="text-[10px] text-slate-500">条</span>
                        </div>
                        <span className="text-[9px] text-slate-400 mt-1 font-mono">{stats.totalChars.toLocaleString()} 字符</span>
                    </div>
                    <div className="bg-white/60 backdrop-blur-md p-4 rounded-3xl border border-white shadow-sm flex flex-col justify-center">
                        <span className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">向量记忆</span>
                        <div className="flex items-baseline gap-1 mt-1">
                            <span className="text-3xl font-light text-emerald-500">{vmCount}</span>
                            <span className="text-[10px] text-slate-500">条</span>
                        </div>
                        <span className="text-[9px] text-slate-400 mt-1 font-mono">Embedding {vmList.length > 0 && vmList[0].vector?.length ? `${vmList[0].vector.length}D` : 'N/A'}</span>
                    </div>
                </div>

                {/* Vector Importance Distribution */}
                {vmCount > 0 && (
                    <div className="bg-white/60 backdrop-blur-md p-4 rounded-3xl border border-white shadow-sm">
                        <h4 className="text-[11px] font-bold text-slate-700 tracking-widest uppercase mb-3">重要度分布</h4>
                        <div className="flex items-end h-32 gap-1.5 pb-2 border-b border-slate-200">
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(level => {
                                const count = vmList.filter(m => m.importance === level).length;
                                const height = vmCount > 0 ? Math.max((count / vmCount) * 100, count > 0 ? 5 : 0) : 0;
                                return (
                                    <div key={level} className="flex-1 flex flex-col items-center justify-end group">
                                        <div className="w-full bg-gradient-to-t from-indigo-200 to-indigo-300/80 rounded-t-lg transition-all duration-300 group-hover:from-indigo-400 group-hover:to-purple-400 relative" style={{ height: `${height}%` }}>
                                            {count > 0 && <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[8px] font-bold text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">{count}</span>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="flex justify-between mt-1 px-1">
                            <span className="text-[8px] text-slate-400 font-bold">1</span>
                            <span className="text-[8px] text-slate-400 font-bold">5</span>
                            <span className="text-[8px] text-slate-400 font-bold">10</span>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full relative">
            {/* Header & Global Stats */}
            <div className="px-1 mb-5">
                <div className="flex items-center gap-3 mb-4 text-[10px] text-slate-400 font-medium">
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block"></span>{stats.count} 条日志</span>
                    <span className="text-slate-200">·</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>{vmCount} 条向量</span>
                    <span className="text-slate-200">·</span>
                    <span>{(stats.totalChars).toLocaleString()} 字</span>
                </div>
                
                {/* Custom Tab Switcher */}
                <div className="flex bg-white/40 backdrop-blur-md p-1 rounded-2xl border border-white shadow-sm relative">
                    {/* Sliding Indicator (approximate pure CSS via layout) */}
                    <div className="flex-1 right-0 left-0 relative z-10 flex">
                        {[
                            { id: 'timeline', icon: '📅', label: '时间线' },
                            { id: 'vector', icon: '🧠', label: '向量记忆' },
                            { id: 'stats', icon: '📊', label: '统计' }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[10px] font-bold transition-all duration-300 ${activeTab === tab.id ? 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-100' : 'text-slate-400 hover:bg-white/50'}`}
                            >
                                <span className={activeTab === tab.id ? 'opacity-100' : 'opacity-70 grayscale'}>{tab.icon}</span>
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Content Area Rendering */}
            <div className="flex-1 relative">
                {activeTab === 'timeline' && renderTimelineTab()}
                {activeTab === 'vector' && renderVectorTab()}
                {activeTab === 'stats' && renderStatsTab()}
            </div>

            {/* Modals for Timeline (kept outside for z-index) */}
            <Modal isOpen={!!editMemory} title="编辑记忆" onClose={() => setEditMemory(null)} footer={<button onClick={() => { if (editMemory) onUpdateMemory(editMemory.id, editMemory.summary); setEditMemory(null); }} className="w-full py-3 bg-indigo-500 text-white font-bold rounded-2xl shadow-lg shadow-indigo-200">保存修改</button>}>
                {editMemory && <div className="space-y-3"><div className="text-xs text-slate-400">日期: {editMemory.date}</div><textarea value={editMemory.summary} onChange={e => setEditMemory({ ...editMemory, summary: e.target.value })} className="w-full h-40 bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm text-slate-700 resize-none focus:outline-indigo-400" /></div>}
            </Modal>

            <Modal isOpen={showDeleteConfirm} title="确认删除" onClose={() => setShowDeleteConfirm(false)} footer={<div className="flex gap-2 w-full"><button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl">取消</button><button onClick={performDelete} className="flex-1 py-3 bg-red-400 text-white font-bold rounded-2xl shadow-lg shadow-red-100">确认删除</button></div>}>
                <p className="text-sm text-slate-600 text-center py-4">确定删除选中的 {selectedIds.size} 条记忆吗？<br /><span className="text-xs text-red-400 mt-1 block">此操作不可恢复。</span></p>
            </Modal>

            <Modal isOpen={!!editingCore} title="编辑核心记忆" onClose={() => setEditingCore(null)} footer={<div className="flex gap-2 w-full"><button onClick={() => setShowCoreDeleteConfirm(true)} className="flex-1 py-3 bg-red-50 text-red-500 font-bold rounded-2xl">删除</button><button onClick={saveCoreEdit} className="flex-1 py-3 bg-indigo-500 text-white font-bold rounded-2xl shadow-lg shadow-indigo-200">保存</button></div>}>
                {editingCore && (
                    <div className="space-y-2">
                        <div className="text-xs font-bold text-slate-400 tracking-wider">[{editingCore.year}年{editingCore.month}月] CONTEXT</div>
                        <textarea value={editingCore.content} onChange={e => setEditingCore({ ...editingCore, content: e.target.value })} className="w-full h-48 bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm text-slate-700 resize-none focus:outline-indigo-400 leading-relaxed" />
                    </div>
                )}
            </Modal>

            <Modal isOpen={showCoreDeleteConfirm} title="删除确认" onClose={() => setShowCoreDeleteConfirm(false)} footer={<div className="flex gap-2 w-full"><button onClick={() => setShowCoreDeleteConfirm(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl">取消</button><button onClick={confirmCoreDelete} className="flex-1 py-3 bg-red-400 text-white font-bold rounded-2xl">确认删除</button></div>}>
                <p className="text-center text-sm text-slate-600 py-4">确定要删除该月的核心记忆吗？<br /><span className="text-xs text-red-400">删除后将丢失该月的 AI 上下文摘要。</span></p>
            </Modal>
        </div>
    );
};

export default MemoryCenter;
