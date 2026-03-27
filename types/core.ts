
export enum AppID {
    Launcher = 'launcher',
    Settings = 'settings',
    Character = 'character',
    Chat = 'chat',
    GroupChat = 'group_chat',
    Gallery = 'gallery',
    Music = 'music',
    Browser = 'browser',
    ThemeMaker = 'thememaker',
    Appearance = 'appearance',
    Date = 'date',
    User = 'user',
    Journal = 'journal',
    Schedule = 'schedule',
    Room = 'room',
    CheckPhone = 'check_phone',
    Social = 'social',
    Study = 'study',
    FAQ = 'faq',
    Game = 'game',
    Worldbook = 'worldbook',
    Novel = 'novel',
    Bank = 'bank', // New App
    XhsStock = 'xhs_stock', // XHS image stock for publishing
    SpecialMoments = 'special_moments', // Valentine's Day & future events
    XhsFreeRoam = 'xhs_free_roam', // Character autonomous XHS activity
    Zhaixinglou = 'zhaixinglou', // 摘星楼 - Astrology & Divination
    CsyManual = 'csy_manual', // CSY二改版使用手册
    VoiceCall = 'voice_call', // 语音通话
    CognitiveNetwork = 'cognitive_network', // 认知网络独立App
}

export interface SystemLog {
    id: string;
    timestamp: number;
    type: 'error' | 'network' | 'system';
    source: string;
    message: string;
    detail?: string;
}

export interface AppConfig {
    id: AppID;
    name: string;
    icon: string;
    color: string;
}

export interface DesktopDecoration {
    id: string;
    type: 'image' | 'preset';
    content: string; // data URI for image, SVG data URI or emoji for preset
    x: number;       // percentage 0-100
    y: number;       // percentage 0-100
    scale: number;   // multiplier (0.2 - 3)
    rotation: number; // degrees (-180 to 180)
    opacity: number;  // 0-1
    zIndex: number;
    flip?: boolean;
}

export interface OSTheme {
    hue: number;
    saturation: number;
    lightness: number;
    wallpaper: string;
    darkMode: boolean;
    contentColor?: string;
    launcherWidgetImage?: string; // kept for backward compat, migrated to launcherWidgets['wide']
    launcherWidgets?: Record<string, string>; // slots: 'tl' | 'tr' | 'wide'
    desktopDecorations?: DesktopDecoration[];
    customFont?: string;
    hideStatusBar?: boolean;
}

export interface TranslationConfig {
    enabled: boolean;
    sourceLang: string; // e.g. '日本語' - the language messages are displayed in (选)
    targetLang: string; // e.g. '中文' - the language to translate into (译)
}

export interface VirtualTime {
    hours: number;
    minutes: number;
    day: string;
}

export interface APIConfig {
    baseUrl: string;
    apiKey: string;
    model: string;
    useGeminiJailbreak?: boolean;
}

export interface ApiPreset {
    id: string;
    name: string;
    config: APIConfig;
}

export interface UserProfile {
    name: string;
    avatar: string;
    bio: string;
}

export interface Toast {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
}
