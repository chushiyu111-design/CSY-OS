
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useOS } from '../context/OSContext';
import { NovelBook, NovelProtagonist, CharacterProfile } from '../types';
import Modal from '../components/os/Modal';
import ConfirmDialog from '../components/os/ConfirmDialog';
import { processImage } from '../utils/file';
import { NOVEL_THEMES, analyzeWriterPersonaSimple } from '../utils/novelUtils';
import NovelWriter from '../components/novel/NovelWriter';

const NovelApp: React.FC = () => {
    const { closeApp, novels, addNovel, updateNovel, deleteNovel, characters, updateCharacter, apiConfig, addToast, userProfile, worldbooks } = useOS();
    
    // Navigation State
    const [view, setView] = useState<'shelf' | 'create' | 'write' | 'settings' | 'library'>('shelf');
    const [activeBook, setActiveBook] = useState<NovelBook | null>(null);
    const [activeTheme, setActiveTheme] = useState(NOVEL_THEMES[0]);

    // Create / Settings Form
    const [tempTitle, setTempTitle] = useState('');
    const [tempSubtitle, setTempSubtitle] = useState('');
    const [tempSummary, setTempSummary] = useState('');
    const [tempWorld, setTempWorld] = useState('');
    const [selectedCollaborators, setSelectedCollaborators] = useState<Set<string>>(new Set());
    const [tempProtagonists, setTempProtagonists] = useState<NovelProtagonist[]>([]);
    
    // Cover Image State
    const [coverInputUrl, setCoverInputUrl] = useState('');
    const [tempCoverImage, setTempCoverImage] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    // Protagonist Modal State
    const [editingProtagonist, setEditingProtagonist] = useState<NovelProtagonist | null>(null);
    const [isProtagonistModalOpen, setIsProtagonistModalOpen] = useState(false);
    
    // Protagonist Import State
    const [isProtoImportOpen, setIsProtoImportOpen] = useState(false);
    const [importTab, setImportTab] = useState<'system' | 'history'>('system');

    // Worldbook Import Modal State
    const [isWorldbookModalOpen, setIsWorldbookModalOpen] = useState(false);

    // Persona View Modal State
    const [showPersonaModal, setShowPersonaModal] = useState(false);
    const [libraryPersonaChar, setLibraryPersonaChar] = useState<CharacterProfile | null>(null);

    // Dialog
    const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean; title: string; message: string; variant: 'danger' | 'warning' | 'info'; confirmText?: string; onConfirm: () => void; } | null>(null);

    // Writer State (Lifted slightly for init)
    const [targetCharId, setTargetCharId] = useState<string | null>(null);

    // Helpers
    const getTheme = (styleId: string) => NOVEL_THEMES.find(t => t.id === styleId) || NOVEL_THEMES[0];

    const collaborators = useMemo(() => {
        if (!activeBook) return [];
        return characters.filter(c => activeBook.collaboratorIds.includes(c.id));
    }, [activeBook, characters]);

    const historyProtagonists = useMemo(() => {
        const all: NovelProtagonist[] = [];
        const seen = new Set<string>();
        novels.forEach(n => {
            n.protagonists.forEach(p => {
                const key = `${p.name}-${p.role}`;
                if (!seen.has(key)) { seen.add(key); all.push(p); }
            });
        });
        return all;
    }, [novels]);

    useEffect(() => {
        if (activeBook && collaborators.length > 0 && !targetCharId) {
            setTargetCharId(collaborators[0].id);
        }
    }, [activeBook, collaborators]);

    useEffect(() => {
        if (activeBook) {
            setActiveTheme(getTheme(activeBook.coverStyle));
        }
    }, [activeBook]);

    // --- CRUD ---

    const handleCreateBook = () => {
        if (!tempTitle.trim()) { addToast('请输入标题', 'error'); return; }
        const newBook: NovelBook = {
            id: `novel-${Date.now()}`,
            title: tempTitle, subtitle: tempSubtitle, summary: tempSummary,
            coverStyle: activeTheme.id, coverImage: tempCoverImage, worldSetting: tempWorld,
            collaboratorIds: Array.from(selectedCollaborators), protagonists: tempProtagonists,
            segments: [], createdAt: Date.now(), lastActiveAt: Date.now()
        };
        addNovel(newBook);
        setActiveBook(newBook);
        setView('write');
        resetTempState();
    };

    const handleEditBookSettings = () => {
        if (!activeBook) return;
        setTempTitle(activeBook.title);
        setTempSubtitle(activeBook.subtitle || '');
        setTempSummary(activeBook.summary);
        setTempWorld(activeBook.worldSetting);
        setActiveTheme(getTheme(activeBook.coverStyle));
        setTempCoverImage(activeBook.coverImage || '');
        setSelectedCollaborators(new Set(activeBook.collaboratorIds));
        setTempProtagonists(activeBook.protagonists);
        setView('settings');
    };

    const handleSaveSettings = async () => {
        if (!activeBook) return;
        const updated = {
            ...activeBook,
            title: tempTitle, subtitle: tempSubtitle, summary: tempSummary,
            worldSetting: tempWorld, coverStyle: activeTheme.id, coverImage: tempCoverImage,
            collaboratorIds: Array.from(selectedCollaborators), protagonists: tempProtagonists,
            segments: activeBook.segments, lastActiveAt: Date.now()
        };
        await updateNovel(activeBook.id, updated);
        setActiveBook(updated);
        setView('write');
        addToast('设定已更新，内容完好', 'success');
    };

    const resetTempState = () => {
        setTempTitle(''); setTempSubtitle(''); setTempSummary(''); setTempWorld(''); setSelectedCollaborators(new Set()); setTempProtagonists([]); setTempCoverImage(''); setCoverInputUrl('');
    };

    const handleDeleteBook = async (id: string) => {
        setConfirmDialog({
            isOpen: true, title: '删除作品', message: '确定要删除这本小说吗？此操作无法撤销。', variant: 'danger',
            onConfirm: () => { deleteNovel(id); if (activeBook?.id === id) setView('shelf'); addToast('已删除', 'success'); setConfirmDialog(null); }
        });
    };

    // --- Cover Image Logic ---
    const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            try {
                const base64 = await processImage(file, { maxWidth: 800, quality: 0.8 });
                setTempCoverImage(base64);
            } catch (e) { addToast('图片处理失败', 'error'); }
        }
    };

    const handleCoverUrlBlur = () => { if (coverInputUrl) setTempCoverImage(coverInputUrl); };

    // --- Protagonist Management ---
    const openProtagonistEdit = (p?: NovelProtagonist) => {
        setEditingProtagonist(p || { id: `proto-${Date.now()}`, name: '', role: '主角', description: '' });
        setIsProtagonistModalOpen(true);
    };

    const saveProtagonist = () => {
        if (!editingProtagonist || !editingProtagonist.name.trim()) { addToast('角色名不能为空', 'error'); return; }
        setTempProtagonists(prev => {
            const exists = prev.find(p => p.id === editingProtagonist.id);
            return exists ? prev.map(p => p.id === editingProtagonist.id ? editingProtagonist : p) : [...prev, editingProtagonist];
        });
        setIsProtagonistModalOpen(false);
        setEditingProtagonist(null);
    };

    const handleImportProtagonist = (p: {name: string, role?: string, description: string}) => {
        const newP: NovelProtagonist = { id: `proto-${Date.now()}-${Math.random()}`, name: p.name, role: p.role || '主角', description: p.description || '' };
        setTempProtagonists(prev => [...prev, newP]);
        setIsProtoImportOpen(false);
        addToast(`已导入角色: ${p.name}`, 'success');
    };

    const importWorldbook = (wb: any) => {
        const textToAppend = `\n\n【${wb.title}】\n${wb.content}`;
        setTempWorld(prev => (prev + textToAppend).trim());
        setIsWorldbookModalOpen(false);
        addToast(`已导入设定: ${wb.title}`, 'success');
    };

    const ProtagonistCard = ({ p, onDelete, onClick }: { p: NovelProtagonist, onDelete?: () => void, onClick?: () => void }) => (
        <div onClick={onClick} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm relative group cursor-pointer hover:border-slate-400 transition-colors">
            <div className="font-bold text-slate-800 text-sm flex justify-between"><span>{p.name}</span><span className="text-[10px] bg-slate-100 px-1.5 rounded text-slate-500 font-normal">{p.role}</span></div>
            <div className="text-xs text-slate-500 mt-1 line-clamp-2">{p.description || "暂无描述"}</div>
            {onDelete && <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="absolute top-1 right-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">×</button>}
        </div>
    );

    // --- Renderers ---

    // 4. Character Library View
    if (view === 'library') {
        return (
            <div className="h-full w-full bg-slate-50 flex flex-col font-sans">
                <div className="h-20 bg-white/80 backdrop-blur-md flex items-end pb-3 px-6 border-b border-slate-200 shrink-0 sticky top-0 z-20">
                    <div className="flex justify-between items-center w-full">
                        <button onClick={() => setView('shelf')} className="p-2 -ml-2 rounded-full hover:bg-slate-100 active:scale-90 transition-transform">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-slate-600"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                        </button>
                        <span className="font-bold text-slate-800 text-lg tracking-wide">角色库</span>
                        <div className="w-8"></div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar">
                    <section>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><span>🤖</span> 系统角色 (AI Collaborators)</h3>
                        <div className="grid grid-cols-2 gap-4">
                            {characters.map(c => (
                                <div key={c.id} onClick={() => { setLibraryPersonaChar(c); setShowPersonaModal(true); }} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center gap-3 cursor-pointer hover:shadow-md transition-all active:scale-95">
                                    <img src={c.avatar} className="w-16 h-16 rounded-full object-cover border-2 border-slate-50" />
                                    <div className="text-center"><div className="font-bold text-slate-700 text-sm">{c.name}</div><div className="text-[10px] text-slate-400 mt-1 px-2 py-0.5 bg-slate-50 rounded-full">共创者</div></div>
                                </div>
                            ))}
                        </div>
                    </section>
                    <section>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><span>🎭</span> 历史剧中人 (From History)</h3>
                        {historyProtagonists.length === 0 ? <div className="text-center py-8 text-slate-400 text-xs">暂无历史角色数据</div> : <div className="grid grid-cols-1 gap-3">{historyProtagonists.map((p, idx) => (<div key={idx} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm"><div className="flex justify-between items-start mb-2"><span className="font-bold text-slate-800">{p.name}</span><span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded border border-indigo-100">{p.role}</span></div><p className="text-xs text-slate-500 leading-relaxed line-clamp-3">{p.description || "暂无描述"}</p></div>))}</div>}
                    </section>
                </div>

                <Modal isOpen={showPersonaModal} title={libraryPersonaChar?.name || '角色风格'} onClose={() => setShowPersonaModal(false)}>
                    <div className="max-h-[60vh] overflow-y-auto space-y-4 p-1">
                        {libraryPersonaChar ? <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">{libraryPersonaChar.writerPersona || analyzeWriterPersonaSimple(libraryPersonaChar)}</div> : null}
                    </div>
                </Modal>
            </div>
        );
    }

    // 1. Shelf View
    if (view === 'shelf') {
        return (
            <div className="h-full w-full bg-slate-50 flex flex-col font-sans relative">
                <ConfirmDialog isOpen={!!confirmDialog} title={confirmDialog?.title || ''} message={confirmDialog?.message || ''} variant={confirmDialog?.variant} confirmText={confirmDialog?.confirmText || (confirmDialog?.onConfirm ? '确认' : 'OK')} onConfirm={confirmDialog?.onConfirm || (() => setConfirmDialog(null))} onCancel={() => setConfirmDialog(null)} />
                <div className="h-24 flex items-end justify-between px-6 pb-6 bg-white/80 backdrop-blur-md z-20 shrink-0 border-b border-slate-100">
                    <button onClick={closeApp} className="p-3 -ml-3 rounded-full hover:bg-slate-100 active:scale-95 transition-all"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 text-slate-600"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg></button>
                    <span className="font-black text-2xl text-slate-800 tracking-tight">我的手稿</span>
                    <div className="flex gap-2">
                        <button onClick={() => setView('library')} className="w-10 h-10 bg-white text-slate-600 border border-slate-200 rounded-full flex items-center justify-center shadow-sm active:scale-95 transition-transform hover:bg-slate-50"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" /></svg></button>
                        <button onClick={() => { setView('create'); resetTempState(); }} className="w-10 h-10 bg-slate-900 text-white rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform hover:bg-black"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg></button>
                    </div>
                </div>
                <div className="p-6 grid grid-cols-2 gap-5 overflow-y-auto pb-24">
                    {novels.map(book => {
                        const style = getTheme(book.coverStyle);
                        const wordCount = book.segments.reduce((acc, seg) => acc + (seg.type === 'story' ? seg.content.length : 0), 0);
                        const bgStyle = book.coverImage ? { backgroundImage: `url(${book.coverImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {};
                        return (
                            <div key={book.id} onClick={() => { setActiveBook(book); setView('write'); }} className="group relative aspect-auto min-h-[14rem] bg-white rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden border border-slate-100 cursor-pointer flex flex-col">
                                <div className={`h-28 shrink-0 ${style.bg} relative p-4 flex flex-col justify-end`} style={bgStyle}>
                                    <div className={`absolute inset-0 ${book.coverImage ? 'bg-black/30' : ''}`}></div>
                                    <div className="relative z-10"><h3 className={`font-bold text-lg leading-tight line-clamp-2 ${book.coverImage ? 'text-white drop-shadow-md' : style.text}`}>{book.title}</h3>{book.subtitle && <p className={`text-[10px] font-bold opacity-80 uppercase tracking-wide truncate ${book.coverImage ? 'text-white' : style.text}`}>{book.subtitle}</p>}</div>
                                </div>
                                <div className="p-4 flex-1 flex flex-col justify-between">
                                    <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed mb-3">{book.summary || '暂无简介...'}</p>
                                    <div className="flex items-center justify-between pt-3 border-t border-slate-50"><div className="flex -space-x-2">{characters.filter(c => book.collaboratorIds.includes(c.id)).map(c => (<img key={c.id} src={c.avatar} className="w-6 h-6 rounded-full border-2 border-white object-cover" />))}</div><span className="text-[10px] text-slate-400 font-mono bg-slate-50 px-2 py-0.5 rounded-full">{(wordCount/1000).toFixed(1)}k 字</span></div>
                                </div>
                                <button onClick={(e) => { e.stopPropagation(); handleDeleteBook(book.id); }} className="absolute top-2 right-2 text-slate-400/50 hover:text-red-500 p-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white/20 backdrop-blur rounded-full">×</button>
                            </div>
                        );
                    })}
                    {novels.length === 0 && <div className="col-span-2 flex flex-col items-center justify-center h-64 text-slate-300 gap-3"><span className="text-4xl opacity-50 grayscale">🖋️</span><span className="text-sm font-sans">点击右上角，开始创作</span></div>}
                </div>
            </div>
        );
    }

    // 2. Create / Settings View
    if (view === 'create' || view === 'settings') {
        return (
            <div className="h-full w-full bg-slate-50 flex flex-col font-sans relative">
                <ConfirmDialog isOpen={!!confirmDialog} title={confirmDialog?.title || ''} message={confirmDialog?.message || ''} variant={confirmDialog?.variant} confirmText={confirmDialog?.confirmText || (confirmDialog?.onConfirm ? '确认' : 'OK')} onConfirm={confirmDialog?.onConfirm || (() => setConfirmDialog(null))} onCancel={() => setConfirmDialog(null)} />
                <div className="h-16 flex items-center justify-between px-4 bg-white border-b border-slate-200 shrink-0 sticky top-0 z-20">
                    <button onClick={() => setView(view === 'create' ? 'shelf' : 'write')} className="text-slate-500 text-sm">取消</button>
                    <span className="font-bold text-slate-800">{view === 'create' ? '新建书稿' : '小说设定'}</span>
                    <button onClick={view === 'create' ? handleCreateBook : handleSaveSettings} className="bg-slate-800 text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-md active:scale-95 transition-transform">保存</button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-8 pb-20">
                    <section className="space-y-4">
                        <input value={tempTitle} onChange={e => setTempTitle(e.target.value)} placeholder="书名" className="w-full text-2xl font-bold bg-transparent border-b border-slate-200 py-2 outline-none focus:border-slate-800 font-serif" />
                        <input value={tempSubtitle} onChange={e => setTempSubtitle(e.target.value)} placeholder="卷名/副标题" className="w-full text-sm font-bold bg-transparent border-b border-slate-200 py-2 outline-none focus:border-slate-800 text-slate-600" />
                        <textarea value={tempSummary} onChange={e => setTempSummary(e.target.value)} placeholder="一句话简介..." className="w-full h-20 bg-slate-100 rounded-xl p-3 text-sm resize-none outline-none" />
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">内页风格</label>
                            <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">{NOVEL_THEMES.map(t => (<button key={t.id} onClick={() => setActiveTheme(t)} className={`w-12 h-16 rounded-md shadow-sm border-2 shrink-0 ${t.bg} ${activeTheme.id === t.id ? 'border-slate-800 scale-105' : 'border-transparent'}`}></button>))}</div>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">自定义封面</label>
                            <div className="flex gap-3 items-center">
                                <div onClick={() => fileInputRef.current?.click()} className="w-16 h-24 bg-slate-100 rounded-md border-2 border-dashed border-slate-300 flex items-center justify-center cursor-pointer hover:border-slate-500 relative overflow-hidden">{tempCoverImage ? <img src={tempCoverImage} className="w-full h-full object-cover" /> : <span className="text-xs text-slate-400">+</span>}<input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleCoverUpload} /></div>
                                <div className="flex-1 space-y-2"><input value={coverInputUrl} onChange={e => setCoverInputUrl(e.target.value)} onBlur={handleCoverUrlBlur} placeholder="粘贴图片链接..." className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-slate-400" />{tempCoverImage && <button onClick={() => { setTempCoverImage(''); setCoverInputUrl(''); }} className="text-xs text-red-400 underline">清除封面</button>}</div>
                            </div>
                        </div>
                    </section>
                    <section className="space-y-4">
                        <div className="flex justify-between items-center"><label className="text-xs font-bold text-slate-400 uppercase block">世界观设定</label><button onClick={() => setIsWorldbookModalOpen(true)} className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-1 rounded font-bold hover:bg-indigo-100 flex items-center gap-1"><span>📚</span> 导入世界书</button></div>
                        <textarea value={tempWorld} onChange={e => setTempWorld(e.target.value)} placeholder="世界观设定..." className="w-full h-32 bg-white border border-slate-200 rounded-xl p-3 text-sm resize-none outline-none focus:border-slate-400" />
                    </section>
                    <section className="space-y-4">
                        <label className="text-xs font-bold text-slate-400 uppercase block">共创者</label>
                        <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">{characters.map(c => (<div key={c.id} onClick={() => { const s = new Set(selectedCollaborators); if(s.has(c.id)) s.delete(c.id); else s.add(c.id); setSelectedCollaborators(s); }} className={`flex flex-col items-center gap-2 cursor-pointer transition-opacity ${selectedCollaborators.has(c.id) ? 'opacity-100' : 'opacity-50 grayscale'}`}><img src={c.avatar} className="w-12 h-12 rounded-full object-cover shadow-sm" /><span className="text-[10px] font-bold text-slate-600">{c.name}</span></div>))}</div>
                    </section>
                    <section className="space-y-4">
                        <div className="flex justify-between items-center"><label className="text-xs font-bold text-slate-400 uppercase">剧中人</label><div className="flex gap-2"><button onClick={() => setIsProtoImportOpen(true)} className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-1 rounded font-bold hover:bg-indigo-100 border border-indigo-100">📂 导入</button><button onClick={() => openProtagonistEdit()} className="text-[10px] bg-slate-100 px-2 py-1 rounded text-slate-600 hover:bg-slate-200 transition-colors">+ 添加</button></div></div>
                        <div className="grid grid-cols-2 gap-3">{tempProtagonists.map((p, idx) => (<ProtagonistCard key={p.id} p={p} onClick={() => openProtagonistEdit(p)} onDelete={() => setTempProtagonists(tempProtagonists.filter((_, i) => i !== idx))} />))}</div>
                    </section>
                </div>
                <Modal isOpen={isProtagonistModalOpen} title="编辑角色" onClose={() => setIsProtagonistModalOpen(false)} footer={<button onClick={saveProtagonist} className="w-full py-3 bg-slate-800 text-white font-bold rounded-2xl">保存</button>}>{editingProtagonist && (<div className="space-y-4"><div><label className="text-xs font-bold text-slate-400 uppercase block mb-1">姓名</label><input value={editingProtagonist.name} onChange={e => setEditingProtagonist({...editingProtagonist, name: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold" /></div><div><label className="text-xs font-bold text-slate-400 uppercase block mb-1">定位</label><input value={editingProtagonist.role} onChange={e => setEditingProtagonist({...editingProtagonist, role: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm" placeholder="主角 / 反派" /></div><div><label className="text-xs font-bold text-slate-400 uppercase block mb-1">设定</label><textarea value={editingProtagonist.description} onChange={e => setEditingProtagonist({...editingProtagonist, description: e.target.value})} className="w-full h-32 bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm resize-none leading-relaxed" /></div></div>)}</Modal>
                <Modal isOpen={isProtoImportOpen} title="导入角色" onClose={() => setIsProtoImportOpen(false)}><div className="flex p-1 bg-slate-100 rounded-xl mb-3"><button onClick={() => setImportTab('system')} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${importTab === 'system' ? 'bg-white shadow text-indigo-600' : 'text-slate-400'}`}>系统角色 (AI)</button><button onClick={() => setImportTab('history')} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${importTab === 'history' ? 'bg-white shadow text-indigo-600' : 'text-slate-400'}`}>历史角色</button></div><div className="max-h-[50vh] overflow-y-auto no-scrollbar space-y-3 p-1">{importTab === 'system' && characters.map(c => (<button key={c.id} onClick={() => handleImportProtagonist({name: c.name, role: '客串', description: c.description})} className="w-full flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-xl hover:border-indigo-200 shadow-sm active:scale-95 transition-all text-left"><img src={c.avatar} className="w-8 h-8 rounded-full object-cover" /><div className="flex-1 min-w-0"><div className="font-bold text-sm text-slate-700">{c.name}</div><div className="text-[10px] text-slate-400 truncate">{c.description}</div></div></button>))}{importTab === 'history' && historyProtagonists.map((p, idx) => (<button key={`hist-${idx}`} onClick={() => handleImportProtagonist(p)} className="w-full flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-xl hover:border-indigo-200 shadow-sm active:scale-95 transition-all text-left"><div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 border border-slate-200">{p.name[0]}</div><div className="flex-1 min-w-0"><div className="font-bold text-sm text-slate-700">{p.name}</div><div className="text-[10px] text-slate-400 truncate">{p.role} - {p.description || "无描述"}</div></div></button>))}</div></Modal>
                <Modal isOpen={isWorldbookModalOpen} title="导入世界书设定" onClose={() => setIsWorldbookModalOpen(false)}><div className="max-h-[50vh] overflow-y-auto no-scrollbar space-y-2 p-1">{worldbooks.map(wb => (<button key={wb.id} onClick={() => importWorldbook(wb)} className="w-full text-left p-3 rounded-xl border border-slate-100 hover:border-indigo-300 bg-white shadow-sm active:scale-95 transition-all"><div className="font-bold text-slate-700 text-sm">{wb.title}</div><div className="text-[10px] text-slate-400 mt-1">{wb.category || '未分类'}</div></button>))}</div></Modal>
            </div>
        );
    }

    // 3. Writing View (Delegated)
    if (view === 'write' && activeBook) {
        return (
            <NovelWriter 
                activeBook={activeBook}
                updateNovel={updateNovel}
                characters={characters}
                userProfile={userProfile}
                apiConfig={apiConfig}
                onBack={() => setView('shelf')}
                updateCharacter={updateCharacter}
                collaborators={collaborators}
                targetCharId={targetCharId}
                setTargetCharId={setTargetCharId}
                onOpenSettings={handleEditBookSettings}
            />
        );
    }

    return null;
};

export default NovelApp;
