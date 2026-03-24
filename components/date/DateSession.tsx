import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { CharacterProfile, Message, DateState, DialogueItem, UserProfile } from '../../types';
import Modal from '../../components/os/Modal';
import { useOS } from '../../context/OSContext';
import DateSettings from './DateSettings';

// Helper: Parse dialogue with simple state machine
const isContextNoise = (line: string) => {
    const l = line.trim().toLowerCase();
    if (l.startsWith('(') && l.endsWith(')')) {
        if (l.includes('in person') || l.includes('face-to-face') || l.includes('location') || l.includes('time')) return true;
    }
    if (l.startsWith('[system') || l.startsWith('(system')) return true;
    return false;
};

// Helper: Strip emotion tags like [shy], [happy] for pure text display
const cleanTextForDisplay = (text: string) => {
    // Remove content inside brackets [] and trim extra spaces
    // Also remove typical system prompts if any leak through
    return text.replace(/\[.*?\]/g, '').trim();
};

const parseDialogue = (fullText: string, initialEmotion: string = 'normal'): DialogueItem[] => {
    if (!fullText) return [];
    const lines = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const results: DialogueItem[] = [];
    let currentEmotion = initialEmotion;

    for (const line of lines) {
        if (isContextNoise(line)) continue;
        const tagMatch = line.match(/^\[([a-zA-Z0-9_\-]+)\]\s*(.*)/);
        let content = line;
        
        if (tagMatch) {
            currentEmotion = tagMatch[1].toLowerCase();
            content = tagMatch[2];
        } else {
            const standaloneTag = line.match(/^\[([a-zA-Z0-9_\-]+)\]$/);
            if (standaloneTag) {
                currentEmotion = standaloneTag[1].toLowerCase();
                continue; 
            }
        }
        if (content) {
            results.push({ text: content, emotion: currentEmotion });
        }
    }
    return results;
};

interface DateSessionProps {
    char: CharacterProfile;
    userProfile: UserProfile;
    messages: Message[]; // The DB messages for history/novel mode
    peekStatus: string;  // Initial text from the Peek phase
    initialState?: DateState; // Resume state
    onSendMessage: (text: string) => Promise<string>; // Returns AI content
    onReroll: () => Promise<string>;
    onExit: (currentState: DateState) => void;
    onEditMessage: (msg: Message) => void;
    onDeleteMessage: (msg: Message) => void;
    onSettings: () => void;
}

const DateSession: React.FC<DateSessionProps> = ({ 
    char, 
    userProfile,
    messages, 
    peekStatus, 
    initialState,
    onSendMessage, 
    onReroll, 
    onExit,
    onEditMessage,
    onDeleteMessage,
    onSettings
}) => {
    const { addToast, registerBackHandler } = useOS();
    
    // Core VN State
    const [isNovelMode, setIsNovelMode] = useState(false);
    const [bgImage, setBgImage] = useState<string>(char.dateBackground || '');
    const [currentSprite, setCurrentSprite] = useState<string>('');
    const [spriteConfig, setSpriteConfig] = useState(char.spriteConfig || { scale: 1, x: 0, y: 0 });
    
    // Dialogue Engine State
    const [dialogueQueue, setDialogueQueue] = useState<DialogueItem[]>([]);
    const [dialogueBatch, setDialogueBatch] = useState<DialogueItem[]>([]); // For replaying current batch
    const [currentText, setCurrentText] = useState('');
    const [displayedText, setDisplayedText] = useState('');
    const [isTextAnimating, setIsTextAnimating] = useState(false);
    
    // Interaction State
    const [input, setInput] = useState('');
    const [showInputBox, setShowInputBox] = useState(false);
    const [isTyping, setIsTyping] = useState(false); // Waiting for API
    const [showExitModal, setShowExitModal] = useState(false);
    
    // Settings Overlay State (Internal)
    const [showSettings, setShowSettings] = useState(false);

    // Edit Msg Logic
    const [modalType, setModalType] = useState<'none' | 'options'>('none');
    const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const touchStartRef = useRef<{x: number, y: number} | null>(null);
    const novelScrollRef = useRef<HTMLDivElement>(null);

    // Back Handler
    useEffect(() => {
        const unregister = registerBackHandler(() => {
            if (showSettings) {
                setShowSettings(false);
                return true;
            }
            if (showExitModal) {
                setShowExitModal(false);
                return true;
            }
            setShowExitModal(true);
            return true;
        });
        return unregister;
    }, [showSettings, showExitModal, registerBackHandler]);

    // Filter messages for Novel Mode: Show only current session
    // Logic: Find the LAST message with `isOpening: true`. Show all messages from there onwards.
    const sessionMessages = React.useMemo(() => {
        const openingIndex = messages.map(m => m.metadata?.isOpening).lastIndexOf(true);
        if (openingIndex !== -1) {
            return messages.slice(openingIndex);
        }
        // Fallback: If no opening found (legacy data), show all
        return messages;
    }, [messages]);

    // Initialization
    useEffect(() => {
        if (initialState) {
            // Resume
            setBgImage(initialState.bgImage);
            setCurrentSprite(initialState.currentSprite);
            setCurrentText(initialState.currentText);
            setDisplayedText(initialState.currentText);
            setDialogueQueue(initialState.dialogueQueue);
            setDialogueBatch(initialState.dialogueBatch);
            setIsNovelMode(initialState.isNovelMode);
        } else {
            // New Session - pick initial sprite from active skin set or default sprites
            const s = (() => {
                if (char.activeSkinSetId && char.dateSkinSets) {
                    const skin = char.dateSkinSets.find(sk => sk.id === char.activeSkinSetId);
                    if (skin && Object.keys(skin.sprites).length > 0) return skin.sprites;
                }
                return char.sprites;
            })();
            let initSprite = s?.['normal'] || s?.['default'];
            if (!initSprite && s) {
                const fallbackKey = dateEmotionKeys.find(k => s[k]);
                initSprite = fallbackKey ? s[fallbackKey] : Object.values(s).find(v => v) || char.avatar;
            }
            if (!initSprite) initSprite = char.avatar;
            setCurrentSprite(initSprite);
            
            // Parse Peek Status as opening
            const startText = peekStatus || "Waiting for connection...";
            const items = parseDialogue(startText, 'normal');
            setDialogueBatch(items);
            setDialogueQueue(items);
            
            if (items.length > 0) {
                // Manually trigger first item processing
                const first = items[0];
                setCurrentText(first.text);
                // Note: Not setting sprite here because useEffect below will handle emotion->sprite mapping if needed, 
                // or we rely on default.
                setDialogueQueue(items.slice(1));
            }
        }
    }, []); // Run once on mount

    // Sprite & Config Sync (If user goes to settings and comes back, this helps)
    useEffect(() => {
        if (char.spriteConfig) setSpriteConfig(char.spriteConfig);
        if (char.dateBackground) setBgImage(char.dateBackground);
    }, [char]);

    // Novel Mode Scroll
    useEffect(() => {
        if (isNovelMode && novelScrollRef.current) {
            novelScrollRef.current.scrollTop = novelScrollRef.current.scrollHeight;
        }
    }, [sessionMessages.length, isNovelMode, showInputBox]);

    // Typewriter effect
    useEffect(() => {
        if (!currentText || isNovelMode) {
            if (isNovelMode) setDisplayedText(currentText);
            return;
        }
        setIsTextAnimating(true);
        setDisplayedText('');
        let i = 0;
        const timer = setInterval(() => {
            setDisplayedText(currentText.substring(0, i + 1));
            i++;
            if (i >= currentText.length) {
                clearInterval(timer);
                setIsTextAnimating(false);
            }
        }, 20);
        return () => clearInterval(timer);
    }, [currentText, isNovelMode]);

    // --- Logic ---

    // Only allow date-relevant emotions (required + custom), never chibi or other non-date sprites
    const REQUIRED_EMOTIONS_SET = ['normal', 'happy', 'angry', 'sad', 'shy'];
    const dateEmotionKeys = [...REQUIRED_EMOTIONS_SET, ...(char.customDateSprites || [])];

    // Resolve active sprites: if a skin set is active, use its sprites; otherwise fall back to char.sprites
    const activeSprites = React.useMemo(() => {
        if (char.activeSkinSetId && char.dateSkinSets) {
            const skin = char.dateSkinSets.find(s => s.id === char.activeSkinSetId);
            if (skin) return skin.sprites;
        }
        return char.sprites || {};
    }, [char.activeSkinSetId, char.dateSkinSets, char.sprites]);

    const processNextDialogue = (item: DialogueItem, remaining: DialogueItem[]) => {
        setCurrentText(item.text);
        if (item.emotion && activeSprites) {
            const emotionKey = item.emotion.toLowerCase();
            if (dateEmotionKeys.includes(emotionKey)) {
                const nextSprite = activeSprites[emotionKey];
                if (nextSprite) setCurrentSprite(nextSprite);
            } else {
                const found = dateEmotionKeys.find(k => emotionKey.includes(k));
                if (found && activeSprites[found]) {
                    setCurrentSprite(activeSprites[found]);
                }
            }
        }
        setDialogueQueue(remaining);
    };

    const handleScreenClick = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('button, input, textarea, .control-panel')) return;
        if (isNovelMode) return;

        // Skip animation
        if (isTextAnimating) {
            setDisplayedText(currentText);
            setIsTextAnimating(false);
            return;
        }

        // Next item
        if (dialogueQueue.length > 0) {
            processNextDialogue(dialogueQueue[0], dialogueQueue.slice(1));
            return;
        }

        // Loop
        if (dialogueBatch.length > 0) {
            // Replay
            addToast('↺ 重播对话', 'info');
            processNextDialogue(dialogueBatch[0], dialogueBatch.slice(1));
            return;
        }
    };

    const handleSend = async () => {
        if (!input.trim() || isTyping) return;
        const text = input.trim();
        setInput('');
        setShowInputBox(false);
        setIsTyping(true);

        try {
            const aiContent = await onSendMessage(text);
            // Parse new content
            const items = parseDialogue(aiContent, 'normal');
            setDialogueBatch(items);
            setDialogueQueue(items);
            if (items.length > 0) {
                processNextDialogue(items[0], items.slice(1));
            }
        } catch (e: any) {
            setCurrentText("(连接中断)");
            setShowInputBox(true);
        } finally {
            setIsTyping(false);
        }
    };

    const handleRerollClick = async () => {
        if (isTyping) return;
        setIsTyping(true);
        try {
            const aiContent = await onReroll();
            const items = parseDialogue(aiContent, 'normal');
            setDialogueBatch(items);
            setDialogueQueue(items);
            if (items.length > 0) processNextDialogue(items[0], items.slice(1));
        } catch(e) {
            // Error handled in parent
        } finally {
            setIsTyping(false);
        }
    };

    const handleExitClick = () => {
        const currentState: DateState = {
            dialogueQueue,
            dialogueBatch,
            currentText,
            bgImage,
            currentSprite,
            isNovelMode,
            timestamp: Date.now(),
            peekStatus
        };
        onExit(currentState);
    };

    // Message Touch Logic (Robust version for scrollable lists)
    const handleMsgTouchStart = (e: React.TouchEvent | React.MouseEvent, msg: Message) => {
        if ('touches' in e) {
            touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        } else {
            touchStartRef.current = { x: e.clientX, y: e.clientY };
        }

        longPressTimer.current = setTimeout(() => {
            setSelectedMessage(msg);
            setModalType('options');
        }, 600);
    };

    const handleMsgTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
        if (!longPressTimer.current || !touchStartRef.current) return;
        
        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        const dx = Math.abs(clientX - touchStartRef.current.x);
        const dy = Math.abs(clientY - touchStartRef.current.y);

        // If moved more than 10px, assume scrolling and cancel long press
        if (dx > 10 || dy > 10) {
            if (longPressTimer.current) clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const handleMsgTouchEnd = () => {
        if (longPressTimer.current) clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
    };

    // Determine if we can reroll (last message is assistant)
    const canReroll = messages.length > 0 && messages[messages.length - 1].role === 'assistant';

    return (
        <div className="h-full w-full relative bg-black overflow-hidden font-sans select-none" onClick={handleScreenClick}>
            
            {/* Background Layer */}
            <div 
                className={`absolute inset-0 bg-cover bg-center transition-all duration-1000 ${isNovelMode ? 'blur-xl opacity-30' : 'opacity-80'}`} 
                style={{ backgroundImage: bgImage ? `url(${bgImage})` : 'none' }}
            ></div>

            {/* Menu Layer */}
            <div className="absolute top-0 right-0 p-4 pt-12 z-[100] flex justify-end gap-3 pointer-events-auto">
                {!isTyping && canReroll && (
                    <button onClick={(e) => { e.stopPropagation(); handleRerollClick(); }} className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all shadow-lg active:scale-95 ${isNovelMode ? 'bg-white/10 backdrop-blur-md border-slate-300/30 text-slate-400 hover:bg-white/20' : 'bg-black/30 backdrop-blur-md border-white/20 text-white hover:bg-white/20'}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                    </button>
                )}
                
                {/* Novel Mode Toggle */}
                <button onClick={(e) => { e.stopPropagation(); setIsNovelMode(!isNovelMode); }} className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all shadow-lg active:scale-95 ${isNovelMode ? 'bg-white text-black border-white' : 'bg-black/30 backdrop-blur-md border-white/20 text-white hover:bg-white/20'}`}>
                    {isNovelMode ? (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" /></svg>
                    )}
                </button>

                <button onClick={(e) => { e.stopPropagation(); setShowInputBox(!showInputBox); }} className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all shadow-lg active:scale-95 ${showInputBox ? 'bg-primary border-primary text-white' : 'bg-black/30 backdrop-blur-md border-white/20 text-white hover:bg-white/20'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" /></svg>
                </button>
                <button onClick={(e) => { e.stopPropagation(); setShowSettings(true); }} className="bg-black/30 backdrop-blur-md text-white w-10 h-10 rounded-full flex items-center justify-center border border-white/20 hover:bg-white/20 transition-all shadow-lg active:scale-95">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 2.555c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.212 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-2.555c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                </button>
                <button onClick={() => setShowExitModal(true)} className="bg-red-500/80 backdrop-blur-md text-white px-4 h-10 rounded-full flex items-center justify-center gap-1 border border-white/20 hover:bg-red-600 transition-colors shadow-lg active:scale-95">
                    <span className="text-xs font-bold mr-1">离开</span>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" /></svg>
                </button>
            </div>

            {/* Novel Mode View */}
            {isNovelMode && (
                <div ref={novelScrollRef} className={`absolute inset-0 z-20 overflow-y-auto no-scrollbar pt-24 pb-32 px-8 mask-image-gradient overscroll-contain ${char.dateLightReading ? 'bg-[#faf8f5]' : 'bg-black/90 backdrop-blur-sm'}`} onClick={(e) => { e.stopPropagation(); setShowInputBox(true); }}>
                    <div className="min-h-full flex flex-col justify-end">
                        <div className="max-w-2xl mx-auto animate-fade-in space-y-6">
                            {sessionMessages.length === 0 && peekStatus && (
                                <div className={`italic text-center text-sm mb-8 px-4 ${char.dateLightReading ? 'text-stone-400' : 'text-slate-200/50'}`}>
                                    {cleanTextForDisplay(peekStatus).split('\n').map((line, idx) => line.trim() && <p key={idx} className="whitespace-pre-wrap leading-relaxed tracking-wide my-2">{line}</p>)}
                                </div>
                            )}
                            {sessionMessages.map((msg) => (
                                <div
                                    key={msg.id}
                                    className={`group relative rounded-xl transition-colors -mx-4 px-4 py-2 ${char.dateLightReading ? 'active:bg-stone-100' : 'active:bg-white/5'}`}
                                    onTouchStart={(e) => handleMsgTouchStart(e, msg)}
                                    onTouchEnd={handleMsgTouchEnd}
                                    onTouchMove={handleMsgTouchMove}
                                    onMouseDown={(e) => handleMsgTouchStart(e, msg)}
                                    onMouseUp={handleMsgTouchEnd}
                                    onMouseMove={handleMsgTouchMove}
                                    onMouseLeave={handleMsgTouchEnd}
                                    onContextMenu={(e) => { e.preventDefault(); setSelectedMessage(msg); setModalType('options'); }}
                                >
                                    {msg.role === 'user' ? (
                                        <p className={`whitespace-pre-wrap font-serif text-[16px] text-right leading-loose tracking-wide italic pr-4 ${char.dateLightReading ? 'text-stone-400 border-r-2 border-stone-300/50' : 'text-slate-400 border-r-2 border-slate-600/50'}`}>{cleanTextForDisplay(msg.content)} <span className="text-[10px] uppercase font-sans not-italic ml-2 opacity-50">{userProfile.name}</span></p>
                                    ) : (
                                        <div>
                                            {(msg.content || '').split('\n').map((line, idx) => {
                                                const cleanLine = cleanTextForDisplay(line);
                                                if (!cleanLine) return null;
                                                return <p key={idx} className={`whitespace-pre-wrap font-serif text-[18px] text-justify leading-loose tracking-wide pl-4 mb-4 last:mb-0 ${char.dateLightReading ? 'text-stone-700 border-l-2 border-stone-200' : 'text-slate-200 drop-shadow-md border-l-2 border-white/10'}`}>{cleanLine}</p>
                                            })}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Visual Mode View */}
            {!isNovelMode && (
                <>
                    <div className="absolute inset-x-0 bottom-0 h-[90%] flex items-end justify-center pointer-events-none z-10 overflow-hidden">
                        {currentSprite && <img src={currentSprite} className="max-h-full max-w-full object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)] transition-all duration-300 origin-bottom" style={{ filter: showInputBox ? 'brightness(1)' : (isTextAnimating ? 'brightness(1.05)' : 'brightness(1)'), transform: `translate(${spriteConfig.x}%, ${spriteConfig.y}%) scale(${isTextAnimating ? spriteConfig.scale * 1.02 : spriteConfig.scale})` }} />}
                    </div>
                    {!isTyping && (
                        <div className="absolute inset-x-0 bottom-8 z-30 flex justify-center">
                            <div className="w-[90%] max-w-lg bg-black/60 backdrop-blur-xl rounded-2xl border border-white/10 p-6 min-h-[140px] shadow-2xl animate-slide-up hover:bg-black/70 cursor-pointer">
                                <div className="absolute -top-3 left-6"><div className="bg-white/90 text-black px-4 py-1 rounded-sm text-xs font-bold tracking-widest uppercase shadow-[0_4px_10px_rgba(0,0,0,0.3)] transform -skew-x-12">{char.name}</div></div>
                                <p className="text-white/90 text-[16px] leading-relaxed font-light tracking-wide drop-shadow-md mt-2">{displayedText}{isTextAnimating && <span className="inline-block w-2 h-4 bg-white/70 ml-1 animate-pulse align-middle"></span>}</p>
                                {!isTextAnimating && dialogueQueue.length > 0 && <div className="absolute bottom-3 right-4 animate-bounce opacity-70"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-white"><path fillRule="evenodd" d="M12.53 16.28a.75.75 0 0 1-1.06 0l-7.5-7.5a.75.75 0 0 1 1.06-1.06L12 14.69l6.97-6.97a.75.75 0 1 1 1.06 1.06l-7.5 7.5Z" clipRule="evenodd" /></svg></div>}
                                {!isTextAnimating && dialogueQueue.length === 0 && dialogueBatch.length > 0 && <div className="absolute bottom-3 right-4 opacity-50 text-[10px] text-white flex items-center gap-1 animate-pulse"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>Loop</div>}
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Input Layer */}
            <div className={`absolute inset-x-0 bottom-0 z-40 flex justify-center pointer-events-none transition-all duration-300 ${isTyping || showInputBox ? 'opacity-100' : 'opacity-0'}`}>
                {isTyping && (
                    <div className="absolute bottom-1/2 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 pointer-events-auto">
                        <div className="bg-black/80 backdrop-blur-md px-6 py-3 rounded-full border border-white/20 shadow-2xl animate-pulse flex items-center gap-3">
                             <div className="flex gap-1.5"><div className="w-2 h-2 bg-white rounded-full animate-bounce"></div><div className="w-2 h-2 bg-white rounded-full animate-bounce delay-75"></div><div className="w-2 h-2 bg-white rounded-full animate-bounce delay-150"></div></div>
                             <span className="text-xs text-white font-bold tracking-widest uppercase">Typing...</span>
                        </div>
                    </div>
                )}
                {showInputBox && (
                    <div className={`w-[90%] max-w-lg backdrop-blur-xl rounded-2xl p-2 flex gap-2 shadow-2xl animate-fade-in mb-8 pointer-events-auto ${char.dateLightReading ? 'bg-stone-100 border border-stone-300' : 'bg-white/10 border border-white/20'}`} onClick={(e) => e.stopPropagation()}>
                        <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={isTyping ? "等待回应..." : "输入对话..."} disabled={isTyping} className={`flex-1 bg-transparent px-4 py-3 outline-none font-light resize-none h-14 no-scrollbar leading-tight ${char.dateLightReading ? 'text-stone-800 placeholder:text-stone-400' : 'text-white placeholder:text-white/30'}`} autoFocus />
                        <button onClick={handleSend} disabled={!input.trim() || isTyping} className="px-6 bg-white text-black rounded-xl font-bold text-sm hover:bg-slate-200 disabled:opacity-50 transition-colors h-14 flex items-center justify-center">SEND</button>
                    </div>
                )}
            </div>

            {/* Settings Overlay */}
            {showSettings && (
                <div className="absolute inset-0 z-[200] animate-slide-up bg-white">
                    <DateSettings char={char} onBack={() => setShowSettings(false)} />
                </div>
            )}

            {/* Exit Modal */}
            <Modal isOpen={showExitModal} title="暂时离开?" onClose={() => setShowExitModal(false)} footer={<div className="flex gap-3 w-full"><button onClick={() => setShowExitModal(false)} className="flex-1 py-3 bg-slate-100 rounded-2xl text-slate-600 font-bold">留在这里</button><button onClick={handleExitClick} className="flex-1 py-3 bg-slate-800 text-white rounded-2xl font-bold">保存并退出</button></div>}>
                <div className="text-center text-slate-500 text-sm py-2 leading-relaxed">选择“保存并退出”将保留当前对话进度。<br/>下次见面时，你可以选择继续话题。</div>
            </Modal>

            {/* Message Options Modal */}
            <Modal isOpen={modalType === 'options'} title="操作" onClose={() => setModalType('none')}>
                <div className="space-y-3">
                    <button onClick={() => {
                        if (selectedMessage) {
                            const clean = (selectedMessage.content || '').replace(/\[.*?\]/g, '').trim();
                            navigator.clipboard.writeText(clean).then(() => addToast('已复制', 'success')).catch(() => addToast('复制失败', 'error'));
                        }
                        setModalType('none');
                    }} className="w-full py-3 bg-slate-50 text-slate-700 font-medium rounded-2xl">复制文本</button>
                    <button onClick={() => { onEditMessage(selectedMessage!); setModalType('none'); }} className="w-full py-3 bg-slate-50 text-slate-700 font-medium rounded-2xl">编辑内容</button>
                    <button onClick={() => { onDeleteMessage(selectedMessage!); setModalType('none'); }} className="w-full py-3 bg-red-50 text-red-500 font-medium rounded-2xl">删除记录</button>
                </div>
            </Modal>
        </div>
    );
};

export default DateSession;