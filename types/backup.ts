
import { OSTheme, APIConfig, ApiPreset } from './core';
import { RealtimeConfig } from './realtime';
import { CharacterProfile, GroupProfile, Worldbook, PhoneEvidence, PhoneCustomApp } from './character';
import { ChatTheme, Message, Emoji, EmojiCategory, BubbleStyle, VectorMemory } from './chat';
import { RoomItem, RoomTodo, RoomNote } from './room';
import {
    SocialPost, SubAccount, SocialAppProfile, GalleryImage, DiaryEntry,
    Task, Anniversary, StudyCourse, GameSession, NovelBook
} from './social';
import { BankFullState, BankTransaction, DollhouseState } from './bank';
import { XhsActivityRecord, XhsStockImage } from './xhs';
import { TtsConfig } from './tts';
import { SttConfig } from './stt';

export interface FullBackupData {
    timestamp: number;
    version: number;
    theme?: OSTheme;
    apiConfig?: APIConfig;
    apiPresets?: ApiPreset[];
    availableModels?: string[];
    realtimeConfig?: RealtimeConfig;  // 实时感知配置（天气/新闻/Notion）
    ttsConfig?: TtsConfig;            // 语音合成配置
    sttConfig?: SttConfig;            // 语音识别配置
    customIcons?: Record<string, string>;
    characters?: CharacterProfile[];
    groups?: GroupProfile[];
    messages?: Message[];
    customThemes?: ChatTheme[];
    savedEmojis?: Emoji[];
    emojiCategories?: EmojiCategory[];
    savedJournalStickers?: { name: string, url: string }[];
    assets?: { id: string, data: string }[];
    galleryImages?: GalleryImage[];
    userProfile?: { name: string; avatar: string; bio: string };
    diaries?: DiaryEntry[];
    tasks?: Task[];
    anniversaries?: Anniversary[];
    roomTodos?: RoomTodo[];
    roomNotes?: RoomNote[];
    socialPosts?: SocialPost[];
    courses?: StudyCourse[];
    games?: GameSession[];
    worldbooks?: Worldbook[];
    roomCustomAssets?: { name: string, image: string, defaultScale: number, description?: string }[];

    novels?: NovelBook[];

    // Bank Data
    bankState?: BankFullState;
    bankDollhouse?: DollhouseState;
    bankTransactions?: BankTransaction[];

    socialAppData?: {
        charHandles?: Record<string, SubAccount[]>;
        userProfile?: SocialAppProfile;
        userId?: string;
        userBg?: string;
    };

    mediaAssets?: {
        charId: string;
        avatar?: string;
        sprites?: Record<string, string>;
        roomItems?: Record<string, string>;
        backgrounds?: { chat?: string; date?: string; roomWall?: string; roomFloor?: string };
    }[];

    xhsActivities?: XhsActivityRecord[];
    xhsStockImages?: XhsStockImage[];

    // Vector Memory Data
    vectorMemories?: VectorMemory[];

    // Extra localStorage config (sub API, embedding, backend, etc.)
    extraLocalStorageConfig?: Record<string, string>;
}
