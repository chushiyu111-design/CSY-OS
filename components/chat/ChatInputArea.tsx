
import React, { useRef, useState, useMemo } from 'react';
import { ShareNetwork, Trash, Plus, Smiley, PaperPlaneTilt, Money, BookOpenText, GearSix, Image, Lock, ArrowsClockwise } from '@phosphor-icons/react';
import { CharacterProfile, ChatTheme, EmojiCategory, Emoji } from '../../types';
import { PRESET_THEMES } from './ChatConstants';
import { THEME_PLUGINS } from './ThemeRegistry';
import VoiceRecordButton from './VoiceRecordButton';

// WeChat-specific icons and input bar are now in ./plugins/WeChatInputBar.tsx
// Loaded via ThemeRegistry at runtime.

interface ChatInputAreaProps {
    input: string;
    setInput: (v: string) => void;
    isTyping: boolean;
    selectionMode: boolean;
    showPanel: 'none' | 'actions' | 'emojis' | 'chars';
    setShowPanel: (v: 'none' | 'actions' | 'emojis' | 'chars') => void;
    onSend: () => void;
    onDeleteSelected: () => void;
    onForwardSelected?: () => void;
    selectedCount: number;
    emojis: Emoji[];
    allVisibleEmojis?: Emoji[];
    characters: CharacterProfile[];
    activeCharacterId: string;
    onCharSelect: (id: string) => void;
    customThemes: ChatTheme[];
    onUpdateTheme: (id: string) => void;
    onRemoveTheme: (id: string) => void;
    activeThemeId: string;
    onPanelAction: (type: string, payload?: any) => void;
    onImageSelect: (file: File) => void;
    isSummarizing: boolean;
    // Categories Support
    categories?: EmojiCategory[];
    activeCategory?: string;
    // Reroll Support
    onReroll: () => void;
    canReroll: boolean;
    // Voice Recording Support
    onVoiceMessage?: (blob: Blob, duration: number) => void;
    voiceRecorderState?: 'idle' | 'recording' | 'processing';
    voiceRecordingDuration?: number;
    onStartRecording?: () => Promise<boolean>;
    onStopRecording?: () => Promise<{ blob: Blob; duration: number } | null>;
    onCancelRecording?: () => void;
    voiceRecorderError?: string | null;
    isVoiceProcessing?: boolean;
    /** AnalyserNode for real-time waveform visualization */
    analyserNode?: AnalyserNode | null;
    /** Whether Silero VAD detects active speech (from useVoiceRecorder) */
    isSpeaking?: boolean;
}

const ChatInputArea: React.FC<ChatInputAreaProps> = ({
    input, setInput, isTyping, selectionMode,
    showPanel, setShowPanel, onSend, onDeleteSelected, onForwardSelected, selectedCount,
    emojis, allVisibleEmojis = [], characters, activeCharacterId, onCharSelect,
    customThemes, onUpdateTheme, onRemoveTheme, activeThemeId,
    onPanelAction, onImageSelect, isSummarizing,
    categories = [], activeCategory = 'default',
    onReroll, canReroll,
    onVoiceMessage, voiceRecorderState = 'idle', voiceRecordingDuration = 0,
    onStartRecording, onStopRecording, onCancelRecording,
    voiceRecorderError, isVoiceProcessing = false,
    analyserNode,
    isSpeaking = false,
}) => {
    const chatImageInputRef = useRef<HTMLInputElement>(null);
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const startPos = useRef({ x: 0, y: 0 });
    const isLongPressTriggered = useRef(false); // Track if long press action fired
    // WeChat auto-expand ref & useEffect moved to plugins/WeChatInputBar.tsx

    // Resolve plugin theme ID: custom themes should use default (non-plugin) UI
    // so their styles aren't overridden by WeChat-specific components
    const pluginThemeId = (() => {
        const customTheme = customThemes.find(t => t.id === activeThemeId);
        // Custom (DIY) themes skip plugins entirely — return their unique ID (no match in THEME_PLUGINS)
        if (customTheme) return customTheme.id;
        return activeThemeId;
    })();

    // Context menu state for custom theme long-press
    const [themeContextMenuId, setThemeContextMenuId] = useState<string | null>(null);
    const themeLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const themeTouchMoved = useRef(false);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSend();
        }
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'chat' | 'bg') => {
        const file = e.target.files?.[0];
        if (file) {
            onImageSelect(file);
        }
        if (e.target) e.target.value = ''; // Reset
    };

    // --- Auto-Suggest Emoji Matching ---
    const categoryMap = useMemo(() => {
        const m = new Map<string, string>();
        for (const cat of categories) m.set(cat.id, cat.name);
        return m;
    }, [categories]);

    const suggestEmojis = useMemo(() => {
        const q = input.trim();
        if (q.length < 2 || allVisibleEmojis.length === 0) return [];
        const results: Emoji[] = [];
        for (const e of allVisibleEmojis) {
            if (e.name.includes(q) || q.includes(e.name)) {
                results.push(e);
                if (results.length >= 8) break;
            }
        }
        return results;
    }, [input, allVisibleEmojis]);

    const handleSuggestClick = (emoji: Emoji) => {
        onPanelAction('send-emoji', emoji);
        setInput('');
    };

    // --- Unified Touch/Long-Press Logic ---

    const clearTimer = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const handleTouchStart = (item: any, type: 'emoji' | 'category', e: React.TouchEvent | React.MouseEvent) => {
        // 1. Always reset state first to ensure clean slate for any interaction
        // This fixes the bug where deleting a category leaves the flag true, blocking clicks on system categories
        clearTimer();
        isLongPressTriggered.current = false;

        // 2. Skip long-press for the default category (no options needed)
        if (type === 'category' && item.id === 'default') return;

        // 3. Store coordinates and start timer for valid long-press candidates
        if ('touches' in e) {
            startPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        } else {
            startPos.current = { x: e.clientX, y: e.clientY };
        }

        longPressTimer.current = setTimeout(() => {
            isLongPressTriggered.current = true;
            // Trigger action
            if (type === 'emoji') {
                onPanelAction('delete-emoji-req', item);
            } else {
                onPanelAction('category-options', item);
            }
        }, 500); // 500ms threshold
    };

    const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
        if (!longPressTimer.current) return;

        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        const diffX = Math.abs(clientX - startPos.current.x);
        const diffY = Math.abs(clientY - startPos.current.y);

        // Cancel long press if moved more than 10px (scrolling)
        if (diffX > 10 || diffY > 10) {
            clearTimer();
        }
    };

    const handleTouchEnd = () => {
        clearTimer();
    };

    // Wrapper for Click to prevent conflicts
    const handleItemClick = (e: React.MouseEvent, item: any, type: 'emoji' | 'category') => {
        // If long press action triggered, block the click event (do not send)
        if (isLongPressTriggered.current) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        // If click happens, ensure timer is cleared (prevents "Send then Pop up" ghost issue)
        clearTimer();

        if (type === 'emoji') {
            onPanelAction('send-emoji', item);
        } else {
            onPanelAction('select-category', item.id);
        }
    };

    return (
        <>
            <div className="sully-chat-input bg-white/90 backdrop-blur-2xl border-t border-slate-200/50 pb-safe shrink-0 z-40 shadow-[0_-5px_15px_rgba(0,0,0,0.02)] relative transition-all duration-300">

                {/* === Auto-Suggest Emoji Floating Panel === */}
                {suggestEmojis.length > 0 && !selectionMode && (
                    <div className="absolute bottom-full left-0 right-0 z-50 px-3 pb-2 pointer-events-none" style={{ animation: 'popIn 0.2s ease-out' }}>
                        <div className="pointer-events-auto bg-white/85 backdrop-blur-xl border border-white/50 rounded-2xl shadow-2xl px-3 py-2.5">
                            <div className="flex gap-2.5 overflow-x-auto no-scrollbar">
                                {suggestEmojis.map((e, i) => (
                                    <button
                                        key={`${e.name}-${i}`}
                                        onClick={() => handleSuggestClick(e)}
                                        className="flex flex-col items-center gap-1 shrink-0 active:scale-90 transition-transform"
                                    >
                                        <div className="w-14 h-14 bg-white rounded-xl p-1.5 shadow-sm border border-slate-100">
                                            <img src={e.url} className="w-full h-full object-contain" alt={e.name} />
                                        </div>
                                        <span className="text-[10px] text-slate-500 max-w-14 truncate">{e.name}</span>
                                        {e.categoryId && categoryMap.get(e.categoryId) && e.categoryId !== 'default' && (
                                            <span className="text-[8px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full max-w-14 truncate">{categoryMap.get(e.categoryId)}</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {selectionMode ? (
                    <div className="p-3 flex gap-2 bg-white/50 backdrop-blur-md">
                        {onForwardSelected && (
                            <button
                                onClick={onForwardSelected}
                                disabled={selectedCount === 0}
                                className={`flex-1 py-3 font-bold rounded-xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 ${selectedCount === 0 ? 'bg-slate-200 text-slate-400 shadow-none' : 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-blue-200'}`}
                            >
                                <ShareNetwork className="w-5 h-5" weight="bold" />
                                转发 ({selectedCount})
                            </button>
                        )}
                        <button
                            onClick={onDeleteSelected}
                            className={`${onForwardSelected ? 'flex-1' : 'w-full'} py-3 bg-red-500 text-white font-bold rounded-xl shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2`}
                        >
                            <Trash className="w-5 h-5" weight="bold" />
                            删除 ({selectedCount})
                        </button>
                    </div>
                ) : THEME_PLUGINS[pluginThemeId]?.InputBar ? (
                    /* ===== Theme Plugin Input Bar (e.g. WeChat) ===== */
                    React.createElement(THEME_PLUGINS[pluginThemeId].InputBar!, {
                        input, setInput, showPanel, setShowPanel, onSend,
                        onVoiceMessage, voiceRecorderState, voiceRecordingDuration,
                        onStartRecording, onStopRecording, onCancelRecording,
                        voiceRecorderError, isVoiceProcessing, analyserNode,
                    })
                ) : (
                    /* ===== Default Pill Layout (all other themes) ===== */
                    <div className="p-3 px-4 flex gap-3 items-end">
                        <button onClick={() => setShowPanel(showPanel === 'actions' ? 'none' : 'actions')} className="w-11 h-11 shrink-0 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors">
                            <Plus className="w-6 h-6" weight="bold" />
                        </button>
                        <div className="flex-1 min-w-0 bg-slate-100 rounded-[24px] flex items-center px-1 border border-transparent focus-within:bg-white focus-within:border-primary/30 transition-all overflow-hidden">
                            <textarea
                                rows={1}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                className="flex-1 min-w-0 bg-transparent px-4 py-3 text-[15px] resize-none max-h-24 no-scrollbar"
                                placeholder="Message..."
                                style={{ height: 'auto' }}
                            />
                            <button onClick={() => setShowPanel(showPanel === 'emojis' ? 'none' : 'emojis')} className="p-2 shrink-0 text-slate-400 hover:text-primary">
                                <Smiley className="w-6 h-6" weight="regular" />
                            </button>
                        </div>
                        {input.trim() ? (
                            <button
                                onClick={onSend}
                                className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center transition-all bg-primary text-white shadow-lg"
                            >
                                <PaperPlaneTilt className="w-5 h-5" weight="fill" />
                            </button>
                        ) : onVoiceMessage && onStartRecording && onStopRecording && onCancelRecording ? (
                            <VoiceRecordButton
                                onVoiceMessage={onVoiceMessage}
                                isProcessing={isVoiceProcessing}
                                disabled={isTyping}
                                recorderState={voiceRecorderState}
                                recordingDuration={voiceRecordingDuration}
                                onStartRecording={onStartRecording}
                                onStopRecording={onStopRecording}
                                onCancelRecording={onCancelRecording}
                                error={voiceRecorderError}
                                analyserNode={analyserNode}
                                isSpeaking={isSpeaking}
                            />
                        ) : (
                            <button
                                onClick={onSend}
                                disabled={!input.trim()}
                                className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center transition-all bg-slate-200 text-slate-400"
                            >
                                <PaperPlaneTilt className="w-5 h-5" weight="fill" />
                            </button>
                        )}
                    </div>
                )}

                {/* Panels */}
                {showPanel !== 'none' && !selectionMode && (
                    <div className="bg-slate-50 h-72 border-t border-slate-200/60 overflow-hidden relative z-0 flex flex-col">

                        {/* Emojis Panel with Categories */}
                        {showPanel === 'emojis' && (
                            <>
                                {/* Categories Bar */}
                                <div className="h-10 bg-white border-b border-slate-100 flex items-center px-2 gap-2 overflow-x-auto no-scrollbar shrink-0">
                                    {categories.map(cat => (
                                        <button
                                            key={cat.id}
                                            onClick={(e) => handleItemClick(e, cat, 'category')}
                                            // Long press handlers for Categories
                                            onTouchStart={(e) => handleTouchStart(cat, 'category', e)}
                                            onTouchMove={handleTouchMove}
                                            onTouchEnd={handleTouchEnd}
                                            onMouseDown={(e) => handleTouchStart(cat, 'category', e)}
                                            onMouseMove={handleTouchMove}
                                            onMouseUp={handleTouchEnd}
                                            onMouseLeave={handleTouchEnd}
                                            onContextMenu={(e) => e.preventDefault()}
                                            className={`px-3 py-1 text-xs rounded-full whitespace-nowrap transition-all select-none flex items-center gap-1 ${activeCategory === cat.id ? 'bg-primary text-white font-bold shadow-sm' : 'bg-slate-100 text-slate-500'}`}
                                        >
                                            {cat.name}
                                            {cat.allowedCharacterIds && cat.allowedCharacterIds.length > 0 && (
                                                <Lock className="w-3 h-3 opacity-60" weight="bold" />
                                            )}
                                        </button>
                                    ))}
                                    <button onClick={() => onPanelAction('add-category')} className="w-6 h-6 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center shrink-0 hover:bg-slate-200">+</button>
                                </div>

                                <div className="flex-1 overflow-y-auto no-scrollbar p-4">
                                    <div className="grid grid-cols-4 gap-3">
                                        <button onClick={() => onPanelAction('emoji-import')} className="aspect-square bg-slate-100 rounded-2xl border-2 border-dashed border-slate-300 flex items-center justify-center text-2xl text-slate-400">+</button>
                                        {emojis.map((e, i) => (
                                            <button
                                                key={i}
                                                onClick={(ev) => handleItemClick(ev, e, 'emoji')}
                                                // Long press handlers for Emojis
                                                onTouchStart={(ev) => handleTouchStart(e, 'emoji', ev)}
                                                onTouchMove={handleTouchMove}
                                                onTouchEnd={handleTouchEnd}
                                                onMouseDown={(ev) => handleTouchStart(e, 'emoji', ev)}
                                                onMouseMove={handleTouchMove}
                                                onMouseUp={handleTouchEnd}
                                                onMouseLeave={handleTouchEnd}
                                                onContextMenu={(ev) => ev.preventDefault()}
                                                className="bg-white rounded-2xl p-2 shadow-sm relative active:scale-95 transition-transform select-none flex flex-col items-center"
                                            >
                                                <div className="aspect-square w-full">
                                                    <img src={e.url} className="w-full h-full object-contain pointer-events-none" />
                                                </div>
                                                <span className="text-[9px] text-slate-400 truncate w-full text-center mt-0.5 leading-tight">{e.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Actions Panel */}
                        {showPanel === 'actions' && (
                            <>
                                {THEME_PLUGINS[pluginThemeId]?.ActionsPanel ? (
                                    React.createElement(THEME_PLUGINS[pluginThemeId].ActionsPanel!, {
                                        onPanelAction,
                                        isSummarizing,
                                        onReroll,
                                        canReroll,
                                        chatImageInputRef
                                    })
                                ) : (
                                    <div className="p-6 grid grid-cols-4 gap-8 overflow-y-auto">
                                        <button onClick={() => onPanelAction('transfer')} className="flex flex-col items-center gap-2 text-slate-600 active:scale-95 transition-transform">
                                            <div className="w-14 h-14 bg-orange-50 rounded-2xl flex items-center justify-center shadow-sm text-orange-400 border border-orange-100">
                                                <Money className="w-6 h-6" weight="bold" />
                                            </div>
                                            <span className="text-xs font-bold">转账</span>
                                        </button>

                                        <button onClick={() => onPanelAction('poke')} className="flex flex-col items-center gap-2 text-slate-600 active:scale-95 transition-transform">
                                            <div className="w-14 h-14 bg-sky-50 rounded-2xl flex items-center justify-center shadow-sm text-2xl border border-sky-100">👉</div>
                                            <span className="text-xs font-bold">戳一戳</span>
                                        </button>

                                        <button onClick={() => onPanelAction('archive')} className="flex flex-col items-center gap-2 text-slate-600 active:scale-95 transition-transform">
                                            <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center shadow-sm text-indigo-400 border border-indigo-100">
                                                <BookOpenText className="w-6 h-6" weight="bold" />
                                            </div>
                                            <span className="text-xs font-bold">{isSummarizing ? '归档中...' : '记忆归档'}</span>
                                        </button>

                                        <button onClick={() => onPanelAction('settings')} className="flex flex-col items-center gap-2 text-slate-600 active:scale-95 transition-transform">
                                            <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center shadow-sm text-slate-500 border border-slate-100">
                                                <GearSix className="w-6 h-6" weight="bold" /></div>
                                            <span className="text-xs font-bold">设置</span>
                                        </button>

                                        <button onClick={() => chatImageInputRef.current?.click()} className="flex flex-col items-center gap-2 text-slate-600 active:scale-95 transition-transform">
                                            <div className="w-14 h-14 bg-pink-50 rounded-2xl flex items-center justify-center shadow-sm text-pink-400 border border-pink-100">
                                                <Image className="w-6 h-6" weight="bold" />
                                            </div>
                                            <span className="text-xs font-bold">相册</span>
                                        </button>

                                        {/* Regenerate Button */}
                                        <button onClick={onReroll} disabled={!canReroll} className={`flex flex-col items-center gap-2 active:scale-95 transition-transform ${canReroll ? 'text-slate-600' : 'text-slate-300 opacity-50'}`}>
                                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm border ${canReroll ? 'bg-emerald-50 text-emerald-400 border-emerald-100' : 'bg-slate-50 text-slate-300 border-slate-100'}`}>
                                                <ArrowsClockwise className="w-6 h-6" weight="bold" />
                                            </div>
                                            <span className="text-xs font-bold">重新生成</span>
                                        </button>
                                    </div>
                                )}
                                {/* Hidden file input for both default and plugin panels */}
                                <input type="file" ref={chatImageInputRef} className="hidden" accept="image/*" onChange={(e) => handleImageChange(e, 'chat')} />
                            </>
                        )}
                        {showPanel === 'chars' && (
                            <div className="p-5 space-y-6 overflow-y-auto no-scrollbar">
                                <div>
                                    <h3 className="text-xs font-bold text-slate-400 px-1 tracking-wider uppercase mb-3">气泡样式</h3>
                                    <div className="flex gap-3 px-1 overflow-x-auto no-scrollbar pb-2">
                                        {Object.values(PRESET_THEMES).map(t => (
                                            <button key={t.id} onClick={() => onUpdateTheme(t.id)} className={`px-6 py-3 rounded-2xl text-xs font-bold border shrink-0 transition-all ${activeThemeId === t.id ? 'bg-primary text-white border-primary' : 'bg-white border-slate-200 text-slate-600'}`}>{t.name}</button>
                                        ))}
                                        {customThemes.map(t => (
                                            <button
                                                key={t.id}
                                                onClick={() => onUpdateTheme(t.id)}
                                                onContextMenu={(e) => { e.preventDefault(); setThemeContextMenuId(t.id); }}
                                                onTouchStart={() => {
                                                    themeTouchMoved.current = false;
                                                    themeLongPressTimer.current = setTimeout(() => { if (!themeTouchMoved.current) setThemeContextMenuId(t.id); }, 500);
                                                }}
                                                onTouchMove={() => { themeTouchMoved.current = true; if (themeLongPressTimer.current) clearTimeout(themeLongPressTimer.current); }}
                                                onTouchEnd={() => { if (themeLongPressTimer.current) clearTimeout(themeLongPressTimer.current); }}
                                                className={`px-6 py-3 rounded-2xl text-xs font-bold border shrink-0 transition-all ${activeThemeId === t.id ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-indigo-50 border-indigo-100 text-indigo-600'}`}
                                            >
                                                {t.name} (DIY)
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-xs font-bold text-slate-400 px-1 tracking-wider uppercase mb-3">切换会话</h3>
                                    <div className="space-y-3">
                                        {characters.map(c => (
                                            <div key={c.id} onClick={() => onCharSelect(c.id)} className={`flex items-center gap-4 p-3 rounded-[20px] border cursor-pointer ${c.id === activeCharacterId ? 'bg-white border-primary/30 shadow-md' : 'bg-white/50 border-transparent'}`}>
                                                <img src={c.avatar} className="w-12 h-12 rounded-2xl object-cover" />
                                                <div className="flex-1"><div className="font-bold text-sm text-slate-700">{c.name}</div><div className="text-xs text-slate-400 truncate">{c.description}</div></div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Custom Theme Context Menu (Long-Press Action Sheet) */}
            {
                themeContextMenuId && (() => {
                    const targetTheme = customThemes.find(t => t.id === themeContextMenuId);
                    return (
                        <div
                            className="fixed inset-0 z-[200] flex items-end justify-center animate-fade-in"
                            style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.25)' }}
                            onClick={() => setThemeContextMenuId(null)}
                        >
                            <div
                                className="w-full max-w-sm mx-4 mb-8 animate-pop-in"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {/* Card */}
                                <div className="bg-white/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-white/40 overflow-hidden mb-2">
                                    {/* Header */}
                                    <div className="px-5 pt-4 pb-3 text-center border-b border-slate-100">
                                        <div className="text-sm font-bold text-slate-700">{targetTheme?.name || '自定义主题'}</div>
                                        <div className="text-[11px] text-slate-400 mt-0.5">长按操作</div>
                                    </div>
                                    {/* Edit */}
                                    <button
                                        onClick={() => { setThemeContextMenuId(null); onPanelAction('edit-theme', themeContextMenuId); }}
                                        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 active:bg-slate-100 transition-colors border-b border-slate-50"
                                    >
                                        <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>
                                        <span className="text-sm font-semibold text-slate-700">修改样式</span>
                                    </button>
                                    {/* Delete */}
                                    <button
                                        onClick={() => { setThemeContextMenuId(null); onRemoveTheme(themeContextMenuId); }}
                                        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-red-50 active:bg-red-100 transition-colors"
                                    >
                                        <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                                        <span className="text-sm font-semibold text-red-500">删除样式</span>
                                    </button>
                                </div>
                                {/* Cancel */}
                                <button
                                    onClick={() => setThemeContextMenuId(null)}
                                    className="w-full py-3.5 bg-white/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-white/40 text-sm font-bold text-slate-600 hover:bg-slate-50 active:bg-slate-100 transition-colors"
                                >
                                    取消
                                </button>
                            </div>
                        </div>
                    );
                })()
            }
        </>
    );
};

export default React.memo(ChatInputArea);
