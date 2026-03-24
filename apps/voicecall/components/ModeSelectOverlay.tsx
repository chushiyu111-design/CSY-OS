import React, { useState } from 'react';
import { X, Sun, Moon, ChatCircleDots, Heart, Translate } from '@phosphor-icons/react';
import { getVoiceCallModeOptions, type VoiceCallMode } from '../voiceCallTypes';

interface ModeSelectOverlayProps {
    charName: string;
    onSelectMode: (mode: VoiceCallMode) => void;
    onCancel: () => void;
    // ─── 外语模式 (Foreign Language) ───
    foreignLang?: { sourceLang: string; targetLang: string } | null;
    onForeignLangChange?: (config: { sourceLang: string; targetLang: string } | null) => void;
}

/** 模式 → 图标映射 */
const modeIcons: Record<string, React.ReactNode> = {
    daily: <Sun weight="duotone" className="w-5 h-5" />,
    confide: <Heart weight="duotone" className="w-5 h-5" />,
    truth: <ChatCircleDots weight="duotone" className="w-5 h-5" />,
    sleep: <Moon weight="duotone" className="w-5 h-5" />,
};

const ModeSelectOverlay: React.FC<ModeSelectOverlayProps> = ({
    charName,
    onSelectMode,
    onCancel,
    // ─── 外语模式 (Foreign Language) ───
    foreignLang,
    onForeignLangChange,
}) => {
    const options = getVoiceCallModeOptions(charName);

    // ─── 外语模式 (Foreign Language): 本地状态 ───
    const LANG_OPTIONS = ['中文', 'English', '日本語', '한국어', 'Français', 'Español'];
    const isEnabled = !!foreignLang;
    const [localSourceLang, setLocalSourceLang] = useState(foreignLang?.sourceLang || localStorage.getItem('chat_translate_source_lang') || '日本語');
    const [localTargetLang, setLocalTargetLang] = useState(foreignLang?.targetLang || localStorage.getItem('chat_translate_lang') || '中文');

    const handleToggle = () => {
        if (isEnabled) {
            onForeignLangChange?.(null);
        } else {
            onForeignLangChange?.({ sourceLang: localSourceLang, targetLang: localTargetLang });
        }
    };
    const handleSourceChange = (lang: string) => {
        setLocalSourceLang(lang);
        if (isEnabled) onForeignLangChange?.({ sourceLang: lang, targetLang: localTargetLang });
    };
    const handleTargetChange = (lang: string) => {
        setLocalTargetLang(lang);
        if (isEnabled) onForeignLangChange?.({ sourceLang: localSourceLang, targetLang: lang });
    };

    return (
        <div className="absolute inset-0 flex flex-col items-center pt-16 pb-24 px-6 vc-animate-fade overflow-y-auto" style={{ scrollbarWidth: 'none' }}>

            {/* 标题区 */}
            <div className="text-center mb-10 vc-animate-slide-up">
                <h1 className="text-2xl font-light text-[var(--vc-text-primary)] mb-2.5 tracking-wide">
                    选择通话模式
                </h1>
                <p className="text-[var(--vc-text-muted)] text-sm font-light tracking-wider">
                    与 {charName} 的通话将以此模式进行
                </p>
            </div>

            {/* 模式列表 */}
            <div className="w-full max-w-sm flex flex-col gap-3.5" style={{ scrollbarWidth: 'none' }}>
                {options.map((opt, i) => (
                    <button
                        key={opt.id}
                        onClick={() => onSelectMode(opt.id)}
                        className="vc-mode-item px-5 py-5 text-left transition-all duration-300 vc-animate-slide-up flex items-center gap-4"
                        style={{ animationDelay: `${0.12 + i * 0.08}s` }}
                    >
                        {/* 模式图标 */}
                        <div className="vc-mode-icon-bubble">
                            {modeIcons[opt.id] || <Sun weight="duotone" className="w-5 h-5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div
                                className="text-[15px] font-medium tracking-wide mb-0.5"
                                style={{ color: '#f0ede9', textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
                            >
                                {opt.title}
                            </div>
                            <div
                                className="text-xs font-light tracking-wider"
                                style={{ color: 'rgba(240,237,233,0.55)', textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}
                            >
                                {opt.subtitle}
                            </div>
                        </div>
                    </button>
                ))}
            </div>

            {/* ─── 外语模式 (Foreign Language) ─── */}
            <div className="w-full max-w-sm mt-4 vc-animate-slide-up" style={{ animationDelay: '0.45s' }}>
                <div
                    className="vc-mode-item px-5 py-4"
                    style={{ opacity: 1, animation: 'none' }}
                >
                    {/* Toggle row */}
                    <div className="flex items-center gap-3 cursor-pointer" onClick={handleToggle}>
                        <div className="vc-mode-icon-bubble" style={{ width: 36, height: 36, borderRadius: 10 }}>
                            <Translate weight="duotone" className="w-4 h-4" />
                        </div>
                        <span className="flex-1 text-[14px] font-medium tracking-wide" style={{ color: '#f0ede9', textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
                            外语模式
                        </span>
                        <div className={`w-10 h-[22px] rounded-full p-0.5 transition-colors flex items-center ${
                            isEnabled ? 'bg-[rgba(210,200,188,0.5)]' : 'bg-white/[0.12]'
                        }`}>
                            <div className={`w-[18px] h-[18px] bg-white rounded-full shadow-sm transition-transform ${
                                isEnabled ? 'translate-x-[18px]' : ''
                            }`} />
                        </div>
                    </div>

                    {/* Language selectors (expanded when enabled) */}
                    {isEnabled && (
                        <div className="mt-3 pt-3 border-t border-white/[0.08] space-y-2.5">
                            {/* AI 说的语言 */}
                            <div>
                                <span className="text-[10px] text-white/40 tracking-wider mb-1.5 block">AI 说</span>
                                <div className="flex flex-wrap gap-1.5">
                                    {LANG_OPTIONS.map(lang => (
                                        <button
                                            key={`src-${lang}`}
                                            onClick={(e) => { e.stopPropagation(); handleSourceChange(lang); }}
                                            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${
                                                localSourceLang === lang
                                                    ? 'bg-white/25 text-white border border-white/30'
                                                    : 'bg-white/[0.06] text-white/50 border border-transparent'
                                            }`}
                                        >
                                            {lang}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {/* 翻译显示 */}
                            <div>
                                <span className="text-[10px] text-white/40 tracking-wider mb-1.5 block">字幕翻译</span>
                                <div className="flex flex-wrap gap-1.5">
                                    {LANG_OPTIONS.map(lang => (
                                        <button
                                            key={`tgt-${lang}`}
                                            onClick={(e) => { e.stopPropagation(); handleTargetChange(lang); }}
                                            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${
                                                localTargetLang === lang
                                                    ? 'bg-[rgba(210,200,188,0.35)] text-white border border-white/30'
                                                    : 'bg-white/[0.06] text-white/50 border border-transparent'
                                            }`}
                                        >
                                            {lang}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="text-[11px] text-center text-white/35 pt-1">
                                AI 用 <span className="text-white/60 font-medium">{localSourceLang}</span> 说话，字幕显示 <span className="text-white/60 font-medium">{localTargetLang}</span> 翻译
                            </div>
                        </div>
                    )}
                </div>
            </div>
            {/* ─── /外语模式 ─── */}

            {/* 取消按钮 — 固定在底部 */}
            <div className="fixed bottom-8 left-0 right-0 flex justify-center vc-animate-slide-up z-10" style={{ animationDelay: '0.5s' }}>
                <button
                    onClick={onCancel}
                    className="w-14 h-14 rounded-full flex items-center justify-center vc-glass-button bg-white/[0.05] text-[var(--vc-text-muted)] hover:text-[var(--vc-text-secondary)] hover:bg-white/[0.08]"
                >
                    <X weight="bold" className="w-6 h-6" />
                </button>
            </div>
        </div>
    );
};

export default ModeSelectOverlay;
