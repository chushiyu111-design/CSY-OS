



import React, { useState, useRef, useEffect } from 'react';
import { useOS } from '../context/OSContext';
import { ChatTheme, BubbleStyle, Message } from '../types';
import { processImage } from '../utils/file';
import VoiceBubble from '../components/chat/VoiceBubble';
import DefaultTransferCard from '../components/chat/plugins/DefaultTransferCard';

const DEFAULT_STYLE: BubbleStyle = {
    textColor: '#334155',
    backgroundColor: '#ffffff',
    borderRadius: 20,
    opacity: 1,
    backgroundImageOpacity: 0.5,
    decorationX: 90,
    decorationY: -10,
    decorationScale: 1,
    decorationRotate: 0,
    avatarDecorationX: 50,
    avatarDecorationY: 50,
    avatarDecorationScale: 1,
    avatarDecorationRotate: 0
};

const DEFAULT_THEME: ChatTheme = {
    id: '',
    name: 'New Theme',
    type: 'custom',
    user: { ...DEFAULT_STYLE, textColor: '#ffffff', backgroundColor: '#6366f1' },
    ai: { ...DEFAULT_STYLE },
    customCss: ''
};

// --- Aesthetic Palette Inspiration Cards ---
const AESTHETIC_PALETTES: { name: string; user: BubbleStyle; ai: BubbleStyle }[] = [
    {
        name: '晚霞',
        user: { ...DEFAULT_STYLE, textColor: '#ffffff', gradient: { from: '#FF6B6B', to: '#FFC371', direction: 135 }, backgroundColor: '#FF6B6B', borderRadius: 20 },
        ai: { ...DEFAULT_STYLE, textColor: '#5D4037', backgroundColor: '#FFF8F0', borderRadius: 20 },
    },
    {
        name: '深海',
        user: { ...DEFAULT_STYLE, textColor: '#E0F0FF', backgroundColor: '#0D1B2A', borderRadius: 16 },
        ai: { ...DEFAULT_STYLE, textColor: '#94D2BD', backgroundColor: '#1B3A4B', borderRadius: 16 },
    },
    {
        name: '薄荷',
        user: { ...DEFAULT_STYLE, textColor: '#ffffff', backgroundColor: '#34D399', borderRadius: 22 },
        ai: { ...DEFAULT_STYLE, textColor: '#065F46', backgroundColor: '#ECFDF5', borderRadius: 22 },
    },
    {
        name: '蜜桃',
        user: { ...DEFAULT_STYLE, textColor: '#ffffff', gradient: { from: '#FDA4AF', to: '#FDE68A', direction: 135 }, backgroundColor: '#FDA4AF', borderRadius: 24 },
        ai: { ...DEFAULT_STYLE, textColor: '#881337', backgroundColor: '#FFF1F2', borderRadius: 24 },
    },
    {
        name: '星空',
        user: { ...DEFAULT_STYLE, textColor: '#ffffff', gradient: { from: '#6366F1', to: '#8B5CF6', direction: 135 }, backgroundColor: '#6366F1', borderRadius: 18 },
        ai: { ...DEFAULT_STYLE, textColor: '#C4B5FD', backgroundColor: '#1E1B4B', borderRadius: 18 },
    },
    {
        name: '纸笺',
        user: { ...DEFAULT_STYLE, textColor: '#F5F5F4', backgroundColor: '#2C2C2C', borderRadius: 4 },
        ai: { ...DEFAULT_STYLE, textColor: '#333333', backgroundColor: '#FAF9F6', borderRadius: 4 },
    },
    {
        name: '暖阳',
        user: { ...DEFAULT_STYLE, textColor: '#ffffff', backgroundColor: '#F59E0B', borderRadius: 20 },
        ai: { ...DEFAULT_STYLE, textColor: '#78350F', backgroundColor: '#FFFBEB', borderRadius: 20 },
    },
    {
        name: '水墨',
        user: { ...DEFAULT_STYLE, textColor: '#F5F0EB', backgroundColor: '#1A1A2E', borderRadius: 2 },
        ai: { ...DEFAULT_STYLE, textColor: '#1A1A2E', backgroundColor: '#F5F0EB', borderRadius: 2 },
    },
];

// --- CSS Examples ---
const CSS_EXAMPLES = [
    {
        name: '毛玻璃 (Glass)',
        code: `/* Glassmorphism for bubbles */
.sully-bubble-user, .sully-bubble-ai {
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255,255,255,0.4);
  box-shadow: 0 4px 6px rgba(0,0,0,0.05);
}
.sully-bubble-user { background: rgba(99, 102, 241, 0.7) !important; }
.sully-bubble-ai { background: rgba(255, 255, 255, 0.7) !important; }`
    },
    {
        name: '霓虹 (Neon)',
        code: `/* Glowing Neon Borders */
.sully-bubble-user {
  border: 2px solid #a855f7;
  box-shadow: 0 0 10px #a855f7;
  background: #2e1065 !important;
  color: #fff !important;
}
.sully-bubble-ai {
  border: 2px solid #3b82f6;
  box-shadow: 0 0 10px #3b82f6;
  background: #172554 !important;
  color: #fff !important;
}`
    },
    {
        name: '像素 (Pixel)',
        code: `/* Pixel Art Style */
.sully-bubble-user, .sully-bubble-ai {
  border-radius: 0px !important;
  border: 2px solid #000;
  box-shadow: 4px 4px 0px #000;
  font-family: monospace;
}`
    }
];

// --- Helpers for Color & CSS ---

// Parse Hex/RGBA to { hex: "#RRGGBB", alpha: 0-1 }
const parseColorValue = (color: string) => {
    // Default
    let hex = '#ffffff';
    let alpha = 1;

    if (!color) return { hex, alpha };

    if (color.startsWith('#')) {
        hex = color.substring(0, 7);
        return { hex, alpha: 1 };
    }

    if (color.startsWith('rgba')) {
        const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (match) {
            const r = parseInt(match[1]);
            const g = parseInt(match[2]);
            const b = parseInt(match[3]);
            const a = match[4] ? parseFloat(match[4]) : 1;
            const toHex = (n: number) => n.toString(16).padStart(2, '0');
            hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
            alpha = a;
        }
    }
    return { hex, alpha };
};

const toRgbaString = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// Padding CSS Injection Helper
const PADDING_MARKER_START = '/* PADDING_AUTO_START */';
const PADDING_MARKER_END = '/* PADDING_AUTO_END */';

const injectPaddingCss = (css: string, verticalPadding: number) => {
    const horizontalPadding = Math.round(verticalPadding * 1.6); // Aspect ratio for bubble
    const rule = `
${PADDING_MARKER_START}
.sully-bubble-user, .sully-bubble-ai {
  padding: ${verticalPadding}px ${horizontalPadding}px !important;
}
${PADDING_MARKER_END}`;

    const regex = new RegExp(`${PADDING_MARKER_START.replace(/\*/g, '\\*')}[\\s\\S]*?${PADDING_MARKER_END.replace(/\*/g, '\\*')}`);

    if (css && css.match(regex)) {
        return css.replace(regex, rule);
    }
    return (css || '') + rule;
};

const extractPaddingFromCss = (css: string) => {
    const match = css?.match(/padding:\s*(\d+)px/);
    return match ? parseInt(match[1]) : 12; // Default 12px (py-3)
};

// --- Collapsible Section chevron SVG ---
const ChevronIcon: React.FC<{ open: boolean }> = ({ open }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
);

// --- Collapsible Section (must be top-level to avoid remount on parent re-render) ---
const CollapsibleSection: React.FC<{ icon: string; title: string; isOpen: boolean; onToggle: () => void; children: React.ReactNode }> = ({ icon, title, isOpen, onToggle, children }) => (
    <div className="border border-slate-100 rounded-xl overflow-hidden">
        <button
            onClick={onToggle}
            className="w-full flex items-center justify-between px-4 py-3 bg-slate-50/50 hover:bg-slate-100/80 transition-colors"
        >
            <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">{icon} {title}</span>
            <ChevronIcon open={isOpen} />
        </button>
        {isOpen && (
            <div className="px-4 pb-4 pt-3 space-y-5">
                {children}
            </div>
        )}
    </div>
);

// --- Mock data for transfer card preview ---
const MOCK_TRANSFER_USER: Message = {
    id: 0,
    charId: '',
    role: 'user',
    type: 'transfer',
    content: '',
    timestamp: Date.now(),
    metadata: { amount: '52.00', status: 'pending' }
};
const MOCK_TRANSFER_AI: Message = {
    id: 1,
    charId: '',
    role: 'assistant',
    type: 'transfer',
    content: '',
    timestamp: Date.now(),
    metadata: { amount: '13.14', status: 'pending' }
};

const ThemeMaker: React.FC = () => {
    const { closeApp, addCustomTheme, addToast, characters, activeCharacterId, customThemes } = useOS();
    const [editingTheme, setEditingTheme] = useState<ChatTheme>({ ...DEFAULT_THEME, id: `theme-${Date.now()}` });
    const [activeTab, setActiveTab] = useState<'user' | 'ai' | 'css'>('user');
    const [toolSection, setToolSection] = useState<'base' | 'sticker' | 'avatar'>('base');

    // Local state for sliders
    const [paddingVal, setPaddingVal] = useState(12);

    // Collapsible panel state — 'colors' open by default
    const [openPanels, setOpenPanels] = useState<Set<string>>(new Set(['colors']));

    const fileInputRef = useRef<HTMLInputElement>(null);
    const decorationInputRef = useRef<HTMLInputElement>(null);
    const avatarDecoInputRef = useRef<HTMLInputElement>(null);

    const activeStyle = editingTheme[activeTab === 'css' ? 'user' : activeTab];

    // Edit mode: load existing theme from sessionStorage if set by Chat.tsx
    useEffect(() => {
        const editId = window.sessionStorage.getItem('themeMakerEditId');
        if (editId) {
            window.sessionStorage.removeItem('themeMakerEditId');
            const existingTheme = customThemes.find(t => t.id === editId);
            if (existingTheme) {
                setEditingTheme({ ...existingTheme });
                if (existingTheme.customCss) {
                    setPaddingVal(extractPaddingFromCss(existingTheme.customCss));
                }
                addToast('正在编辑: ' + existingTheme.name, 'success');
                return; // Skip default padding init
            }
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Initialize padding state from CSS on load
    useEffect(() => {
        if (editingTheme.customCss) {
            setPaddingVal(extractPaddingFromCss(editingTheme.customCss));
        }
    }, []);

    const togglePanel = (id: string) => {
        setOpenPanels(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const updateStyle = (key: keyof BubbleStyle, value: any) => {
        if (activeTab === 'css') return;
        setEditingTheme(prev => ({
            ...prev,
            [activeTab]: {
                ...prev[activeTab as 'user' | 'ai'],
                [key]: value
            }
        }));
    };

    const updateColorWithAlpha = (newHex: string, newAlpha: number) => {
        const val = newAlpha === 1 ? newHex : toRgbaString(newHex, newAlpha);
        updateStyle('backgroundColor', val);
    };

    const updatePadding = (val: number) => {
        setPaddingVal(val);
        const newCss = injectPaddingCss(editingTheme.customCss || '', val);
        setEditingTheme(prev => ({ ...prev, customCss: newCss }));
    };

    const handleImageUpload = async (file: File, type: 'bg' | 'deco' | 'avatarDeco') => {
        try {
            const result = await processImage(file);
            if (type === 'bg') updateStyle('backgroundImage', result);
            else if (type === 'deco') updateStyle('decoration', result);
            else if (type === 'avatarDeco') updateStyle('avatarDecoration', result);
            addToast('图片上传成功', 'success');
        } catch (e: any) {
            addToast(e.message, 'error');
        }
    };

    const saveTheme = () => {
        if (!editingTheme.name.trim()) return;
        const char = characters.find(c => c.id === activeCharacterId);
        const currentBaseId = char?.bubbleStyle || 'default';
        addCustomTheme({ ...editingTheme, baseThemeId: currentBaseId });
        closeApp();
    };

    const resetTheme = () => {
        setEditingTheme(prev => ({
            ...DEFAULT_THEME,
            id: prev.id, // preserve ID so edit-mode still overwrites the right theme
            name: prev.name, // preserve user-given name
        }));
        setPaddingVal(12);
        addToast('已重置为默认样式', 'success');
    };

    const exportTheme = async () => {
        try {
            const json = JSON.stringify(editingTheme, null, 2);
            await navigator.clipboard.writeText(json);
            addToast('主题 JSON 已复制到剪贴板', 'success');
        } catch {
            addToast('复制失败，请手动复制', 'error');
        }
    };

    const importTheme = async () => {
        try {
            const text = await navigator.clipboard.readText();
            const parsed = JSON.parse(text) as ChatTheme;
            if (!parsed.user || !parsed.ai) throw new Error('invalid');
            setEditingTheme(prev => ({
                ...parsed,
                id: prev.id, // keep current ID
            }));
            if (parsed.customCss) setPaddingVal(extractPaddingFromCss(parsed.customCss));
            addToast(`已导入: ${parsed.name || 'unnamed'}`, 'success');
        } catch {
            addToast('剩贴板内容无法解析为主题', 'error');
        }
    };

    // Active character info for real avatars in preview
    const activeChar = characters.find(c => c.id === activeCharacterId);

    // --- Preview Helpers ---

    /** Wraps preview content in a row with avatar (same layout as Chat.tsx) */
    const renderPreviewRow = (role: 'user' | 'ai', content: React.ReactNode) => {
        const style = role === 'user' ? editingTheme.user : editingTheme.ai;
        const isUser = role === 'user';
        const isActive = activeTab === role || activeTab === 'css';

        return (
            <div
                className={`relative w-full flex items-end transition-all duration-300 cursor-pointer ${isActive ? 'opacity-100 scale-100' : 'opacity-60 scale-95 grayscale-[0.5] hover:opacity-80'
                    } ${isUser ? 'justify-end' : 'justify-start'}`}
                onClick={() => setActiveTab(role)}
                title={`点击编辑${isUser ? '用户' : '角色'}气泡`}
            >
                {/* Avatar */}
                <div className={`absolute bottom-0 ${isUser ? 'right-0' : 'left-0'} w-10 h-10 pb-1 z-10`}>
                    <div className="w-full h-full rounded-full bg-slate-300 overflow-hidden relative z-0 shadow-sm border border-white/50">
                        {isUser ? (
                            <div className="absolute inset-0 flex items-center justify-center text-white/50 font-bold text-[10px]">ME</div>
                        ) : activeChar?.avatar ? (
                            <img src={activeChar.avatar} className="w-full h-full object-cover" alt="" />
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-white/50 font-bold text-[10px]">AI</div>
                        )}
                    </div>
                    {style.avatarDecoration && (
                        <img
                            src={style.avatarDecoration}
                            className="absolute pointer-events-none z-10 max-w-none"
                            style={{
                                left: `${style.avatarDecorationX ?? 50}%`,
                                top: `${style.avatarDecorationY ?? 50}%`,
                                width: `${40 * (style.avatarDecorationScale ?? 1)}px`,
                                height: 'auto',
                                transform: `translate(-50%, -50%) rotate(${style.avatarDecorationRotate ?? 0}deg)`,
                            }}
                        />
                    )}
                </div>

                {/* Content */}
                <div className={`relative group max-w-[75%] ${isUser ? 'mr-14' : 'ml-14'}`}>
                    {content}
                </div>
            </div>
        );
    };

    /** Text bubble preview (with decoration sticker, bg image, gradient support) */
    const renderTextPreview = (role: 'user' | 'ai', text: string) => {
        const style = role === 'user' ? editingTheme.user : editingTheme.ai;
        const isUser = role === 'user';
        const containerStyle: React.CSSProperties = {
            backgroundColor: style.backgroundColor,
            borderRadius: `${style.borderRadius}px`,
            opacity: style.opacity,
            borderBottomLeftRadius: isUser ? `${style.borderRadius}px` : '4px',
            borderBottomRightRadius: isUser ? '4px' : `${style.borderRadius}px`,
            borderTopLeftRadius: `${style.borderRadius}px`,
            borderTopRightRadius: `${style.borderRadius}px`,
            border: style.borderWidth && style.borderWidth > 0 ? `${style.borderWidth}px solid ${style.borderColor || 'transparent'}` : undefined,
            boxShadow: style.boxShadow || undefined,
            background: style.gradient ? `linear-gradient(${style.gradient.direction}deg, ${style.gradient.from}, ${style.gradient.to})` : style.backgroundColor,
        };

        return renderPreviewRow(role, (
            <>
                {style.decoration && (
                    <img
                        src={style.decoration}
                        className="absolute z-20 w-8 h-8 object-contain drop-shadow-sm pointer-events-none"
                        style={{
                            left: `${style.decorationX ?? (isUser ? 90 : 10)}%`,
                            top: `${style.decorationY ?? -10}%`,
                            transform: `translate(-50%, -50%) scale(${style.decorationScale ?? 1}) rotate(${style.decorationRotate ?? 0}deg)`
                        }}
                    />
                )}
                <div
                    className={`relative px-5 py-3 shadow-sm text-sm overflow-hidden ${isUser ? 'sully-bubble-user' : 'sully-bubble-ai'}`}
                    style={containerStyle}
                >
                    {style.backgroundImage && (
                        <div
                            className="absolute inset-0 bg-cover bg-center pointer-events-none z-0"
                            style={{
                                backgroundImage: `url(${style.backgroundImage})`,
                                opacity: style.backgroundImageOpacity ?? 0.5
                            }}
                        ></div>
                    )}
                    <span className="relative z-10 leading-relaxed" style={{ color: style.textColor, fontSize: style.fontSize ? `${style.fontSize}px` : '15px', textShadow: style.textShadow }}>{text}</span>
                </div>
            </>
        ));
    };

    /** Voice bubble preview */
    const renderVoicePreview = (role: 'user' | 'ai', duration: number) => {
        const style = role === 'user' ? editingTheme.user : editingTheme.ai;
        return renderPreviewRow(role, (
            <VoiceBubble
                duration={duration}
                isPlaying={false}
                isLoading={false}
                isUser={role === 'user'}
                onPlay={() => {}}
                onStop={() => {}}
                styleConfig={style}
            />
        ));
    };

    /** Transfer card preview */
    const renderTransferPreview = (role: 'user' | 'ai') => {
        const isUser = role === 'user';
        return renderPreviewRow(role, (
            <DefaultTransferCard
                message={isUser ? MOCK_TRANSFER_USER : MOCK_TRANSFER_AI}
                isUser={isUser}
                charName="角色"
                selectionMode={false}
            />
        ));
    };

    const parsedBgColor = parseColorValue(activeStyle.backgroundColor);


    return (
        <div className="h-full w-full bg-slate-50 flex flex-col font-light relative">
            {/* Header */}
            <div className="bg-white/70 backdrop-blur-md shrink-0 z-20 border-b border-white/40 shadow-sm flex flex-col">
                <div className="h-20 flex items-end pb-3 px-4 justify-between gap-3">
                    <div className="flex items-center gap-2 shrink-0">
                        <button onClick={closeApp} className="p-2 -ml-2 rounded-full hover:bg-black/5 active:scale-90 transition-transform">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-slate-600">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                            </svg>
                        </button>
                        <h1 className="text-xl font-medium text-slate-700">气泡工坊</h1>
                    </div>
                    {/* Theme Name — always visible regardless of active tab */}
                    <input
                        value={editingTheme.name}
                        onChange={(e) => setEditingTheme(prev => ({ ...prev, name: e.target.value }))}
                        className="flex-1 min-w-0 bg-slate-100/80 border border-slate-200/60 rounded-lg px-2.5 py-1 text-sm text-center focus:border-primary/50 transition-all outline-none placeholder:text-slate-300"
                        placeholder="主题名称"
                    />
                    <button onClick={saveTheme} className="shrink-0 px-4 py-1.5 bg-primary text-white rounded-full text-xs font-bold shadow-lg shadow-primary/30 active:scale-95 transition-all">
                        保存
                    </button>
                </div>
                {/* Utility row: Reset + Import/Export */}
                <div className="px-4 pb-3 flex gap-2 items-center">
                    <button onClick={resetTheme} className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200 active:scale-95 transition-all">↺ 重置</button>
                    <button onClick={exportTheme} className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200 active:scale-95 transition-all">↑ 导出</button>
                    <button onClick={importTheme} className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200 active:scale-95 transition-all">↓ 导入</button>
                </div>
            </div>

            {/* Preview Area — Mini Chat Simulator */}
            <div className="flex-1 bg-slate-100 relative overflow-y-auto flex flex-col pt-4 pb-4 px-6 items-center gap-3">
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>

                {/* Live CSS Injection for Preview */}
                {editingTheme.customCss && <style>{editingTheme.customCss}</style>}

                {/* Rich Preview Conversation */}
                <div className="w-full max-w-sm space-y-3 my-auto">
                    {renderTextPreview('ai', '我觉得非常棒，完全符合人设！')}
                    {renderTextPreview('user', '这个样式看起来怎么样？')}
                    {renderVoicePreview('ai', 5)}
                    {renderVoicePreview('user', 3)}
                    {renderTransferPreview('ai')}
                    {renderTransferPreview('user')}
                </div>
            </div>

            {/* Editor Controls */}
            <div className="bg-white rounded-t-[2.5rem] shadow-[0_-5px_30px_rgba(0,0,0,0.08)] z-30 flex flex-col h-[48%] ring-1 ring-slate-100">
                {/* Main Tabs (User / AI / CSS) & Mirror Copy */}
                <div className="flex items-center justify-between px-8 pt-6 pb-2 border-b border-slate-50">
                    <div className="flex gap-6 overflow-x-auto no-scrollbar">
                        <button onClick={() => setActiveTab('user')} className={`text-sm font-bold transition-colors whitespace-nowrap ${activeTab === 'user' ? 'text-slate-800' : 'text-slate-300'}`}>用户气泡</button>
                        <button onClick={() => setActiveTab('ai')} className={`text-sm font-bold transition-colors whitespace-nowrap ${activeTab === 'ai' ? 'text-slate-800' : 'text-slate-300'}`}>角色气泡</button>
                        <button onClick={() => setActiveTab('css')} className={`text-sm font-bold transition-colors whitespace-nowrap flex items-center gap-1 ${activeTab === 'css' ? 'text-indigo-600' : 'text-slate-300'}`}>
                            <span>⚡</span> CSS
                        </button>
                    </div>
                    {/* Mirror Copy Button */}
                    {activeTab !== 'css' && (
                        <button
                            onClick={() => {
                                const sourceTab = activeTab;
                                const targetTab = sourceTab === 'user' ? 'ai' : 'user';
                                const sourceStyle = editingTheme[sourceTab];
                                setEditingTheme(prev => ({
                                    ...prev,
                                    [targetTab]: {
                                        ...prev[targetTab],
                                        backgroundColor: sourceStyle.backgroundColor,
                                        gradient: sourceStyle.gradient ? { ...sourceStyle.gradient } : undefined,
                                        textColor: sourceStyle.textColor,
                                        borderRadius: sourceStyle.borderRadius,
                                        opacity: sourceStyle.opacity,
                                        borderWidth: sourceStyle.borderWidth,
                                        borderColor: sourceStyle.borderColor,
                                        boxShadow: sourceStyle.boxShadow,
                                        fontSize: sourceStyle.fontSize,
                                        textShadow: sourceStyle.textShadow,
                                        backgroundImage: sourceStyle.backgroundImage,
                                        backgroundImageOpacity: sourceStyle.backgroundImageOpacity
                                    }
                                }));
                                addToast(`已将基础样式复制给${targetTab === 'user' ? '用户' : '角色'}`, 'success');
                            }}
                            className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-lg text-[10px] font-bold active:scale-95 transition-all"
                            title={`将当前样式复制到${activeTab === 'user' ? '角色气泡' : '用户气泡'}（不含贴纸）`}
                        >
                            ⇄ 同步给对方
                        </button>
                    )}
                </div>

                {/* Conditional Sub-Tool Tabs */}
                {activeTab !== 'css' && (
                    <div className="flex px-6 border-b border-slate-100 mb-2 overflow-x-auto no-scrollbar">
                        <button onClick={() => setToolSection('base')} className={`px-4 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all shrink-0 ${toolSection === 'base' ? 'border-primary text-primary' : 'border-transparent text-slate-400'}`}>基础样式</button>
                        <button onClick={() => setToolSection('sticker')} className={`px-4 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all shrink-0 ${toolSection === 'sticker' ? 'border-primary text-primary' : 'border-transparent text-slate-400'}`}>气泡贴纸</button>
                        <button onClick={() => setToolSection('avatar')} className={`px-4 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all shrink-0 ${toolSection === 'avatar' ? 'border-primary text-primary' : 'border-transparent text-slate-400'}`}>头像挂件</button>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar pb-20">

                    {/* --- CSS EDITOR --- */}
                    {activeTab === 'css' && (
                        <div className="space-y-6 animate-fade-in h-full flex flex-col">
                            <div className="text-[10px] text-slate-400 bg-slate-50 p-3 rounded-xl border border-slate-100 leading-relaxed">
                                <span className="font-bold block mb-1 text-slate-500">CSS 增强模式</span>
                                可使用CSS类名 <code className="bg-slate-200 px-1 rounded">.sully-bubble-user</code> 和 <code className="bg-slate-200 px-1 rounded">.sully-bubble-ai</code> 来统一定制气泡样式。
                                <br />支持使用 <code className="text-red-400">!important</code> 覆盖可视化编辑器的设置。
                            </div>

                            <textarea
                                value={editingTheme.customCss || ''}
                                onChange={(e) => setEditingTheme(prev => ({ ...prev, customCss: e.target.value }))}
                                placeholder="/* 在这里输入 CSS 代码 */"
                                className="flex-1 w-full bg-slate-800 text-slate-300 font-mono text-xs p-4 rounded-xl resize-none shadow-inner focus:ring-2 focus:ring-indigo-500 outline-none leading-relaxed"
                                spellCheck={false}
                            />

                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">快速模板 (Templates)</label>
                                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                                    {CSS_EXAMPLES.map((ex, i) => (
                                        <button
                                            key={i}
                                            onClick={() => setEditingTheme(prev => ({ ...prev, customCss: ex.code }))}
                                            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-mono text-slate-600 border border-slate-200 whitespace-nowrap transition-colors"
                                        >
                                            {ex.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- BASE STYLE TOOLS (Collapsible Accordion) --- */}
                    {activeTab !== 'css' && toolSection === 'base' && (
                        <div className="space-y-3 animate-fade-in">

                            {/* === Section 1: Colors & Background === */}
                            <CollapsibleSection icon="🎨" title="色彩与背板" isOpen={openPanels.has('colors')} onToggle={() => togglePanel('colors')}>
                                {/* Colors */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">文字颜色</label>
                                        <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100"><input type="color" value={activeStyle.textColor} onChange={(e) => updateStyle('textColor', e.target.value)} className="w-8 h-8 rounded-lg border-none cursor-pointer bg-transparent" /></div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">背景色</label>
                                        {/* Gradient Toggle */}
                                        <div className="flex items-center gap-2 mb-2">
                                            <button
                                                onClick={() => {
                                                    if (activeStyle.gradient) {
                                                        updateStyle('gradient', undefined);
                                                    } else {
                                                        updateStyle('gradient', { from: parsedBgColor.hex, to: '#ffffff', direction: 135 });
                                                    }
                                                }}
                                                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${activeStyle.gradient ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}
                                            >
                                                {activeStyle.gradient ? '渐变开' : '渐变关'}
                                            </button>
                                        </div>

                                        {!activeStyle.gradient ? (
                                            <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100">
                                                <input
                                                    type="color"
                                                    value={parsedBgColor.hex}
                                                    onChange={(e) => updateColorWithAlpha(e.target.value, parsedBgColor.alpha)}
                                                    className="w-8 h-8 rounded-lg border-none cursor-pointer bg-transparent"
                                                />
                                            </div>
                                        ) : (
                                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-3">
                                                <div className="flex gap-2">
                                                    <input type="color" value={activeStyle.gradient?.from || '#000000'} onChange={(e) => updateStyle('gradient', { from: e.target.value, to: activeStyle.gradient?.to || '#ffffff', direction: activeStyle.gradient?.direction ?? 135 })} className="w-8 h-8 rounded-lg border-none cursor-pointer bg-transparent" title="起点颜色" />
                                                    <span className="text-slate-300 self-center">→</span>
                                                    <input type="color" value={activeStyle.gradient?.to || '#ffffff'} onChange={(e) => updateStyle('gradient', { from: activeStyle.gradient?.from || '#000000', to: e.target.value, direction: activeStyle.gradient?.direction ?? 135 })} className="w-8 h-8 rounded-lg border-none cursor-pointer bg-transparent" title="终点颜色" />
                                                </div>
                                                <div>
                                                    <div className="flex justify-between mb-1"><span className="text-[10px] text-slate-400">方向 (°)</span><span className="text-[10px] text-slate-500 font-mono">{activeStyle.gradient?.direction ?? 135}°</span></div>
                                                    <input type="range" min="0" max="360" step="5" value={activeStyle.gradient?.direction ?? 135} onChange={(e) => updateStyle('gradient', { from: activeStyle.gradient?.from || '#000000', to: activeStyle.gradient?.to || '#ffffff', direction: parseInt(e.target.value) })} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-indigo-500" />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Background Alpha (Transparency) */}
                                <div>
                                    <div className="flex justify-between mb-2">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase">背景透明度</label>
                                        <span className="text-[10px] text-slate-500 font-mono">{Math.round(parsedBgColor.alpha * 100)}%</span>
                                    </div>
                                    <input
                                        type="range" min="0" max="1" step="0.05"
                                        value={parsedBgColor.alpha}
                                        onChange={(e) => updateColorWithAlpha(parsedBgColor.hex, parseFloat(e.target.value))}
                                        className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-primary"
                                    />
                                </div>

                                {/* Background Image */}
                                <div onClick={() => fileInputRef.current?.click()} className="cursor-pointer group relative h-20 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 overflow-hidden hover:border-primary/50 hover:text-primary transition-all">
                                    {activeStyle.backgroundImage ? (
                                        <>
                                            <img src={activeStyle.backgroundImage} className="absolute inset-0 w-full h-full object-cover opacity-50" />
                                            <span className="relative z-10 text-[10px] bg-white/80 px-2 py-1 rounded shadow-sm font-bold">更换底纹</span>
                                        </>
                                    ) : <span className="text-xs font-bold">+ 上传底纹图片</span>}
                                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0], 'bg')} />
                                    {activeStyle.backgroundImage && <button onClick={(e) => { e.stopPropagation(); updateStyle('backgroundImage', undefined); }} className="absolute top-2 right-2 text-[10px] bg-red-100 text-red-500 px-2 py-0.5 rounded-full z-20">移除</button>}
                                </div>

                                {/* Background Image Opacity */}
                                {activeStyle.backgroundImage && (
                                    <div>
                                        <div className="flex justify-between mb-2"><label className="text-[10px] font-bold text-slate-400 uppercase">底纹透明度</label><span className="text-[10px] text-slate-500 font-mono">{Math.round((activeStyle.backgroundImageOpacity ?? 0.5) * 100)}%</span></div>
                                        <input type="range" min="0" max="1" step="0.05" value={activeStyle.backgroundImageOpacity ?? 0.5} onChange={(e) => updateStyle('backgroundImageOpacity', parseFloat(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-primary" />
                                    </div>
                                )}
                            </CollapsibleSection>

                            {/* === Section 2: Border & Shadow === */}
                            <CollapsibleSection icon="✨" title="边框与光影" isOpen={openPanels.has('border')} onToggle={() => togglePanel('border')}>
                                {/* Border Radius */}
                                <div>
                                    <div className="flex justify-between mb-2"><label className="text-[10px] font-bold text-slate-400 uppercase">圆角大小</label><span className="text-[10px] text-slate-500 font-mono">{activeStyle.borderRadius}px</span></div>
                                    <input type="range" min="0" max="30" value={activeStyle.borderRadius} onChange={(e) => updateStyle('borderRadius', parseInt(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-primary" />
                                </div>

                                {/* Border Width & Color */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase">边框</label>
                                        <span className="text-[10px] text-slate-500 font-mono">{activeStyle.borderWidth || 0}px</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <input type="range" min="0" max="10" step="1" value={activeStyle.borderWidth || 0} onChange={(e) => updateStyle('borderWidth', parseInt(e.target.value))} className="flex-1 h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-primary" />
                                        {(activeStyle.borderWidth || 0) > 0 && (
                                            <div className="shrink-0 bg-slate-50 p-1 rounded-lg border border-slate-100">
                                                <input type="color" value={activeStyle.borderColor || '#000000'} onChange={(e) => updateStyle('borderColor', e.target.value)} className="w-6 h-6 rounded border-none cursor-pointer bg-transparent" />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Box Shadow */}
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-2">投影阴影</label>
                                    <div className="flex gap-2 mb-2 overflow-x-auto no-scrollbar pb-1">
                                        <button onClick={() => updateStyle('boxShadow', undefined)} className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] border whitespace-nowrap ${!activeStyle.boxShadow ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>无</button>
                                        <button onClick={() => updateStyle('boxShadow', '0 2px 6px rgba(0,0,0,0.05)')} className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] border whitespace-nowrap ${activeStyle.boxShadow === '0 2px 6px rgba(0,0,0,0.05)' ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>柔和</button>
                                        <button onClick={() => updateStyle('boxShadow', '0 4px 12px rgba(0,0,0,0.1)')} className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] border whitespace-nowrap ${activeStyle.boxShadow === '0 4px 12px rgba(0,0,0,0.1)' ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>明显</button>
                                        <button onClick={() => updateStyle('boxShadow', '4px 4px 0px rgba(0,0,0,1)')} className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] border whitespace-nowrap ${activeStyle.boxShadow === '4px 4px 0px rgba(0,0,0,1)' ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>像素</button>
                                        <button onClick={() => updateStyle('boxShadow', '0 0 10px rgba(99,102,241,0.5)')} className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] border whitespace-nowrap ${activeStyle.boxShadow === '0 0 10px rgba(99,102,241,0.5)' ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>霓虹</button>
                                    </div>
                                    <input
                                        type="text"
                                        value={activeStyle.boxShadow || ''}
                                        onChange={(e) => updateStyle('boxShadow', e.target.value || undefined)}
                                        placeholder="自定义 CSS box-shadow"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-[10px] font-mono focus:border-primary/50 outline-none"
                                    />
                                </div>
                            </CollapsibleSection>

                            {/* === Section 3: Size & Typography === */}
                            <CollapsibleSection icon="📏" title="尺寸与排版" isOpen={openPanels.has('typo')} onToggle={() => togglePanel('typo')}>
                                {/* Padding (Compactness) */}
                                <div>
                                    <div className="flex justify-between mb-2">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase">气泡紧凑度</label>
                                        <span className="text-[10px] text-slate-500 font-mono">{paddingVal <= 6 ? '紧凑' : (paddingVal >= 16 ? '宽松' : '适中')}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-slate-400">紧凑</span>
                                        <input
                                            type="range" min="4" max="24" step="1"
                                            value={paddingVal}
                                            onChange={(e) => updatePadding(parseInt(e.target.value))}
                                            className="flex-1 h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-primary"
                                        />
                                        <span className="text-[10px] text-slate-400">宽敞</span>
                                    </div>
                                </div>

                                {/* Font Size */}
                                <div>
                                    <div className="flex justify-between mb-2"><label className="text-[10px] font-bold text-slate-400 uppercase">文字大小</label><span className="text-[10px] text-slate-500 font-mono">{activeStyle.fontSize || 15}px</span></div>
                                    <input type="range" min="12" max="22" step="1" value={activeStyle.fontSize || 15} onChange={(e) => updateStyle('fontSize', parseInt(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-primary" />
                                </div>

                                {/* Text Shadow */}
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase">文字阴影</label>
                                        <button
                                            onClick={() => updateStyle('textShadow', activeStyle.textShadow ? undefined : '0 1px 2px rgba(0,0,0,0.3)')}
                                            className={`px-2 py-0.5 rounded text-[8px] font-bold transition-colors ${activeStyle.textShadow ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-400'}`}
                                        >
                                            {activeStyle.textShadow ? '开' : '关'}
                                        </button>
                                    </div>
                                    {activeStyle.textShadow && (
                                        <input
                                            type="text"
                                            value={activeStyle.textShadow}
                                            onChange={(e) => updateStyle('textShadow', e.target.value)}
                                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-[10px] font-mono focus:border-primary/50 outline-none"
                                        />
                                    )}
                                </div>
                            </CollapsibleSection>

                        </div>
                    )}

                    {/* --- STICKER TOOLS --- */}
                    {activeTab !== 'css' && toolSection === 'sticker' && (
                        <div className="space-y-6 animate-fade-in">
                            <div onClick={() => decorationInputRef.current?.click()} className="cursor-pointer group relative h-20 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-400 hover:border-primary/50 hover:text-primary transition-all">
                                {activeStyle.decoration ? <img src={activeStyle.decoration} className="h-10 w-10 object-contain" /> : <span className="text-xs font-bold">+ 上传气泡角标/贴纸</span>}
                                <input type="file" ref={decorationInputRef} className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0], 'deco')} />
                                {activeStyle.decoration && <button onClick={(e) => { e.stopPropagation(); updateStyle('decoration', undefined); }} className="absolute top-2 right-2 text-[10px] bg-red-100 text-red-500 px-2 py-0.5 rounded-full">移除</button>}
                            </div>

                            {activeStyle.decoration && (
                                <div className="grid grid-cols-2 gap-x-6 gap-y-6 p-2">
                                    <div className="col-span-2"><label className="text-[10px] text-slate-400 uppercase block mb-2">位置坐标 (X / Y)</label>
                                        <div className="flex gap-3">
                                            <input type="range" min="-50" max="150" value={activeStyle.decorationX ?? 90} onChange={(e) => updateStyle('decorationX', parseInt(e.target.value))} className="flex-1 h-1.5 bg-slate-200 rounded-full accent-primary" />
                                            <input type="range" min="-50" max="150" value={activeStyle.decorationY ?? -10} onChange={(e) => updateStyle('decorationY', parseInt(e.target.value))} className="flex-1 h-1.5 bg-slate-200 rounded-full accent-primary" />
                                        </div>
                                    </div>
                                    <div><label className="text-[10px] text-slate-400 uppercase block mb-2">缩放 ({activeStyle.decorationScale ?? 1}x)</label>
                                        <input type="range" min="0.2" max="3" step="0.1" value={activeStyle.decorationScale ?? 1} onChange={(e) => updateStyle('decorationScale', parseFloat(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full accent-primary" />
                                    </div>
                                    <div><label className="text-[10px] text-slate-400 uppercase block mb-2">旋转 ({activeStyle.decorationRotate ?? 0}°)</label>
                                        <input type="range" min="-180" max="180" value={activeStyle.decorationRotate ?? 0} onChange={(e) => updateStyle('decorationRotate', parseInt(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full accent-primary" />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* --- AVATAR TOOLS --- */}
                    {activeTab !== 'css' && toolSection === 'avatar' && (
                        <div className="space-y-6 animate-fade-in">
                            <div onClick={() => avatarDecoInputRef.current?.click()} className="cursor-pointer group relative h-20 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-400 hover:border-primary/50 hover:text-primary transition-all">
                                {activeStyle.avatarDecoration ? <img src={activeStyle.avatarDecoration} className="h-10 w-10 object-contain" /> : <span className="text-xs font-bold">+ 上传头像框/挂件</span>}
                                <input type="file" ref={avatarDecoInputRef} className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0], 'avatarDeco')} />
                                {activeStyle.avatarDecoration && <button onClick={(e) => { e.stopPropagation(); updateStyle('avatarDecoration', undefined); }} className="absolute top-2 right-2 text-[10px] bg-red-100 text-red-500 px-2 py-0.5 rounded-full">移除</button>}
                            </div>

                            {activeStyle.avatarDecoration && (
                                <div className="grid grid-cols-2 gap-x-6 gap-y-6 p-2">
                                    <div className="col-span-2"><label className="text-[10px] text-slate-400 uppercase block mb-2">中心偏移 (Offset X / Y)</label>
                                        <div className="flex gap-3">
                                            <input type="range" min="-50" max="150" value={activeStyle.avatarDecorationX ?? 50} onChange={(e) => updateStyle('avatarDecorationX', parseInt(e.target.value))} className="flex-1 h-1.5 bg-slate-200 rounded-full accent-primary" />
                                            <input type="range" min="-50" max="150" value={activeStyle.avatarDecorationY ?? 50} onChange={(e) => updateStyle('avatarDecorationY', parseInt(e.target.value))} className="flex-1 h-1.5 bg-slate-200 rounded-full accent-primary" />
                                        </div>
                                    </div>
                                    <div><label className="text-[10px] text-slate-400 uppercase block mb-2">缩放 ({activeStyle.avatarDecorationScale ?? 1}x)</label>
                                        <input type="range" min="0.5" max="3" step="0.1" value={activeStyle.avatarDecorationScale ?? 1} onChange={(e) => updateStyle('avatarDecorationScale', parseFloat(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full accent-primary" />
                                    </div>
                                    <div><label className="text-[10px] text-slate-400 uppercase block mb-2">旋转 ({activeStyle.avatarDecorationRotate ?? 0}°)</label>
                                        <input type="range" min="-180" max="180" value={activeStyle.avatarDecorationRotate ?? 0} onChange={(e) => updateStyle('avatarDecorationRotate', parseInt(e.target.value))} className="w-full h-1.5 bg-slate-200 rounded-full accent-primary" />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
};

export default ThemeMaker;