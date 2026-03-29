
import { MemoryFragment, SpriteConfig, SkinSet, UserImpression } from './chat';
import { RoomItem, RoomGeneratedState } from './room';
import { ChatTheme, BubbleStyle } from './chat';
import { StatusBarMode, CustomStatusTemplate, StatusCardData } from './statusCard';

// --- DATE APP TYPES ---
export interface DialogueItem {
    text: string;
    emotion?: string;
}

export interface DateState {
    dialogueQueue: DialogueItem[];
    dialogueBatch: DialogueItem[];
    currentText: string;
    bgImage: string;
    currentSprite: string;
    isNovelMode: boolean;
    timestamp: number;
    peekStatus: string;
}

export interface SpecialMomentRecord {
    content: string;
    timestamp: number;
    source?: 'generated' | 'migrated';
}

export interface PhoneCustomApp {
    id: string;
    name: string;
    icon: string;
    color: string;
    prompt: string;
}

export interface PhoneEvidence {
    id: string;
    type: 'chat' | 'order' | 'social' | 'delivery' | string;
    title: string;
    detail: string;
    timestamp: number;
    systemMessageId?: number;
    value?: string;
    shop?: string;  // Store/shop name (used by Taobao order cards)
}

export interface Worldbook {
    id: string;
    title: string;
    content: string;
    category: string;
    position?: 'top' | 'after_worldview' | 'after_impression' | 'bottom';
    createdAt: number;
    updatedAt: number;
}

export interface GroupProfile {
    id: string;
    name: string;
    members: string[];
    avatar?: string;
    createdAt: number;
}

/** 内部状态层 — 仿生情绪架构 (7维神经递质模型) */
export interface InternalState {
    // ─── 核心神经递质 (0.0 ~ 1.0, 基线 0.5) ───
    dopamine: number;          // 多巴胺: 奖赏/动力/期待 (低→无聊, 高→兴奋)
    serotonin: number;         // 血清素: 情绪稳定/安全感 (低→焦虑/emo, 高→平和)
    cortisol: number;          // 皮质醇: 压力/警觉 (低→放松, 高→紧张/易怒)
    oxytocin: number;          // 催产素: 亲密/信任 (低→疏离, 高→温柔/依恋)
    norepinephrine: number;    // 去甲肾上腺素: 专注/警觉 (低→走神, 高→精神集中)
    endorphin: number;         // 内啡肽: 释然/止痛 (低→痛感强, 高→释然/轻盈)
    energy: number;            // 综合精力 (低→疲倦/敷衍, 高→活跃/话多)

    // ─── 涌现层 ───
    innerVoice: string;        // 心声: 角色此刻脑中闪过的念头
    surfaceEmotion: string;    // 外显情绪标签 (2-4字, 用于日志/debug)

    // ─── 情绪惯性 ───
    streaks?: Partial<Record<string, number>>;  // 各维度连续偏离轮数（可选，旧数据自动兼容）

    // ─── 元数据 ───
    roundCount: number;        // 当前状态模式已持续几轮
    updatedAt: number;         // 上次更新时间戳
}

/** @deprecated 旧格式兼容 — 迁移期保留 */
export interface MoodState {
    mood: string;
    intensity: number;
    cause: string;
    innerVoice: string;
    unresolved?: string;
    roundCount: number;
    updatedAt: number;
}

export interface CharacterProfile {
    id: string;
    name: string;
    avatar: string;
    description: string;
    systemPrompt: string;
    worldview?: string;
    memories: MemoryFragment[];
    refinedMemories?: Record<string, string>;
    activeMemoryMonths?: string[];

    writerPersona?: string;
    writerPersonaGeneratedAt?: number;

    mountedWorldbooks?: { id: string; title: string; content: string; category?: string; position?: 'top' | 'after_worldview' | 'after_impression' | 'bottom'; vectorized?: boolean }[];

    impression?: UserImpression;

    bubbleStyle?: string;
    chatBackground?: string;
    contextLimit?: number;
    hideSystemLogs?: boolean;
    hideBeforeMessageId?: number;

    dateBackground?: string;
    sprites?: Record<string, string>;
    spriteConfig?: SpriteConfig;
    customDateSprites?: string[]; // User-added custom emotion names for date mode (per-character)
    dateLightReading?: boolean;   // Light reading mode for novel/text view in date
    dateSkinSets?: SkinSet[];     // Multiple skin sets for portrait mode
    activeSkinSetId?: string;     // Currently active skin set ID

    savedDateState?: DateState;
    specialMomentRecords?: Record<string, SpecialMomentRecord>;

    // 小红书 per-character toggle
    xhsEnabled?: boolean;
    // 思考链可见性 per-character toggle
    showThinking?: boolean;

    socialProfile?: {
        handle: string;
        bio?: string;
    };

    roomConfig?: {
        bgImage?: string;
        wallImage?: string;
        floorImage?: string;
        items: RoomItem[];
        wallScale?: number;
        wallRepeat?: boolean;
        floorScale?: number;
        floorRepeat?: boolean;
    };

    lastRoomDate?: string;
    savedRoomState?: RoomGeneratedState;

    phoneState?: {
        records?: PhoneEvidence[];
        customApps?: PhoneCustomApp[];
    };

    // Vector Memory System
    vectorMemoryEnabled?: boolean;           // Master toggle (off = original mode)
    vectorMemoryAutoExtract?: boolean;       // Auto-extract (default true)
    vectorMemoryExtractInterval?: number;    // Extract interval in messages (default 30)
    vectorMemoryLastExtractAt?: number;      // Last extracted message ID
    vectorMemoryTakeover?: boolean;          // @deprecated — use vectorMemoryMode instead
    vectorMemoryMode?: 'traditional' | 'hybrid' | 'vector';  // Three-tier mode (default: 'hybrid')

    // Internal State Layer (内部状态层 — 仿生情绪架构)
    moodState?: InternalState | MoodState;     // Current internal state (or legacy MoodState for migration)

    // Creative Status Bar (创意状态栏)
    statusBarMode?: StatusBarMode;             // 'classic' | 'creative' | 'custom' (default: 'classic')
    customStatusTemplates?: CustomStatusTemplate[];  // User-defined templates for 'custom' mode
    lastStatusCard?: StatusCardData;           // Last generated creative card data
}

export interface CharacterExportData extends Omit<CharacterProfile, 'id' | 'memories' | 'refinedMemories' | 'activeMemoryMonths' | 'impression' | 'vectorMemoryEnabled' | 'vectorMemoryAutoExtract' | 'vectorMemoryExtractInterval' | 'vectorMemoryLastExtractAt' | 'vectorMemoryTakeover' | 'vectorMemoryMode' | 'moodState'> {
    version: number;
    type: 'sully_character_card';
    embeddedTheme?: ChatTheme;
}
