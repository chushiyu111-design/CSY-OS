
import React, { useState, useRef, useEffect } from 'react';
import { useOS } from '../context/OSContext';
import { AppID, CharacterProfile, CharacterExportData, UserImpression, MemoryFragment } from '../types';
import Modal from '../components/os/Modal';
import { processImage } from '../utils/file';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { DB } from '../utils/db';
import { ContextBuilder } from '../utils/context';
import { DEFAULT_ARCHIVE_PROMPTS } from '../constants/archivePrompts';
import ImpressionPanel from '../components/character/ImpressionPanel';
import MemoryCenter from '../components/character/MemoryCenter';
import { safeResponseJson } from '../utils/safeApi';
import { VectorMemoryExtractor } from '../utils/vectorMemoryExtractor';
import { EmbeddingService, getEmbeddingConfig } from '../utils/embeddingService';
import { VectorMemory } from '../types';


const CharacterCard: React.FC<{
    char: CharacterProfile;
    onClick: () => void;
    onDelete: (e: React.MouseEvent) => void;
}> = ({ char, onClick, onDelete }) => (
    <div
        onClick={onClick}
        className="relative p-4 rounded-3xl border bg-white/40 border-white/40 hover:bg-white/60 hover:scale-[1.01] transition-all duration-300 cursor-pointer group shadow-sm shrink-0"
    >
        <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-slate-100 border border-white/50 overflow-hidden relative shadow-inner">
                <div className="absolute inset-0 bg-slate-100/50"></div>
                <img src={char.avatar} className="w-full h-full object-cover relative z-10" alt={char.name} />
            </div>
            <div className="flex-1 min-w-0">
                <h3 className="font-medium truncate text-slate-700">
                    {char.name}
                </h3>
                <p className="text-xs text-slate-400 truncate mt-0.5 font-light">
                    {char.description || '暂无描述'}
                </p>
            </div>
        </div>
        <button
            onClick={onDelete}
            className="absolute top-3 right-3 p-2 rounded-full text-slate-300 hover:bg-red-50 hover:text-red-400 active:bg-red-100 active:text-red-500 transition-all z-10"
        >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
        </button>
    </div>
);

const Character: React.FC = () => {
    const { closeApp, openApp, characters, activeCharacterId, setActiveCharacterId, addCharacter, updateCharacter, deleteCharacter, apiConfig, addToast, userProfile, customThemes, addCustomTheme, worldbooks } = useOS();
    const [view, setView] = useState<'list' | 'detail'>('list');
    const [detailTab, setDetailTab] = useState<'identity' | 'memory' | 'impression'>('identity');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState<CharacterProfile | null>(null);
    const [isCompressing, setIsCompressing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cardImportRef = useRef<HTMLInputElement>(null);

    // Race Condition Guards
    const editingIdRef = useRef<string | null>(null);

    // Modals
    const [showImportModal, setShowImportModal] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    const [showBatchModal, setShowBatchModal] = useState(false);
    const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<string | null>(null);
    const [showWorldbookModal, setShowWorldbookModal] = useState(false); // New Modal

    const [importText, setImportText] = useState('');
    const [exportText, setExportText] = useState('');
    const [isProcessingMemory, setIsProcessingMemory] = useState(false);
    const [importStatus, setImportStatus] = useState('');

    // Batch Summarize State
    const [batchRange, setBatchRange] = useState({ start: '', end: '' });
    const [isBatchProcessing, setIsBatchProcessing] = useState(false);
    const [batchProgress, setBatchProgress] = useState('');

    // Archive Prompts State (shared with ChatApp)
    const [archivePrompts, setArchivePrompts] = useState<{ id: string, name: string, content: string }[]>(DEFAULT_ARCHIVE_PROMPTS);
    const [selectedPromptId, setSelectedPromptId] = useState<string>('preset_rational');
    const [editingPrompt, setEditingPrompt] = useState<{ id: string, name: string, content: string } | null>(null);
    const [showPromptEditor, setShowPromptEditor] = useState(false);

    // Impression State
    const [isGeneratingImpression, setIsGeneratingImpression] = useState(false);

    // Load archive prompts from localStorage (shared with ChatApp)
    useEffect(() => {
        const savedPrompts = localStorage.getItem('chat_archive_prompts');
        if (savedPrompts) {
            try {
                const parsed = JSON.parse(savedPrompts);
                const merged = [...DEFAULT_ARCHIVE_PROMPTS, ...parsed.filter((p: any) => !p.id.startsWith('preset_'))];
                setArchivePrompts(merged);
            } catch (e) { }
        }
        const savedId = localStorage.getItem('chat_active_archive_prompt_id');
        if (savedId) setSelectedPromptId(savedId);
    }, []);

    // Sync Ref with State
    useEffect(() => {
        editingIdRef.current = editingId;
    }, [editingId]);

    // CRITICAL FIX: Breaking the render loop.
    // We only sync from global 'characters' to local 'formData' when:
    // 1. We enter edit mode (view becomes detail)
    // 2. We switch character IDs
    useEffect(() => {
        if (editingId && view === 'detail') {
            // Only if formData is not set OR the ID doesn't match
            if (!formData || formData.id !== editingId) {
                const target = characters.find(c => c.id === editingId);
                if (target) setFormData(target);
            }
        }
    }, [editingId, view]);

    // Auto-save Effect with Safety Guard
    useEffect(() => {
        if (formData && editingId) {
            // SAFETY GUARD: Only save if the formData ID matches the currently active editing ID.
            // This prevents overwriting Character B with Character A's data if a delayed async call updates formData.
            if (formData.id === editingId) {
                updateCharacter(editingId, formData);
            } else {
                console.warn(`Race condition prevented: Tried to save data for ${formData.id} into slot ${editingId}`);
            }
        }
    }, [formData]);

    const handleBack = () => {
        if (view === 'detail') {
            setView('list');
            setEditingId(null);
        } else closeApp();
    };

    const handleChange = (field: keyof CharacterProfile, value: any) => {
        // Functional update to prevent stale state issues in simple closures
        setFormData(prev => {
            if (!prev) return null;
            return { ...prev, [field]: value };
        });
    };

    // Worldbook Logic
    const mountWorldbook = (bookId: string) => {
        if (!formData) return;
        const book = worldbooks.find(b => b.id === bookId);
        if (!book) return;

        const currentBooks = formData.mountedWorldbooks || [];
        if (currentBooks.some(b => b.id === book.id)) {
            addToast('已挂载该世界书', 'info');
            return;
        }

        // CACHE THE CONTENT, include category and position
        const newBookEntry = {
            id: book.id,
            title: book.title,
            content: book.content,
            category: book.category,
            position: book.position
        };
        handleChange('mountedWorldbooks', [...currentBooks, newBookEntry]);
        setShowWorldbookModal(false);
        addToast(`已挂载: ${book.title}`, 'success');
    };

    // New: Mount entire category
    const mountCategory = (category: string) => {
        if (!formData) return;
        const booksToMount = worldbooks.filter(b => (b.category || '未分类设定 (General)') === category);
        if (booksToMount.length === 0) return;

        const currentBooks = formData.mountedWorldbooks || [];
        const newEntries = [];
        let addedCount = 0;

        for (const book of booksToMount) {
            if (!currentBooks.some(b => b.id === book.id)) {
                newEntries.push({
                    id: book.id,
                    title: book.title,
                    content: book.content,
                    category: book.category,
                    position: book.position
                });
                addedCount++;
            }
        }

        if (addedCount > 0) {
            handleChange('mountedWorldbooks', [...currentBooks, ...newEntries]);
            addToast(`已批量挂载 ${addedCount} 本世界书`, 'success');
        } else {
            addToast('该组世界书已全部挂载', 'info');
        }
        setShowWorldbookModal(false);
    };

    const unmountWorldbook = (bookId: string) => {
        if (!formData) return;
        const currentBooks = formData.mountedWorldbooks || [];
        handleChange('mountedWorldbooks', currentBooks.filter(b => b.id !== bookId));
    };

    // 世界书排序：上移/下移
    const moveWorldbook = (index: number, direction: 'up' | 'down') => {
        if (!formData?.mountedWorldbooks) return;
        const items = [...formData.mountedWorldbooks];
        if (direction === 'up' && index > 0) {
            [items[index - 1], items[index]] = [items[index], items[index - 1]];
        } else if (direction === 'down' && index < items.length - 1) {
            [items[index + 1], items[index]] = [items[index], items[index + 1]];
        }
        handleChange('mountedWorldbooks', items);
    };

    // ... (Other handlers unchanged)
    const handleToggleActiveMonth = (year: string, month: string) => {
        if (!formData) return;
        const key = `${year}-${month}`;
        const current = formData.activeMemoryMonths || [];
        const next = current.includes(key) ? current.filter(k => k !== key) : [...current, key];
        handleChange('activeMemoryMonths', next);
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            try {
                setIsCompressing(true);
                const processedBase64 = await processImage(file);
                handleChange('avatar', processedBase64);
                addToast('头像上传成功', 'success');
            } catch (error: any) {
                addToast(error.message || '图片处理失败', 'error');
            } finally {
                setIsCompressing(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        }
    };

    const handleRefineMonth = async (year: string, month: string, rawText: string, formattedPrompt?: string) => {
        if (!apiConfig.apiKey) { addToast('请先配置 API Key', 'error'); return; }
        if (!formData) return;

        const targetId = formData.id; // LOCK ID

        // Build lightweight character identity context (no memories - we're generating those)
        let identityContext = `[角色身份]\n名字: ${formData.name}\n`;
        if (formData.systemPrompt) identityContext += `核心性格/指令:\n${formData.systemPrompt}\n`;
        if (formData.worldview?.trim()) identityContext += `世界观设定: ${formData.worldview}\n`;
        identityContext += `互动对象: ${userProfile.name}`;
        if (userProfile.bio) identityContext += ` (${userProfile.bio})`;
        identityContext += '\n\n';

        const prompt = identityContext + (formattedPrompt || `Task: Summarize the following logs (${year}-${month}) into a concise memory. Language: Same as logs (Chinese). ${rawText.substring(0, 5000)}`);

        try {
            const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                body: JSON.stringify({ model: apiConfig.model, messages: [{ role: "user", content: prompt }], temperature: 0.3 })
            });
            if (!response.ok) throw new Error('API Request failed');
            const data = await safeResponseJson(response);
            const summary = data.choices[0].message.content.trim();
            const key = `${year}-${month}`;

            // CHECK IF USER SWITCHED
            if (editingIdRef.current === targetId) {
                // Still on same page
                handleChange('refinedMemories', { ...(formData.refinedMemories || {}), [key]: summary });
                addToast(`${year}年${month}月记忆精炼完成`, 'success');
            } else {
                // Switched page - Save to DB directly
                const currentRefined = characters.find(c => c.id === targetId)?.refinedMemories || {};
                updateCharacter(targetId, { refinedMemories: { ...currentRefined, [key]: summary } });
                addToast('后台任务完成：记忆已保存到原角色', 'success');
            }
        } catch (e: any) { addToast(`精炼失败: ${e.message}`, 'error'); }
    };

    const handleDeleteMemories = (ids: string[]) => { if (!formData) return; handleChange('memories', (formData.memories || []).filter(m => !ids.includes(m.id))); addToast(`已删除 ${ids.length} 条记忆`, 'success'); };
    const handleUpdateMemory = (id: string, newSummary: string) => { if (!formData) return; handleChange('memories', (formData.memories || []).map(m => m.id === id ? { ...m, summary: newSummary } : m)); addToast('记忆已更新', 'success'); };

    // NEW: Core Memory Handlers
    const handleUpdateRefinedMemory = (year: string, month: string, newContent: string) => {
        if (!formData) return;
        const key = `${year}-${month}`;
        handleChange('refinedMemories', { ...(formData.refinedMemories || {}), [key]: newContent });
        addToast('核心记忆已更新', 'success');
    };

    const handleDeleteRefinedMemory = (year: string, month: string) => {
        if (!formData || !formData.refinedMemories) return;
        const key = `${year}-${month}`;
        const newRefined = { ...formData.refinedMemories };
        delete newRefined[key];
        handleChange('refinedMemories', newRefined);
        addToast('核心记忆已删除', 'success');
    };

    const handleExportPreview = async () => {
        if (!formData) return;
        const mems = formData.memories as any[] || [];
        const sortedMemories = [...mems].sort((a, b) => a.date.localeCompare(b.date));
        let text = `【角色档案】\nName: ${formData.name}\nExported: ${new Date().toLocaleString()}\n\n`;

        // 核心记忆
        if (formData.refinedMemories && Object.keys(formData.refinedMemories).length > 0) {
            text += `=== 核心记忆 ===\n`;
            Object.entries(formData.refinedMemories).sort().forEach(([k, v]) => { text += `[${k}]: ${v}\n`; });
            text += `\n`;
        }

        // 传统日志
        if (sortedMemories.length > 0) {
            text += `=== 详细日志 (${sortedMemories.length} 条) ===\n`;
            let currentYear = '', currentMonth = '';
            sortedMemories.forEach(mem => {
                const match = mem.date.match(/(\d{4})[-/年](\d{1,2})/);
                if (match) {
                    const y = match[1], m = match[2];
                    if (y !== currentYear) { text += `\n[ ${y}年 ]\n`; currentYear = y; currentMonth = ''; }
                    if (m !== currentMonth) { text += `\n-- ${parseInt(m)}月 --\n\n`; currentMonth = m; }
                }
                text += `📅 ${mem.date} ${mem.mood ? `(#${mem.mood})` : ''}\n${mem.summary}\n\n--------------------------\n\n`;
            });
        }

        // 向量记忆
        try {
            const vmList = await DB.getAllVectorMemories(formData.id);
            if (vmList.length > 0) {
                text += `\n=== 向量记忆 (${vmList.length} 条) ===\n\n`;
                vmList.sort((a, b) => b.createdAt - a.createdAt).forEach(vm => {
                    const date = new Date(vm.createdAt).toLocaleDateString();
                    text += `🧠 [LV.${vm.importance}] ${vm.title}\n`;
                    text += `   ${vm.content}\n`;
                    if (vm.emotionalJourney) text += `   情感: ${vm.emotionalJourney}\n`;
                    text += `   创建: ${date} | 调用: ${vm.mentionCount}次${vm.deprecated ? ' | ⚠️已过时' : ''}\n`;
                    text += `--------------------------\n\n`;
                });
            }
        } catch (e) { /* ignore if vector store not available */ }

        if (text.trim() === `【角色档案】\nName: ${formData.name}\nExported: ${new Date().toLocaleString()}`) {
            addToast('暂无记忆数据可导出', 'info');
            return;
        }

        setExportText(text);
        setShowExportModal(true);
        navigator.clipboard.writeText(text).then(() => addToast('内容已自动复制到剪贴板', 'info')).catch(() => { });
    };
    const handleNativeShare = async () => { if (!exportText) return; if (Capacitor.isNativePlatform()) { try { const fileName = `${formData?.name || 'character'}_memories.txt`; await Filesystem.writeFile({ path: fileName, data: exportText, directory: Directory.Cache, encoding: Encoding.UTF8 }); const uri = await Filesystem.getUri({ directory: Directory.Cache, path: fileName }); await Share.share({ title: '记忆档案', files: [uri.uri] }); } catch (e: any) { console.error("Native share failed", e); addToast('分享组件调起失败，请直接复制文本', 'error'); } } };
    const handleWebFileDownload = () => { const fileName = `${formData?.name || 'character'}_memories.txt`; const blob = new Blob([exportText], { type: 'text/plain' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); addToast('已触发浏览器下载', 'success'); };

    const handleImportMemories = async () => {
        if (!importText.trim() || !apiConfig.apiKey) { addToast('请检查输入内容或 API 设置', 'error'); return; }
        if (!formData) return;

        const targetId = formData.id; // LOCK ID
        setIsProcessingMemory(true);
        setImportStatus('正在链接神经云端进行清洗...');

        try {
            const prompt = `Task: Convert this text log into a JSON array. Format: [{ "date": "YYYY-MM-DD", "summary": "...", "mood": "..." }] Text: ${importText.substring(0, 8000)}`;
            const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` }, body: JSON.stringify({ model: apiConfig.model, messages: [{ role: "user", content: prompt }], temperature: 0.1 }) });
            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
            const data = await safeResponseJson(response);
            let content = data.choices?.[0]?.message?.content || '';
            content = content.replace(/```json/g, '').replace(/```/g, '').trim();
            const firstBracket = content.indexOf('[');
            const lastBracket = content.lastIndexOf(']');
            if (firstBracket !== -1 && lastBracket !== -1) { content = content.substring(firstBracket, lastBracket + 1); }
            let parsed; try { parsed = JSON.parse(content); } catch (e) { throw new Error('解析返回数据失败'); }
            let targetArray = Array.isArray(parsed) ? parsed : (parsed.memories || parsed.data);

            if (Array.isArray(targetArray)) {
                const newMems = targetArray.map((m: any) => ({ id: `mem-${Date.now()}-${Math.random()}`, date: m.date || '未知', summary: m.summary || '无内容', mood: m.mood || '记录' }));

                if (editingIdRef.current === targetId) {
                    handleChange('memories', [...(formData.memories || []), ...newMems]);
                    setShowImportModal(false);
                    addToast(`成功导入 ${newMems.length} 条记忆`, 'success');
                } else {
                    // Background update
                    const currentMems = characters.find(c => c.id === targetId)?.memories || [];
                    updateCharacter(targetId, { memories: [...currentMems, ...newMems] });
                    addToast('后台任务完成：导入记忆已保存', 'success');
                }
            } else { throw new Error('结构错误'); }
        } catch (e: any) { setImportStatus(`错误: ${e.message || '未知错误'}`); addToast('记忆清洗失败', 'error'); } finally { setIsProcessingMemory(false); }
    };

    const handleBatchSummarize = async () => {
        if (!apiConfig.apiKey || !formData) return;

        const targetId = formData.id; // LOCK ID
        setIsBatchProcessing(true);
        setBatchProgress('Initializing...');

        try {
            const msgs = await DB.getMessagesByCharId(targetId);
            const validMsgs = msgs.filter(m => !formData.hideBeforeMessageId || m.id >= formData.hideBeforeMessageId);
            const msgsByDate: Record<string, any[]> = {};

            msgs.forEach(m => {
                const d = new Date(m.timestamp);
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                const dateStr = `${year}-${month}-${day}`;

                if (batchRange.start && dateStr < batchRange.start) return;
                if (batchRange.end && dateStr > batchRange.end) return;

                if (!msgsByDate[dateStr]) msgsByDate[dateStr] = [];
                msgsByDate[dateStr].push(m);
            });

            const dates = Object.keys(msgsByDate).sort();
            const newMemories: MemoryFragment[] = [];

            const baseContext = ContextBuilder.buildCoreContext(formData, userProfile);

            for (let i = 0; i < dates.length; i++) {
                const date = dates[i];
                setBatchProgress(`Processing ${date} (${i + 1}/${dates.length})`);

                const dayMsgs = msgsByDate[date];
                const rawLog = dayMsgs.map(m => {
                    if (m.type === 'call_log') return m.content; // 已含 [电话记录] 标记，直接透传
                    const time = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                    let content = m.content;
                    if (m.type === 'image') content = '[图片/Image]';
                    if (m.type === 'emoji') content = `[表情包: ${m.content.split('/').pop() || 'sticker'}]`;

                    return `[${time}] ${m.role === 'user' ? userProfile.name : formData.name}: ${content}`;
                }).join('\n');

                // Use selected template (same as ChatApp) with variable substitution
                const templateObj = archivePrompts.find(p => p.id === selectedPromptId) || DEFAULT_ARCHIVE_PROMPTS[0];
                let prompt = baseContext + '\n\n' + templateObj.content;
                prompt = prompt.replace(/\$\{dateStr\}/g, date);
                prompt = prompt.replace(/\$\{char\.name\}/g, formData.name);
                prompt = prompt.replace(/\$\{userProfile\.name\}/g, userProfile.name);
                prompt = prompt.replace(/\$\{rawLog.*?\}/g, rawLog.substring(0, 200000));

                const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                    body: JSON.stringify({
                        model: apiConfig.model,
                        messages: [{ role: "user", content: prompt }],
                        max_tokens: 8000,
                        temperature: 0.5
                    })
                });

                if (response.ok) {
                    const data = await safeResponseJson(response);
                    let summary = data.choices?.[0]?.message?.content || '';
                    summary = summary.replace(/^["']|["']$/g, '').trim();

                    if (summary) {
                        newMemories.push({
                            id: `mem-${Date.now()}-${Math.random()}`,
                            date: date,
                            summary: summary,
                            mood: 'auto'
                        });
                    }
                }
                await new Promise(r => setTimeout(r, 500));
            }

            if (editingIdRef.current === targetId) {
                handleChange('memories', [...(formData.memories || []), ...newMemories]);
                setBatchProgress('Done!');
                setTimeout(() => {
                    setIsBatchProcessing(false);
                    setShowBatchModal(false);
                    addToast(`Processed ${newMemories.length} days`, 'success');
                }, 1000);
            } else {
                // Background update
                const currentMems = characters.find(c => c.id === targetId)?.memories || [];
                updateCharacter(targetId, { memories: [...currentMems, ...newMemories] });

                // Cleanup UI state since we are elsewhere
                setIsBatchProcessing(false);
                setShowBatchModal(false); // Modal is on current view, but we are likely on another view. 
                // Since this component is unmounted when view changes, this code block might not even run if unmounted.
                // However, if we switched from Detail to List view, Character.tsx might still be mounted but hidden? 
                // Actually Character.tsx unmounts detail view content if view changes.
                // If view changed, this function probably aborted or memory leaked.
                // Assuming component is still mounted (e.g. switched to Memory tab of another character in same app instance - wait, Character app only shows one at a time).
                addToast(`后台任务完成：为 ${formData.name} 生成了 ${newMemories.length} 条记忆`, 'success');
            }



        } catch (e: any) {
            setBatchProgress(`Error: ${e.message}`);
            setIsBatchProcessing(false);
        }
    };

    const handleGenerateImpression = async (type: 'initial' | 'update') => {
        if (!formData || !apiConfig.apiKey) {
            addToast('请先配置 API Key', 'error');
            return;
        }

        const targetId = formData.id; // LOCK ID
        setIsGeneratingImpression(true);
        try {
            const charName = formData.name;
            const boundUser = userProfile;

            // 构建完整角色上下文（包含人设、世界观、用户档案、精炼记忆等宏观信息）
            const fullContext = ContextBuilder.buildCoreContext(formData, userProfile);

            let messagesToAnalyze = "";

            // 第一层：完整上下文 —— 宏观人格分析的基石
            messagesToAnalyze += `\n【完整角色上下文 (Full Context - 宏观分析的基石)】:\n${fullContext}\n`;

            // 第二层：最近聊天 —— 仅用于检测近期变化
            // 记忆部分已包含在 buildCoreContext 中（精炼月度总结 + 点亮月份的详细记忆），
            // 与聊天时角色能看到的记忆完全一致，不再额外抓取。
            // 重置模式下大幅减少近期聊天的数量，避免近因偏差
            const recentMsgs = await DB.getRecentMessagesByCharId(targetId, type === 'initial' ? 15 : 50);
            const msgText = recentMsgs.map(m => {
                let content = m.content;
                if (m.type === 'image') content = '[图片]';
                return `${m.role === 'user' ? boundUser.name : charName}: ${content}`;
            }).join('\n');

            if (msgText) messagesToAnalyze += `\n【最近的聊天记录 (Recent Chats - 仅用于检测近期变化)】:\n${msgText}\n`;

            // 重置时不传旧印象，避免模型锚定在旧内容上
            const currentProfileJSON = (type === 'initial') ? "null" : (formData.impression ? JSON.stringify(formData.impression, null, 2) : "null");
            const isInitialGeneration = type === 'initial' || !formData.impression;

            const summaryInstruction = isInitialGeneration
                ? "用一段话（100字以内）概括你对TA的【宏观整体印象】。不要局限于最近的对话，而是定义TA本质上是个什么样的人，以及TA对你意味着什么。必须第一人称。"
                : "基于旧的总结，结合新发现，更新你对TA的【宏观整体印象】。请保持长期视角的连贯性，除非发生了重大转折，否则不要因为一两句闲聊就彻底推翻对TA的本质判断。必须第一人称。";

            const listInstruction = isInitialGeneration ? `"项目1", "项目2"` : `"保留旧项目", "新项目"`;
            const changesInstruction = isInitialGeneration ? "" : `"描述变化1", "描述变化2"`;

            const prompt = `
当前档案（你过去的观察）
\`\`\`json
${currentProfileJSON}
\`\`\`
${messagesToAnalyze}

【重要：语气与视角】
你【就是】"${charName}"。这份档案是你写的【私人笔记】。
因此，所有总结性的字段（如 \`core_values\`, \`summary\`, \`emotion_summary\` 等），【必须】使用你的第一人称（"我"）视角来撰写。

【核心指令：数据层级与权重分配】
1. **完整角色上下文 (Full Context)**: 这是你【最重要的分析基础】。它包含了你的人设、世界观、用户档案、以及你的全部记忆（月度核心总结 + 激活月份的每日详细回忆）。你对TA的核心性格、核心价值观、互动模式、人格特质的判断，必须主要基于这些跨越完整时间线的宏观数据。你必须【平等对待】早期记忆和近期记忆，从整段关系的完整弧线中提炼人格特征。
2. **近期聊天 (Recent Chats)**: 这【仅仅】代表TA当下的状态切片。它的作用【严格限定】在更新 [behavior_profile.emotion_summary] 和 [observed_changes] 两个字段。除非发生了重大事件（如价值观冲突、人生转折），否则【绝对不要】因为最近几次聊天的情绪波动就改变对TA本质人格的判断。
${isInitialGeneration ? `
【重置模式特别指令 - CRITICAL】
这是一次【完全重置】，你需要从零开始，基于所有可用的宏观数据重新构建对TA的完整认知。
- 你的分析必须覆盖从最早记忆到最新记忆的【完整时间跨度】
- 早期记忆和近期记忆拥有【相同的权重】——不要因为某些记忆发生得更近就赋予它们更大的影响
- personality_core、value_map、emotion_schema 必须反映TA在【整段关系中】展现出的稳定特征，而非仅仅是近期状态
- 如果早期记忆和近期记忆中TA的表现有差异，请在 observed_changes 中记录这种演变，但 personality_core 应反映最持久稳定的特质
` : ''}
【反面教材 - 严禁出现】
- ❌ 仅根据最近聊天就总结"TA是一个喜欢讨论XX话题的人" —— 这是把近期话题当成了人格特质
- ❌ personality_core.summary 里出现"最近"、"这几天"等时间限定词 —— summary 应该是跨越所有记忆的宏观总结
- ✅ 正确做法：personality_core 基于完整上下文和长期记忆，observed_changes 基于近期聊天与长期印象的对比

分析指令：五维画像更新 (第一人称视角)
根据【强制对比协议】和你自己的视角，分析新消息，并${isInitialGeneration ? '【生成】' : '【增量更新】'}以下JSON结构。

输出JSON结构v3.0（严格遵守, 不要用markdown代码块包裹，直接返回JSON）
{
  "version": 3.0,
  "lastUpdated": ${Date.now()},
  "value_map": {
    "likes": [${listInstruction}],
    "dislikes": [${listInstruction}],
    "core_values": "..."
  },
  "behavior_profile": {
    "tone_style": "...",
    "emotion_summary": "...",
    "response_patterns": "..."
  },
  "emotion_schema": {
    "triggers": { 
        "positive": [${listInstruction}],
        "negative": [${listInstruction}]
    },
    "comfort_zone": "...",
    "stress_signals": [${listInstruction}]
  },
  "personality_core": {
    "observed_traits": [${listInstruction}],
    "interaction_style": "...",
    "summary": "..."
  },
  "mbti_analysis": {
    "type": "XXXX",
    "reasoning": "...",
    "dimensions": {
        "e_i": 50,
        "s_n": 50,
        "t_f": 50,
        "j_p": 50
    }
  },
  "observed_changes": [
    ${changesInstruction}
  ]
}
注意：observed_changes 的每一项必须是纯字符串（string），例如 ["最近变得更开朗了", "开始主动分享日常"]。严禁使用对象格式如 {"period": "...", "description": "..."}。`;

            const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                body: JSON.stringify({
                    model: apiConfig.model,
                    messages: [{ role: "user", content: prompt }],
                    max_tokens: 8000,
                    temperature: 0.5
                })
            });

            if (!response.ok) throw new Error('API Request Failed');
            const data = await safeResponseJson(response);
            let content = data.choices[0].message.content;

            content = content.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed: UserImpression = JSON.parse(content);

            // Normalize observed_changes: convert objects to strings if AI returned wrong format
            if (parsed.observed_changes && Array.isArray(parsed.observed_changes)) {
                parsed.observed_changes = parsed.observed_changes.map((c: any) =>
                    typeof c === 'string' ? c : c?.description ? `[${c.period || ''}] ${c.description}` : JSON.stringify(c)
                );
            }

            if (editingIdRef.current === targetId) {
                handleChange('impression', parsed);
                addToast(isInitialGeneration ? '印象档案已生成' : '印象档案已更新', 'success');
            } else {
                updateCharacter(targetId, { impression: parsed });
                addToast('后台任务完成：印象已更新到原角色', 'success');
            }



        } catch (e: any) {
            console.error(e);
            addToast(`生成失败: ${e.message}`, 'error');
        } finally {
            setIsGeneratingImpression(false);
        }
    };

    const confirmDeleteCharacter = () => {
        if (deleteConfirmTarget) {
            deleteCharacter(deleteConfirmTarget);
            setDeleteConfirmTarget(null);
            addToast('连接已断开', 'success');
        }
    };

    const handleExportCard = async () => {
        if (!formData) return;

        const {
            id, memories, refinedMemories, activeMemoryMonths, impression,
            vectorMemoryEnabled, vectorMemoryAutoExtract, vectorMemoryExtractInterval,
            vectorMemoryLastExtractAt, vectorMemoryTakeover, vectorMemoryMode,
            ...cardProps
        } = formData;

        const exportData: CharacterExportData = {
            ...cardProps,
            version: 1,
            type: 'sully_character_card'
        };

        if (formData.bubbleStyle) {
            const customTheme = customThemes.find(t => t.id === formData.bubbleStyle);
            if (customTheme) {
                exportData.embeddedTheme = customTheme;
            }
        }

        const json = JSON.stringify(exportData, null, 2);

        if (Capacitor.isNativePlatform()) {
            try {
                const fileName = `${formData.name || 'Character'}_Card.json`;
                await Filesystem.writeFile({
                    path: fileName,
                    data: json,
                    directory: Directory.Cache,
                    encoding: Encoding.UTF8,
                });
                const uriResult = await Filesystem.getUri({
                    directory: Directory.Cache,
                    path: fileName,
                });
                await Share.share({
                    title: '导出角色卡',
                    files: [uriResult.uri],
                });
                addToast('已调起分享', 'success');
            } catch (e: any) {
                console.error("Native Export Error", e);
                addToast('导出失败，请检查权限', 'error');
            }
        } else {
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${formData.name}_Card.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            addToast('角色卡已生成并下载', 'success');
        }
    };

    const handleImportCard = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const json = ev.target?.result as string;
                const data: CharacterExportData = JSON.parse(json);

                if (data.type !== 'sully_character_card') {
                    throw new Error('无效的角色卡文件');
                }

                if (data.embeddedTheme) {
                    const exists = customThemes.some(t => t.id === data.embeddedTheme!.id);
                    if (!exists) {
                        addCustomTheme(data.embeddedTheme);
                    }
                }

                const newChar: CharacterProfile = {
                    ...data,
                    id: `char-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    memories: [],
                    refinedMemories: {},
                    activeMemoryMonths: [],
                    embeddedTheme: undefined
                } as CharacterProfile;

                await DB.saveCharacter(newChar);
                addCharacter(); // Force refresh (naive)
                setTimeout(() => window.location.reload(), 500);

                addToast(`角色 ${newChar.name} 导入成功`, 'success');

            } catch (err: any) {
                console.error(err);
                addToast(err.message || '导入失败', 'error');
            } finally {
                if (cardImportRef.current) cardImportRef.current.value = '';
            }
        };
        reader.readAsText(file);
    };

    return (
        <div className="h-full w-full bg-slate-50/30 font-light relative">
            {view === 'list' ? (
                <div className="flex flex-col h-full animate-fade-in">
                    {/* INCREASED PADDING TOP HERE */}
                    <div className="px-6 pt-16 pb-4 shrink-0 flex items-center justify-between">
                        <div><h1 className="text-2xl font-light text-slate-800 tracking-tight">神经链接</h1><p className="text-xs text-slate-400 mt-1">已建立 {characters.length} 个角色连接</p></div>
                        <div className="flex gap-2">
                            <button onClick={() => cardImportRef.current?.click()} className="p-2 rounded-full bg-white/40 hover:bg-white/80 transition-colors text-slate-600" title="导入角色卡">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                                </svg>
                            </button>
                            <input type="file" ref={cardImportRef} className="hidden" accept=".json" onChange={handleImportCard} />

                            <button onClick={closeApp} className="p-2 rounded-full bg-white/40 hover:bg-white/80 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-slate-600"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg></button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto px-5 pb-20 no-scrollbar flex flex-col gap-3">
                        {characters.map(char => (
                            <CharacterCard
                                key={char.id}
                                char={char}
                                onClick={() => { setEditingId(char.id); setView('detail'); }}
                                onDelete={(e) => {
                                    e.stopPropagation();
                                    setDeleteConfirmTarget(char.id);
                                }}
                            />
                        ))}
                        <button onClick={addCharacter} className="w-full py-4 rounded-3xl border border-dashed border-slate-300 text-slate-400 text-sm hover:bg-white/30 transition-all flex items-center justify-center gap-2 shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>新建链接
                        </button>
                    </div>
                </div>
            ) : formData && (
                <div className="flex flex-col h-full animate-fade-in bg-slate-50/50 relative">
                    {/* INCREASED HEIGHT HERE */}
                    <div className="h-32 bg-gradient-to-b from-white/90 to-transparent backdrop-blur-sm flex flex-col justify-end px-5 pb-2 shrink-0 z-40 sticky top-0">
                        <div className="flex justify-between items-center mb-3">
                            <button onClick={handleBack} className="p-2 -ml-2 rounded-full hover:bg-white/60 flex items-center gap-1 text-slate-600"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg><span className="text-sm font-medium">列表</span></button>
                            <button onClick={() => { setActiveCharacterId(formData.id); openApp(AppID.Chat); }} className="text-xs px-3 py-1.5 bg-primary text-white rounded-full font-bold shadow-sm shadow-primary/30 flex items-center gap-1 active:scale-95 transition-transform"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926H16.5a.75.75 0 0 1 0 1.5H3.693l-1.414 4.926a.75.75 0 0 0 .826.95 28.897 28.897 0 0 0 15.293-7.155.75.75 0 0 0 0-1.114A28.897 28.897 0 0 0 3.105 2.288Z" /></svg>发消息</button>
                        </div>
                        <div className="flex gap-6 text-sm font-medium text-slate-400 pl-1">
                            <button onClick={() => setDetailTab('identity')} className={`pb-2 transition-colors relative ${detailTab === 'identity' ? 'text-slate-800' : ''}`}>设定{detailTab === 'identity' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-full"></div>}</button>
                            <button onClick={() => setDetailTab('memory')} className={`pb-2 transition-colors relative ${detailTab === 'memory' ? 'text-slate-800' : ''}`}>记忆 ({(formData.memories || []).length}){detailTab === 'memory' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-full"></div>}</button>
                            <button onClick={() => setDetailTab('impression')} className={`pb-2 transition-colors relative ${detailTab === 'impression' ? 'text-slate-800' : ''}`}>印象{detailTab === 'impression' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-full"></div>}</button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-5 no-scrollbar pb-10">
                        {detailTab === 'identity' && (
                            <div className="space-y-6 animate-fade-in">
                                <div className="flex items-center gap-5">
                                    <div className="relative group cursor-pointer w-24 h-24 shrink-0" onClick={() => fileInputRef.current?.click()}>
                                        <div className="w-full h-full rounded-[2rem] shadow-md bg-white border-4 border-white overflow-hidden relative"><img src={formData.avatar} className={`w-full h-full object-cover ${isCompressing ? 'opacity-50 blur-sm' : ''}`} alt="A" /></div>
                                        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
                                    </div>
                                    <div className="flex-1 space-y-3">
                                        <input value={formData.name} onChange={(e) => handleChange('name', e.target.value)} className="w-full bg-transparent py-1 text-xl font-medium text-slate-800 border-b border-slate-200" placeholder="名称" />
                                        <input value={formData.description} onChange={(e) => handleChange('description', e.target.value)} className="w-full bg-transparent py-1 text-sm text-slate-500 border-b border-slate-200" placeholder="描述" />
                                    </div>
                                </div>

                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">核心指令 (System Prompt)</label>
                                    <textarea value={formData.systemPrompt} onChange={(e) => handleChange('systemPrompt', e.target.value)} className="w-full h-40 bg-white rounded-3xl p-5 text-sm shadow-sm resize-none focus:ring-1 focus:ring-primary/20 transition-all" placeholder="设定..." />
                                </div>

                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">世界观 / 设定补充 (Worldview & Lore)</label>
                                    <textarea
                                        value={formData.worldview || ''}
                                        onChange={(e) => handleChange('worldview', e.target.value)}
                                        className="w-full h-24 bg-white rounded-3xl p-5 text-sm shadow-sm resize-none focus:ring-1 focus:ring-primary/20 transition-all"
                                        placeholder="在这个世界里，魔法是存在的..."
                                    />
                                </div>

                                {/* Worldbook Section */}
                                <div>
                                    <div className="flex justify-between items-center mb-2 px-1">
                                        <label className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest block">📚 扩展设定 (Worldbooks)</label>
                                        <button onClick={() => setShowWorldbookModal(true)} className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-1 rounded font-bold hover:bg-indigo-100">+ 挂载</button>
                                    </div>
                                    <div className="space-y-2">
                                        {formData.mountedWorldbooks && formData.mountedWorldbooks.length > 0 ? (
                                            formData.mountedWorldbooks.map((wb, index) => (
                                                <div key={wb.id} className="flex items-center justify-between bg-white px-3 py-2.5 rounded-2xl border border-indigo-50 shadow-sm group">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="text-[10px] font-mono text-slate-300 w-4 text-center shrink-0">{index + 1}</span>
                                                        <span className="text-lg shrink-0">📖</span>
                                                        <div className="flex flex-col min-w-0">
                                                            <span className="text-sm font-bold text-slate-700 truncate">{wb.title}</span>
                                                            <div className="flex items-center gap-1.5">
                                                                {wb.category && <span className="text-[9px] text-slate-400">{wb.category}</span>}
                                                                {wb.position && wb.position !== 'after_worldview' && (
                                                                    <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold ${wb.position === 'top' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                                                                        wb.position === 'bottom' ? 'bg-rose-50 text-rose-600 border border-rose-100' :
                                                                            'bg-sky-50 text-sky-600 border border-sky-100'
                                                                        }`}>
                                                                        {wb.position === 'top' ? '人设之前' : wb.position === 'bottom' ? '记忆之后' : '印象之后'}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-0.5 shrink-0 ml-2">
                                                        <button onClick={() => moveWorldbook(index, 'up')} disabled={index === 0} className="text-slate-300 hover:text-indigo-500 disabled:opacity-20 disabled:cursor-not-allowed p-1 transition-colors" title="上移">
                                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>
                                                        </button>
                                                        <button onClick={() => moveWorldbook(index, 'down')} disabled={index === (formData.mountedWorldbooks?.length ?? 0) - 1} className="text-slate-300 hover:text-indigo-500 disabled:opacity-20 disabled:cursor-not-allowed p-1 transition-colors" title="下移">
                                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                                                        </button>
                                                        <button onClick={() => unmountWorldbook(wb.id)} className="text-slate-300 hover:text-red-400 p-1 transition-colors" title="卸载">×</button>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-center py-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400 text-xs">
                                                暂未挂载任何世界书
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Export Card Button */}
                                <div className="pt-4">
                                    <button
                                        onClick={handleExportCard}
                                        className="w-full py-4 bg-slate-800 text-white rounded-2xl text-xs font-bold shadow-lg flex items-center justify-center gap-2 hover:bg-slate-700 active:scale-95 transition-all"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
                                        </svg>
                                        分享 / 导出角色卡
                                    </button>
                                    <p className="text-[10px] text-slate-400 text-center mt-2">导出内容不包含记忆库和聊天记录</p>
                                </div>
                            </div>
                        )}

                        {detailTab === 'memory' && (
                            <div className="space-y-4 animate-fade-in">
                                <div className="flex justify-center gap-2 mb-4">
                                    <button onClick={() => setShowBatchModal(true)} className="px-4 py-2 bg-white rounded-full text-xs font-semibold text-slate-500 shadow-sm border border-slate-100">批量总结（可指定日期）</button>
                                    <button onClick={() => setShowImportModal(true)} className="px-4 py-2 bg-white rounded-full text-xs font-semibold text-slate-500 shadow-sm border border-slate-100">导入/清洗</button>
                                    <button onClick={handleExportPreview} className="px-4 py-2 bg-white rounded-full text-xs font-semibold text-slate-500 shadow-sm border border-slate-100">备份</button>
                                </div>

                                
                                {/* ====== 统一记忆中心 ====== */}
                                <MemoryCenter
                                    memories={formData.memories || []}
                                    refinedMemories={formData.refinedMemories || {}}
                                    activeMemoryMonths={formData.activeMemoryMonths || []}
                                    charName={formData.name || ''}
                                    userName={userProfile.name}
                                    onRefine={handleRefineMonth}
                                    onDeleteMemories={handleDeleteMemories}
                                    onUpdateMemory={handleUpdateMemory}
                                    onToggleActiveMonth={handleToggleActiveMonth}
                                    onUpdateRefinedMemory={handleUpdateRefinedMemory}
                                    onDeleteRefinedMemory={handleDeleteRefinedMemory}
                                    formData={formData}
                                    handleChange={handleChange}
                                    addToast={addToast}
                                    apiConfig={apiConfig}
                                />
                            </div>
                        )}

                        {detailTab === 'impression' && (
                            <ImpressionPanel
                                impression={formData.impression}
                                isGenerating={isGeneratingImpression}
                                onGenerate={handleGenerateImpression}
                                onUpdateImpression={(newImp) => handleChange('impression', newImp)}
                                onDelete={() => handleChange('impression', undefined)}
                            />
                        )}
                    </div>
                </div>
            )}

            {/* Modals ... */}
            <Modal isOpen={showImportModal} title="记忆导入/清洗" onClose={() => setShowImportModal(false)} footer={<><button onClick={() => setShowImportModal(false)} className="flex-1 py-3 bg-slate-100 text-slate-500 font-bold rounded-2xl">取消</button><button onClick={handleImportMemories} disabled={isProcessingMemory} className="flex-1 py-3 bg-primary text-white font-bold rounded-2xl shadow-lg shadow-primary/30 flex items-center justify-center gap-2">{isProcessingMemory && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>}{isProcessingMemory ? '处理中...' : '开始执行'}</button></>}>
                <div className="space-y-3"><div className="text-xs text-slate-400 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">AI 将自动整理乱序文本为记忆档案。</div>{importStatus && <div className="text-xs text-primary font-medium">{importStatus}</div>}<textarea value={importText} onChange={e => setImportText(e.target.value)} placeholder="在此粘贴文本..." className="w-full h-32 bg-slate-100 border-none rounded-2xl px-4 py-3 text-sm text-slate-700 resize-none focus:ring-2 focus:ring-primary/20 transition-all" /></div>
            </Modal>

            <Modal isOpen={showBatchModal} title="批量记忆总结" onClose={() => { setShowBatchModal(false); setShowPromptEditor(false); }} footer={
                isBatchProcessing ?
                    <div className="w-full py-3 bg-slate-100 text-primary font-bold rounded-2xl text-center flex items-center justify-center gap-2"><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>{batchProgress}</div> :
                    <button onClick={handleBatchSummarize} className="w-full py-3 bg-primary text-white font-bold rounded-2xl">开始生成</button>
            }>
                <div className="space-y-3">
                    <p className="text-xs text-slate-400">将遍历所有聊天记录，按天使用所选提示词模板生成记忆总结。</p>
                    {/* Prompt Selection */}
                    <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-100">
                        <label className="text-[10px] font-bold text-indigo-400 uppercase mb-2 block">选择提示词模板</label>
                        <div className="flex flex-col gap-2">
                            {archivePrompts.map(p => (
                                <div key={p.id} onClick={() => { setSelectedPromptId(p.id); localStorage.setItem('chat_active_archive_prompt_id', p.id); }} className={`p-2.5 rounded-lg border cursor-pointer flex items-center justify-between ${selectedPromptId === p.id ? 'bg-white border-indigo-500 shadow-sm ring-1 ring-indigo-500' : 'bg-white/50 border-indigo-200 hover:bg-white'}`}>
                                    <span className={`text-xs font-bold ${selectedPromptId === p.id ? 'text-indigo-700' : 'text-slate-600'}`}>{p.name}</span>
                                    <div className="flex gap-1.5">
                                        <button onClick={(e) => { e.stopPropagation(); setEditingPrompt(p); setShowPromptEditor(true); }} className="text-[10px] text-slate-400 hover:text-indigo-500 px-2 py-0.5 rounded bg-slate-100 hover:bg-indigo-50">查看</button>
                                        {!p.id.startsWith('preset_') && (
                                            <button onClick={(e) => { e.stopPropagation(); const next = archivePrompts.filter(ap => ap.id !== p.id); setArchivePrompts(next); localStorage.setItem('chat_archive_prompts', JSON.stringify(next.filter(ap => !ap.id.startsWith('preset_')))); if (selectedPromptId === p.id) setSelectedPromptId('preset_rational'); }} className="text-[10px] text-red-300 hover:text-red-500 px-1.5 py-0.5 rounded hover:bg-red-50">x</button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <button onClick={() => { const newP = { id: `custom_${Date.now()}`, name: '新自定义模板', content: DEFAULT_ARCHIVE_PROMPTS[0].content }; setEditingPrompt(newP); setShowPromptEditor(true); }} className="mt-2 w-full py-1.5 text-xs font-bold text-indigo-500 border border-dashed border-indigo-300 rounded-lg hover:bg-indigo-100">+ 新建自定义提示词</button>
                    </div>
                    {/* Date Range */}
                    <div className="flex gap-2">
                        <div className="flex-1"><label className="text-[10px] uppercase text-slate-400 font-bold">开始日期 (可选)</label><input type="date" value={batchRange.start} onChange={e => setBatchRange({ ...batchRange, start: e.target.value })} className="w-full bg-slate-100 rounded-xl px-3 py-2 text-xs" /></div>
                        <div className="flex-1"><label className="text-[10px] uppercase text-slate-400 font-bold">结束日期 (可选)</label><input type="date" value={batchRange.end} onChange={e => setBatchRange({ ...batchRange, end: e.target.value })} className="w-full bg-slate-100 rounded-xl px-3 py-2 text-xs" /></div>
                    </div>
                    <div className="text-[10px] text-slate-400 bg-slate-50 p-2.5 rounded-xl leading-relaxed">
                        支持变量: <code>{'${dateStr}'}</code>, <code>{'${char.name}'}</code>, <code>{'${userProfile.name}'}</code>, <code>{'${rawLog}'}</code>
                    </div>
                </div>
            </Modal>

            {/* Prompt Editor Modal */}
            <Modal isOpen={showPromptEditor} title="编辑提示词" onClose={() => setShowPromptEditor(false)} footer={<button onClick={() => {
                if (!editingPrompt) return;
                const isNew = !archivePrompts.some(p => p.id === editingPrompt.id);
                const next = isNew ? [...archivePrompts, editingPrompt] : archivePrompts.map(p => p.id === editingPrompt.id ? editingPrompt : p);
                setArchivePrompts(next);
                setSelectedPromptId(editingPrompt.id);
                localStorage.setItem('chat_archive_prompts', JSON.stringify(next.filter(p => !p.id.startsWith('preset_'))));
                localStorage.setItem('chat_active_archive_prompt_id', editingPrompt.id);
                setShowPromptEditor(false);
                addToast('提示词已保存', 'success');
            }} className="w-full py-3 bg-primary text-white font-bold rounded-2xl">保存</button>}>
                <div className="space-y-3">
                    <input
                        value={editingPrompt?.name || ''}
                        onChange={e => setEditingPrompt(prev => prev ? { ...prev, name: e.target.value } : null)}
                        placeholder="预设名称"
                        className="w-full px-4 py-2 bg-slate-100 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-primary/20"
                        readOnly={editingPrompt?.id.startsWith('preset_')}
                    />
                    <textarea
                        value={editingPrompt?.content || ''}
                        onChange={e => setEditingPrompt(prev => prev ? { ...prev, content: e.target.value } : null)}
                        className="w-full h-64 bg-slate-100 rounded-xl p-3 text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 leading-relaxed"
                        placeholder="输入提示词内容..."
                        readOnly={editingPrompt?.id.startsWith('preset_')}
                    />
                    {editingPrompt?.id.startsWith('preset_') && (
                        <p className="text-[10px] text-slate-400 text-center">预设模板不可编辑（仅查看）</p>
                    )}
                </div>
            </Modal>

            <Modal isOpen={showExportModal} title="导出文本" onClose={() => setShowExportModal(false)} footer={<div className="flex gap-2 w-full"><button onClick={() => { navigator.clipboard.writeText(exportText); addToast('已复制', 'success'); }} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl">复制全文</button>{Capacitor.isNativePlatform() ? (<button onClick={handleNativeShare} className="flex-1 py-3 bg-slate-800 text-white font-bold rounded-2xl shadow-lg flex items-center justify-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" /></svg>文件分享</button>) : (<button onClick={handleWebFileDownload} className="flex-1 py-3 bg-primary text-white font-bold rounded-2xl shadow-lg flex items-center justify-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>下载文本</button>)}</div>}>
                <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 space-y-2"><div className="text-[10px] text-slate-400">已自动复制到剪贴板。如果分享失败，请直接手动复制。</div><textarea value={exportText} readOnly className="w-full h-40 bg-transparent border-none text-[10px] font-mono text-slate-600 resize-none focus:ring-0 leading-relaxed select-all" onClick={(e) => e.currentTarget.select()} /></div>
            </Modal>

            {/* Worldbook Select Modal */}
            <Modal
                isOpen={showWorldbookModal}
                title="挂载世界书"
                onClose={() => setShowWorldbookModal(false)}
            >
                <div className="max-h-[50vh] overflow-y-auto no-scrollbar space-y-4 p-1">
                    {worldbooks.length === 0 ? (
                        <div className="text-center text-slate-400 text-xs py-8">
                            还没有世界书，请去桌面【世界书】App 创建。
                        </div>
                    ) : (
                        // Group books for UI
                        Object.entries(worldbooks.reduce((acc, wb) => {
                            const cat = wb.category || '未分类设定 (General)';
                            if (!acc[cat]) acc[cat] = [];
                            acc[cat].push(wb);
                            return acc;
                        }, {} as Record<string, typeof worldbooks>)).map(([category, books]) => (
                            <div key={category} className="space-y-2">
                                <div className="flex justify-between items-center px-1">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">{category}</h4>
                                    <button
                                        onClick={() => mountCategory(category)}
                                        className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded font-bold hover:bg-indigo-100"
                                    >
                                        挂载整组
                                    </button>
                                </div>
                                {books.map(wb => {
                                    const isMounted = formData?.mountedWorldbooks?.some(m => m.id === wb.id);
                                    return (
                                        <button
                                            key={wb.id}
                                            onClick={() => !isMounted && mountWorldbook(wb.id)}
                                            disabled={isMounted}
                                            className={`w-full p-4 rounded-xl border text-left transition-all ${isMounted ? 'bg-slate-50 border-slate-200 opacity-50 cursor-not-allowed' : 'bg-white border-indigo-100 hover:border-indigo-300 shadow-sm active:scale-95'}`}
                                        >
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="font-bold text-slate-700 text-sm truncate">{wb.title}</span>
                                                {isMounted && <span className="text-[10px] text-slate-400">已挂载</span>}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        ))
                    )}
                </div>
            </Modal>

            <Modal
                isOpen={!!deleteConfirmTarget}
                title="断开连接"
                onClose={() => setDeleteConfirmTarget(null)}
                footer={<div className="flex gap-2 w-full"><button onClick={() => setDeleteConfirmTarget(null)} className="flex-1 py-3 bg-slate-100 text-slate-500 rounded-2xl font-bold">保留</button><button onClick={confirmDeleteCharacter} className="flex-1 py-3 bg-red-500 text-white font-bold rounded-2xl shadow-lg shadow-red-200">确认断开</button></div>}
            >
                <div className="flex flex-col items-center gap-3 py-4">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 text-slate-300"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
                    <p className="text-sm text-slate-600 text-center leading-relaxed">
                        确定要删除与该角色的所有连接吗？<br />
                        <span className="text-xs text-red-400 font-bold">该操作不可恢复，记忆将被清空。</span>
                    </p>
                </div>
            </Modal>
        </div>
    );
};
export default Character;
