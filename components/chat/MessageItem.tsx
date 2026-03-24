



import React, { useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Message, ChatTheme } from '../../types';
import { StatusCardData } from '../../types/statusCard';
import { haptic } from '../../utils/haptics';
import { THEME_PLUGINS } from './ThemeRegistry';
import DefaultTransferCard from './plugins/DefaultTransferCard';
import { stripJunk } from '../../utils/markdownLite';
import { parseBilingual } from '../../utils/chatParser';
import XhsCard from './cards/XhsCard';
import SocialCard from './cards/SocialCard';
import SystemNoticeCard from './cards/SystemNoticeCard';
import PhoneEvidenceCard from './cards/PhoneEvidenceCard';
import RoomPlanCard from './cards/RoomPlanCard';
import RoomNoteCard from './cards/RoomNoteCard';
import FurnitureInteractionCard from './cards/FurnitureInteractionCard';
import VoiceCallSummaryCard from './cards/VoiceCallSummaryCard';
import ForwardCard from './cards/ForwardCard';
import WeChatMomentsCard from './cards/WeChatMomentsCard';
import ChatBubble from './ChatBubble';
import InteractionPill from './InteractionPill';
import VoiceBubble from './VoiceBubble';
const StatusCardRenderer = React.lazy(() => import('./StatusCardRenderer'));

// --- Deduplicated Selection Checkbox ---
const SelectionCheckbox: React.FC<{ isSelected: boolean; onToggle: () => void }> = ({ isSelected, onToggle }) => (
    <div className="absolute left-2 top-1/2 -translate-y-1/2 cursor-pointer z-20" onClick={onToggle}>
        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-primary border-primary' : 'border-slate-300 bg-white/80'}`}>
            {isSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
        </div>
    </div>
);

/** Format timestamp in WeChat style: today → "上午 10:30", this year → "3月4日 上午 10:30", other → with year */
const formatWeChatTime = (ts: number): string => {
    const now = new Date();
    const d = new Date(ts);
    const timeStr = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: true });
    if (d.toDateString() === now.toDateString()) return timeStr;
    if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日 ${timeStr}`;
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${timeStr}`;
};

interface MessageItemProps {
    msg: Message;
    isFirstInGroup: boolean;
    isLastInGroup: boolean;
    activeTheme: ChatTheme;
    charAvatar: string;
    charName: string;
    userAvatar: string;
    onLongPress: (m: Message) => void;
    selectionMode: boolean;
    isSelected: boolean;
    onToggleSelect: (id: number) => void;
    // Translation (AI messages only, bilingual content parsed from %%BILINGUAL%%)
    translationEnabled?: boolean;
    isShowingTarget?: boolean;
    onTranslateToggle?: (msgId: number) => void;
    // Transfer card actions
    onTransferAction?: (msg: Message) => void;
    // Timestamp separator (computed by parent Chat.tsx)
    showTimestamp?: boolean;
    timestampValue?: number;
    // Voice playback
    onPlayVoice?: (msgId: number) => void;
    onStopVoice?: () => void;
    onRetryVoice?: (msgId: number) => void;
    playingMsgId?: number | null;
    loadingMsgIds?: Set<number>;
    // Voice transcript
    isVoiceTextExpanded?: boolean;
    onToggleVoiceText?: (msgId: number) => void;
    // Inner voice (心声) / Creative Card (创意状态栏)
    innerVoice?: string;
    statusCardData?: StatusCardData;
    onRetryInnerVoice?: () => void;
}

const MessageItem = React.memo(({
    msg: m,
    isFirstInGroup,
    isLastInGroup,
    activeTheme,
    charAvatar,
    charName,
    userAvatar,
    onLongPress,
    selectionMode,
    isSelected,
    onToggleSelect,
    translationEnabled,
    isShowingTarget,
    onTranslateToggle,
    onTransferAction,
    showTimestamp,
    timestampValue,
    onPlayVoice,
    onStopVoice,
    onRetryVoice,
    playingMsgId,
    loadingMsgIds,
    isVoiceTextExpanded,
    onToggleVoiceText,
    innerVoice,
    statusCardData,
    onRetryInnerVoice,
}: MessageItemProps) => {
    const isUser = m.role === 'user';
    const isSystem = m.role === 'system';
    const marginBottom = isLastInGroup ? 'mb-4' : 'mb-2';
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const startPos = useRef({ x: 0, y: 0 }); // Track touch start position
    const [showInnerVoice, setShowInnerVoice] = useState(false);
    const innerVoiceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const styleConfig = isUser ? activeTheme.user : activeTheme.ai;

    const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
        // Record initial position
        if ('touches' in e) {
            startPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        } else {
            startPos.current = { x: e.clientX, y: e.clientY };
        }

        longPressTimer.current = setTimeout(() => {
            if (!selectionMode) {
                haptic.heavy();
                onLongPress(m);
            }
        }, 600);
    };

    const handleTouchEnd = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    // New handler to cancel long press if user drags/scrolls
    const handleMove = (e: React.TouchEvent | React.MouseEvent) => {
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

        // If moved more than 10px, assume scrolling and cancel long press
        if (diffX > 10 || diffY > 10) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const handleClick = (e: React.MouseEvent) => {
        if (selectionMode) {
            e.stopPropagation();
            e.preventDefault();
            onToggleSelect(m.id);
        }
    };

    const interactionProps = {
        onMouseDown: handleTouchStart,
        onMouseUp: handleTouchEnd,
        onMouseLeave: handleTouchEnd,
        onMouseMove: handleMove,
        onTouchStart: handleTouchStart,
        onTouchEnd: handleTouchEnd,
        onTouchMove: handleMove,
        onTouchCancel: handleTouchEnd, // Handle system interruptions
        onContextMenu: (e: React.MouseEvent) => {
            e.preventDefault();
            if (!selectionMode) onLongPress(m);
        },
        onClick: handleClick
    };

    const formatTime = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

    // Reusable timestamp separator element (only rendered when showTimestamp is true)
    const timestampSeparator = showTimestamp && timestampValue ? (
        <div className="sully-msg-timestamp flex justify-center w-full py-2">
            <span className="text-[11px] text-gray-400">{formatWeChatTime(timestampValue)}</span>
        </div>
    ) : null;

    const hasAnyVoice = !!(innerVoice || statusCardData);

    const handleAvatarClick = () => {
        if (!hasAnyVoice || selectionMode) return;
        setShowInnerVoice(prev => !prev);
        // Auto dismiss after 8 seconds (increased for better reading experience)
        if (innerVoiceTimer.current) clearTimeout(innerVoiceTimer.current);
        innerVoiceTimer.current = setTimeout(() => setShowInnerVoice(false), 8000);
    };

    const renderAvatar = (src: string, isCharAvatar = false) => (
        <div
            className={`relative w-9 h-9 shrink-0 z-0 ${isCharAvatar && hasAnyVoice ? 'cursor-pointer' : ''}`}
            onClick={isCharAvatar ? handleAvatarClick : undefined}
        >
            <img
                src={src}
                className="w-full h-full rounded-[4px] object-cover bg-slate-200 pointer-events-none select-none"
                alt="avatar"
                loading="lazy"
                decoding="async"
            />
            {styleConfig.avatarDecoration && (
                <img
                    src={styleConfig.avatarDecoration}
                    className="absolute pointer-events-none z-10 max-w-none"
                    style={{
                        left: `${styleConfig.avatarDecorationX ?? 50}%`,
                        top: `${styleConfig.avatarDecorationY ?? 50}%`,
                        width: `${36 * (styleConfig.avatarDecorationScale ?? 1)}px`,
                        height: 'auto',
                        transform: `translate(-50%, -50%) rotate(${styleConfig.avatarDecorationRotate ?? 0}deg)`,
                    }}
                />
            )}
            {/* Indicator when inner voice / creative card is available */}
            {isCharAvatar && hasAnyVoice && !showInnerVoice && (
                <div className="absolute -top-1 -right-1 w-3.5 h-3.5 flex items-center justify-center animate-pulse" style={{ filter: statusCardData ? 'drop-shadow(0 1px 2px rgba(100,60,180,0.4))' : 'drop-shadow(0 1px 2px rgba(180,60,60,0.3))' }}>
                    {statusCardData
                        ? <span style={{ fontSize: '10px' }}>🎴</span>
                        : <svg viewBox="0 0 24 24" fill="#c44d4d" className="w-3 h-3"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>
                    }
                </div>
            )}
            {/* Retry indicator when inner voice failed/missing */}
            {isCharAvatar && !hasAnyVoice && onRetryInnerVoice && !showInnerVoice && (
                <div
                    className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-sm cursor-pointer active:scale-90 transition-transform"
                    style={{ border: '1px solid rgba(212,165,71,0.3)' }}
                    onClick={(e) => { e.stopPropagation(); onRetryInnerVoice(); }}
                    title="重试生成心声"
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="#d4a547" strokeWidth="2.5" className="w-2.5 h-2.5">
                        <path d="M1 4v6h6" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </div>
            )}
        </div>
    );

    // --- SYSTEM MESSAGE RENDERING ---
    if (isSystem) {
        // Clean up text: remove [System:] or [系统:] prefix for display
        const displayText = m.content.replace(/^\[(System|系统|System Log|系统记录)\s*[:：]?\s*/i, '').replace(/\]$/, '').trim();

        // Route to structured card if metadata.source is available
        // Priority: PhoneEvidenceCard > RoomPlanCard (todo) > RoomNoteCard (notebook) > SystemNoticeCard > Legacy pill
        let noticeCard: React.ReactNode = null;
        if (m.metadata?.source === 'phone' && m.metadata?.phoneTitle) {
            // Phone evidence with structured data → render as app-simulation card
            noticeCard = <PhoneEvidenceCard message={m} />;
        } else if (m.metadata?.source === 'room' && m.metadata?.roomEvent === 'todo') {
            // Room daily plan → collage journal style card
            noticeCard = <RoomPlanCard message={m} />;
        } else if (m.metadata?.source === 'room' && m.metadata?.roomEvent === 'notebook') {
            // Room private notebook → intimate note card
            noticeCard = <RoomNoteCard message={m} />;
        } else if (m.metadata?.source === 'room' && m.metadata?.roomEvent === 'item_interaction') {
            // Room furniture touch → Morandi glassmorphism feedback card
            noticeCard = <FurnitureInteractionCard message={m} />;
        } else if (m.metadata?.source === 'voicecall' || m.type === 'call_log') {
            // Voice call log → expandable call summary card
            noticeCard = <VoiceCallSummaryCard message={m} />;
        } else if (m.metadata?.source) {
            // Other tagged sources (room item_interaction, schedule, bank) → styled notice card
            noticeCard = <SystemNoticeCard message={m} displayText={displayText} />;
        }

        return (
            <>
                {timestampSeparator}
                <div className={`flex flex-col items-center w-full ${selectionMode ? 'pl-8' : ''} animate-fade-in relative transition-[padding] duration-300`}>
                    {selectionMode && <SelectionCheckbox isSelected={isSelected} onToggle={() => onToggleSelect(m.id)} />}
                    {!showTimestamp && <div className="text-[10px] text-slate-400 mt-4 mb-0.5 opacity-70">{formatTime(m.timestamp)}</div>}
                    <div className="flex justify-center mb-4 px-10 w-full" {...interactionProps}>
                        {noticeCard || (
                            /* Fallback: Legacy grey pill for untagged system messages */
                            <div className="sully-system-pill flex items-center gap-1.5 bg-slate-200/40 backdrop-blur-md text-slate-500 px-3 py-1 rounded-full shadow-sm border border-white/20 select-none cursor-pointer active:scale-95 transition-transform">
                                {displayText.includes('任务') ? '✨' :
                                    displayText.includes('纪念日') || displayText.includes('Event') ? '📅' :
                                        displayText.includes('转账') ? '💰' : '🔔'}
                                <span className="text-[10px] font-medium tracking-wide">{displayText}</span>
                            </div>
                        )}
                    </div>
                </div>
            </>
        );
    }

    if (m.type === 'interaction') {
        return (
            <>
                {timestampSeparator}
                <div className={`flex flex-col items-center ${marginBottom} w-full animate-fade-in relative transition-[padding] duration-300 ${selectionMode ? 'pl-8' : ''}`}>
                    {selectionMode && <SelectionCheckbox isSelected={isSelected} onToggle={() => onToggleSelect(m.id)} />}
                    {!showTimestamp && <div className="text-[10px] text-slate-400 mb-1 opacity-70">{formatTime(m.timestamp)}</div>}
                    <div {...interactionProps}>
                        <InteractionPill isUser={isUser} charName={charName} />
                    </div>
                </div>
            </>
        );
    }

    const commonLayout = (content: React.ReactNode) => (
        <>
            {timestampSeparator}
            <div className={`flex items-start ${isUser ? 'justify-end' : 'justify-start'} ${marginBottom} px-3 group select-none relative transition-[padding] duration-300 ${selectionMode ? (isUser ? 'pr-14' : 'pl-14') : ''}`}>
                {selectionMode && <SelectionCheckbox isSelected={isSelected} onToggle={() => onToggleSelect(m.id)} />}

                {/* Avatar for AI */}
                {!isUser && renderAvatar(charAvatar, true)}

                <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[70%] min-w-0 mx-2.5`} {...interactionProps}>
                    <div className={`${selectionMode ? 'pointer-events-none' : ''} relative w-full`}>
                        {content}
                    </div>
                    {/* Inner Voice / Creative Card Floating Overlay */}
                    {!isUser && showInnerVoice && hasAnyVoice && ReactDOM.createPortal(
                        <div
                            className="fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-300 animate-fade-in"
                            style={{
                                backgroundColor: 'rgba(0,0,0,0.65)',
                                backdropFilter: 'blur(12px)',
                                WebkitBackdropFilter: 'blur(12px)',
                            }}
                            onClick={() => setShowInnerVoice(false)}
                        >
                            <div
                                className="relative animate-inner-voice-in"
                                style={{ width: '330px', maxWidth: 'calc(100vw - 48px)' }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                {statusCardData ? (
                                    /* ═══ Creative Card Mode ═══ */
                                    <React.Suspense fallback={<div style={{ color: '#fff', textAlign: 'center', padding: '40px' }}>加载中...</div>}>
                                        <StatusCardRenderer data={statusCardData} />
                                    </React.Suspense>
                                ) : innerVoice ? (
                                    /* ═══ Classic Inner Voice — Premium Art Gallery Card ═══ */
                                    <div className="relative" style={{
                                        background: '#F9F8F4',
                                        borderRadius: '3px',
                                        boxShadow: '0 30px 60px -15px rgba(0,0,0,0.5), 0 0 20px rgba(0,0,0,0.1), inset 0 0 0 1px rgba(255,255,255,0.7)',
                                        transform: 'rotate(-1.5deg)',
                                        padding: '18px',
                                        paddingBottom: '24px',
                                    }}>
                                        <div className="absolute inset-0 pointer-events-none rounded-[3px]" style={{
                                            opacity: 0.15,
                                            mixBlendMode: 'color-burn',
                                            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
                                            backgroundSize: '128px 128px',
                                        }} />
                                        <div className="relative w-full aspect-[4/3] bg-[#E8E6DF] z-10" style={{
                                            boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.06)',
                                            border: '1px solid rgba(0,0,0,0.05)',
                                        }}>
                                            <img
                                                src={`/images/inner-voice/${(() => {
                                                    const str = innerVoice || String(m.id ?? 0);
                                                    let hash = 0;
                                                    for (let i = 0; i < str.length; i++) {
                                                        hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
                                                    }
                                                    return (((hash % 11) + 11) % 11) + 1;
                                                })()}.jpg`}
                                                alt=""
                                                style={{
                                                    width: '100%', height: '100%',
                                                    objectFit: 'cover', objectPosition: 'center',
                                                    display: 'block',
                                                    filter: 'contrast(0.95) sepia(15%) opacity(0.95)',
                                                }}
                                                decoding="async"
                                            />
                                            {(() => {
                                                const POSTMARKS = [
                                                    { file: 'postmark.png',  w: 85, h: 85, rotate: -25, bottom: -7, right: -5  },
                                                    { file: 'postmark2.png', w: 78, h: 90, rotate: -15, bottom: -8, right: -3  },
                                                    { file: 'postmark3.png', w: 80, h: 80, rotate: -30, bottom: -6, right: -4  },
                                                    { file: 'postmark4.png', w: 90, h: 75, rotate: -20, bottom: -5, right: -6  },
                                                ];
                                                const idx = Math.abs((m.id ?? 0)) % POSTMARKS.length;
                                                const pm = POSTMARKS[idx];
                                                return (
                                                    <div className="absolute pointer-events-none" style={{
                                                        bottom: `${pm.bottom}px`, right: `${pm.right}px`,
                                                        width: `${pm.w}px`, height: `${pm.h}px`,
                                                        opacity: 0.55, mixBlendMode: 'multiply',
                                                        transform: `rotate(${pm.rotate}deg)`, filter: 'contrast(1.2)',
                                                    }}>
                                                        <img src={`/images/decorations/${pm.file}`} alt="postmark" className="w-full h-full object-contain" />
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                        <div className="w-full mt-7 mb-4 flex items-center justify-center relative z-10">
                                            <div className="text-[10px] tracking-[0.4em] text-[#8C8273] font-serif uppercase">Inner Voice</div>
                                        </div>
                                        <div className="relative z-10 px-2" style={{
                                            color: '#2A2520', fontSize: '16px', lineHeight: '2.0',
                                            fontFamily: "'ShouXie6', 'HuangHunShouXie', 'Kaiti SC', STKaiti, serif",
                                            letterSpacing: '1px', textAlign: 'center', whiteSpace: 'pre-wrap',
                                            minHeight: '60px', display: 'flex', flexDirection: 'column', justifyContent: 'center',
                                        }}>
                                            {innerVoice.trim()}
                                        </div>
                                        <div className="w-full mt-6 pt-4 border-t border-[#8C8273]/20 flex justify-between items-end relative z-10">
                                            <span className="text-[9px] text-[#A69D8F] font-serif tracking-[0.2em] uppercase">
                                                Vol.{String((m.id ?? 0) % 100).padStart(2, '0')}
                                            </span>
                                            <span className="text-[9px] text-[#A69D8F] font-serif tracking-[0.2em] uppercase">
                                                {(() => {
                                                    const d = new Date(m.timestamp);
                                                    const months = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "Jun.", "Jul.", "Aug.", "Sep.", "Oct.", "Nov.", "Dec."];
                                                    return `${months[d.getMonth()]} ${d.getDate()}`;
                                                })()}
                                            </span>
                                        </div>
                                        <div className="absolute top-0 right-0 w-12 h-12 pointer-events-none rounded-tr-[3px]" style={{
                                            background: 'linear-gradient(225deg, rgba(0,0,0,0.02) 0%, transparent 50%)',
                                        }}></div>
                                    </div>
                                ) : null}
                                
                                {/* Tap to close hint */}
                                <div className="absolute -bottom-10 left-0 right-0 flex justify-center z-10 pointer-events-none opacity-60">
                                    <div className="text-[10px] text-white/90 font-serif tracking-widest px-3 py-1 rounded-full border border-white/20 bg-black/20 backdrop-blur-sm">
                                        TAP ANYWHERE TO CLOSE
                                    </div>
                                </div>
                            </div>
                        </div>,
                        document.body
                    )}
                </div>

                {/* Avatar for User */}
                {isUser && renderAvatar(userAvatar)}
            </div>
        </>
    );

    // [New] Social Card Rendering
    // --- Chat Forward Card ---
    if (m.type === 'chat_forward') {
        let forwardData: any = null;
        try { forwardData = JSON.parse(m.content); } catch { }
        if (forwardData) {
            return <ForwardCard forwardData={forwardData} commonLayout={commonLayout} interactionProps={interactionProps} selectionMode={selectionMode} />;
        }
    }

    // --- XHS Card Rendering (小红书笔记卡片) ---
    if (m.type === 'xhs_card' && m.metadata?.xhsNote) {
        return commonLayout(
            <XhsCard note={m.metadata.xhsNote} isUser={isUser} />
        );
    }

    // --- WeChat Moments Card (朋友圈动态卡片) ---
    if (m.type === 'moments' && m.metadata?.moments) {
        return commonLayout(
            <WeChatMomentsCard data={m.metadata.moments} />
        );
    }

    if (m.type === 'social_card' && m.metadata?.post) {
        return commonLayout(
            <SocialCard post={m.metadata.post} />
        );
    }

    if (m.type === 'transfer') {
        const CustomTransferCard = THEME_PLUGINS[activeTheme.id]?.TransferCard as any;

        if (CustomTransferCard) {
            return commonLayout(
                <CustomTransferCard
                    message={m}
                    isUser={isUser}
                    charName={charName}
                    selectionMode={selectionMode}
                    onTransferAction={onTransferAction}
                />
            );
        }

        // Fallback to the neutral default card
        return commonLayout(
            <DefaultTransferCard
                message={m}
                isUser={isUser}
                charName={charName}
                selectionMode={selectionMode}
                onTransferAction={onTransferAction}
            />
        );
    }

    if (m.type === 'emoji') {
        return commonLayout(
            <img src={m.content} className="max-w-[160px] max-h-[160px] hover:scale-105 transition-transform drop-shadow-md active:scale-95" loading="lazy" decoding="async" />
        );
    }

    if (m.type === 'image') {
        return commonLayout(
            <div className="relative group">
                <img src={m.content} className="sully-image-msg max-w-[200px] max-h-[300px] rounded-2xl shadow-sm border border-black/5" alt="Uploaded" loading="lazy" decoding="async" />
            </div>
        );
    }

    // --- Voice Compat: detect <语音>...</语音> in text messages (原版 SillyTavern 导入兼容) ---
    // Original SillyTavern stores voice messages as type:'text' with XML tags in content.
    // We detect this at render time and display them as proper voice bubbles.
    let effectiveVoiceType: 'voice' | null = null;
    let compatVoiceText: string | undefined;
    let compatDuration = 0;

    if (m.type === 'text' && m.content) {
        const xmlVoiceMatch = m.content.match(/^[\s]*<[语語]音>([\s\S]+?)<\/[语語]音>[\s]*$/);
        if (xmlVoiceMatch) {
            compatVoiceText = xmlVoiceMatch[1].trim();
            compatDuration = Math.max(2, Math.ceil(compatVoiceText.length / 4));
            effectiveVoiceType = 'voice';
        }
    }

    // --- Voice Message Rendering (native + compat) ---
    if (m.type === 'voice' || effectiveVoiceType === 'voice') {
        const isCompat = effectiveVoiceType === 'voice';
        const isVoiceLoading = !!loadingMsgIds?.has(m.id);
        const hasAudio = !!m.metadata?.hasAudio;
        const sourceText = isCompat ? (compatVoiceText || '') : (m.metadata?.sourceText || m.content);
        const hasSourceText = !!sourceText && sourceText.trim().length > 0;

        // Parse bilingual content in voice transcript (reuses shared utility)
        const voiceBi = parseBilingual(sourceText, stripJunk);
        const showVoiceTranslate = translationEnabled && voiceBi.hasBilingual && !!voiceBi.langB;
        const voiceDisplayText = (isShowingTarget && voiceBi.langB) ? voiceBi.langB : voiceBi.langA;

        // Resolve plugin theme ID (DIY themes inherit from baseThemeId)
        // BUT: custom (DIY) themes should always use generic VoiceBubble with their own styleConfig,
        // only actual preset themes get the plugin's custom voice bubble.
        const isCustomTheme = activeTheme.type === 'custom';
        const pluginThemeId = activeTheme.baseThemeId || activeTheme.id;
        const PluginVoiceBubble = isCustomTheme ? undefined : THEME_PLUGINS[pluginThemeId]?.VoiceBubble;
        const BubbleComponent = PluginVoiceBubble || VoiceBubble;

        return commonLayout(
            <div className="flex flex-col gap-1">
                <div className={`flex items-center gap-1.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                    <BubbleComponent
                        duration={isCompat ? compatDuration : (m.metadata?.duration ?? 0)}
                        isPlaying={playingMsgId === m.id}
                        isLoading={isVoiceLoading}
                        hasFailed={!hasAudio && !isVoiceLoading}
                        isUser={isUser}
                        onPlay={() => onPlayVoice?.(m.id)}
                        onStop={() => onStopVoice?.()}
                        onRetry={() => onRetryVoice?.(m.id)}
                        styleConfig={PluginVoiceBubble ? undefined : styleConfig}
                    />
                    {hasSourceText && (
                        <button
                            className="shrink-0 text-[10px] active:scale-95 transition-all px-1.5 py-0.5 rounded-full border backdrop-blur-sm select-none"
                            style={{
                                color: styleConfig?.textColor ? `${styleConfig.textColor}99` : '#9ca3af',
                                borderColor: styleConfig?.textColor ? `${styleConfig.textColor}30` : 'rgba(209,213,219,0.6)',
                                backgroundColor: styleConfig?.textColor ? `${styleConfig.textColor}10` : 'rgba(255,255,255,0.5)',
                            }}
                            onClick={(e) => { e.stopPropagation(); onToggleVoiceText?.(m.id); }}
                        >
                            {isVoiceTextExpanded ? '收起' : '转文字'}
                        </button>
                    )}
                </div>
                {isVoiceTextExpanded && hasSourceText && (
                    <div
                        className="text-[12px] leading-relaxed px-3 py-2 rounded-lg animate-fade-in max-w-[200px] break-words"
                        style={{
                            borderRadius: `${styleConfig?.borderRadius ?? 6}px`,
                            color: styleConfig?.textColor ? `${styleConfig.textColor}cc` : '#4b5563',
                            backgroundColor: styleConfig?.textColor ? `${styleConfig.textColor}08` : 'rgba(0,0,0,0.03)',
                        }}
                    >
                        {voiceBi.langA}
                        {voiceBi.hasBilingual && voiceBi.langB && (
                            <>
                                <div
                                    className="my-1.5"
                                    style={{
                                        borderTop: `1px dashed ${styleConfig?.textColor ? `${styleConfig.textColor}20` : 'rgba(0,0,0,0.08)'}`,
                                    }}
                                />
                                <div style={{ opacity: 0.7 }}>{voiceBi.langB}</div>
                            </>
                        )}
                    </div>
                )}
            </div>
        );
    }


    // --- Bilingual content parsing (uses centralized parseBilingual for backward compat) ---
    const { hasBilingual, langA: langAContent, langB: langBContent } = parseBilingual(m.content, stripJunk);
    const displayContent = (isShowingTarget && langBContent) ? langBContent : langAContent;
    const showTranslateButton = translationEnabled && hasBilingual && !!langBContent;

    // Don't render empty bubbles
    if (!displayContent && m.type === 'text') return null;

    return commonLayout(
        <ChatBubble
            isUser={isUser}
            styleConfig={styleConfig}
            displayContent={displayContent}
            replyTo={m.replyTo}
            showTranslateButton={showTranslateButton}
            isShowingTarget={isShowingTarget}
            onTranslateToggle={() => onTranslateToggle?.(m.id)}
        />
    );
}, (prev: MessageItemProps, next: MessageItemProps) => {
    return prev.msg.id === next.msg.id &&
        prev.msg.type === next.msg.type &&
        prev.msg.content === next.msg.content &&
        prev.msg.metadata?.status === next.msg.metadata?.status &&
        prev.msg.metadata?.hasAudio === next.msg.metadata?.hasAudio &&
        prev.msg.metadata?.duration === next.msg.metadata?.duration &&
        prev.msg.metadata?.sourceText === next.msg.metadata?.sourceText &&
        prev.isFirstInGroup === next.isFirstInGroup &&
        prev.isLastInGroup === next.isLastInGroup &&
        prev.activeTheme === next.activeTheme &&
        prev.selectionMode === next.selectionMode &&
        prev.isSelected === next.isSelected &&
        prev.translationEnabled === next.translationEnabled &&
        prev.isShowingTarget === next.isShowingTarget &&
        prev.showTimestamp === next.showTimestamp &&
        prev.playingMsgId === next.playingMsgId &&
        prev.loadingMsgIds?.size === next.loadingMsgIds?.size &&
        !!prev.loadingMsgIds?.has(prev.msg.id) === !!next.loadingMsgIds?.has(next.msg.id) &&
        prev.isVoiceTextExpanded === next.isVoiceTextExpanded &&
        prev.innerVoice === next.innerVoice &&
        prev.statusCardData === next.statusCardData &&
        prev.onRetryInnerVoice === next.onRetryInnerVoice;
});

export default MessageItem;