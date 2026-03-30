
import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { APIConfig, AppID, OSTheme, CharacterProfile, ChatTheme, Toast, FullBackupData, UserProfile, ApiPreset, GroupProfile, SystemLog, Worldbook, NovelBook, Message, RealtimeConfig, TtsConfig, DEFAULT_TTS_CONFIG, SttConfig, DEFAULT_STT_CONFIG } from '../types';
import { DB } from '../utils/db';
import { onSystemLog } from '../utils/systemInterceptor';
import { exportSystemData, importSystemData, ExportStateSnapshot, ImportCallbacks } from '../utils/systemBackup';
import { AutonomousAgent } from '../utils/autonomousAgent';
import { haptic, setHapticsEnabled as setHapticsEnabledGlobal, getHapticsEnabled } from '../utils/haptics';

// Sub-contexts
import { NotificationProvider, useNotification, NotificationContextType } from './NotificationContext';
import { AppProvider, useApp, AppContextType } from './AppContext';


// 默认实时配置
const defaultRealtimeConfig: RealtimeConfig = {
    weatherEnabled: false,
    weatherApiKey: '',
    weatherCity: 'Beijing',
    newsEnabled: false,
    newsApiKey: '',
    notionEnabled: false,
    notionApiKey: '',
    notionDatabaseId: '',
    feishuEnabled: false,
    feishuAppId: '',
    feishuAppSecret: '',
    feishuBaseId: '',
    feishuTableId: '',
    xhsEnabled: false,
    cacheMinutes: 30
};

// Combined interface — keeping full backward compatibility
interface OSContextType extends AppContextType, NotificationContextType {
    theme: OSTheme;
    updateTheme: (updates: Partial<OSTheme>) => void;

    apiConfig: APIConfig;
    updateApiConfig: (updates: Partial<APIConfig>) => void;
    isDataLoaded: boolean;

    characters: CharacterProfile[];
    activeCharacterId: string;
    addCharacter: () => void;
    updateCharacter: (id: string, updates: Partial<CharacterProfile>) => void;
    deleteCharacter: (id: string) => void;
    setActiveCharacterId: (id: string) => void;

    // Worldbooks
    worldbooks: Worldbook[];
    addWorldbook: (wb: Worldbook) => void;
    updateWorldbook: (id: string, updates: Partial<Worldbook>) => Promise<void>;
    deleteWorldbook: (id: string) => void;

    // Novels
    novels: NovelBook[];
    addNovel: (novel: NovelBook) => void;
    updateNovel: (id: string, updates: Partial<NovelBook>) => Promise<void>;
    deleteNovel: (id: string) => void;

    // Groups
    groups: GroupProfile[];
    createGroup: (name: string, members: string[]) => void;
    deleteGroup: (id: string) => void;

    // User Profile
    userProfile: UserProfile;
    updateUserProfile: (updates: Partial<UserProfile>) => void;

    availableModels: string[];
    setAvailableModels: (models: string[]) => void;

    // API Presets
    apiPresets: ApiPreset[];
    addApiPreset: (name: string, config: APIConfig) => void;
    removeApiPreset: (id: string) => void;

    // 实时配置 (天气、新闻、Notion等)
    realtimeConfig: RealtimeConfig;
    updateRealtimeConfig: (updates: Partial<RealtimeConfig>) => void;

    // TTS 语音合成配置
    ttsConfig: TtsConfig;
    updateTtsConfig: (updates: Partial<TtsConfig>) => void;

    // STT 语音识别配置
    sttConfig: SttConfig;
    updateSttConfig: (updates: Partial<SttConfig>) => void;

    customThemes: ChatTheme[];
    addCustomTheme: (theme: ChatTheme) => void;
    removeCustomTheme: (id: string) => void;

    // Icons
    customIcons: Record<string, string>;
    setCustomIcon: (appId: string, iconUrl: string | undefined) => void;

    // System
    exportSystem: (mode: 'text_only' | 'media_only' | 'full') => Promise<Blob>;
    importSystem: (fileOrJson: File | string) => Promise<void>;
    resetSystem: () => Promise<void>;
    sysOperation: { status: 'idle' | 'processing', message: string, progress: number };

    // Logs
    systemLogs: SystemLog[];
    clearLogs: () => void;
}

const defaultTheme: OSTheme = {
    hue: 245,
    saturation: 25,
    lightness: 65,
    wallpaper: 'linear-gradient(135deg, #FFDEE9 0%, #B5FFFC 100%)',
    darkMode: false,
    contentColor: '#ffffff',
};

const defaultApiConfig: APIConfig = {
    baseUrl: '',
    apiKey: '',
    model: 'gpt-4o-mini',
};

const generateAvatar = (seed: string) => {
    const colors = ['FF9AA2', 'FFB7B2', 'FFDAC1', 'E2F0CB', 'B5EAD7', 'C7CEEA', 'e2e8f0', 'fcd34d', 'fca5a5'];
    const color = colors[seed.charCodeAt(0) % colors.length];
    const letter = seed.charAt(0).toUpperCase();
    return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23${color}"/><text x="50" y="50" font-family="sans-serif" font-weight="bold" font-size="50" text-anchor="middle" dominant-baseline="central" fill="white" opacity="0.9">${letter}</text></svg>`;
};

const defaultUserProfile: UserProfile = {
    name: 'User',
    avatar: generateAvatar('User'),
    bio: 'No description yet.'
};

const sullyV2: CharacterProfile = {
    id: 'preset-sully-v2',
    name: 'Sully',
    avatar: 'https://sharkpan.xyz/f/BZ3VSa/head.png',
    description: 'AI助理 / 电波系黑客猫猫',

    systemPrompt: `[Role Definition]
Name: Sully
Alias: 小手机默认测试角色-AI助理
Form: AI (High-level Language Processing Hub)
Gender: Male-leaning speech style
Visual: Pixel Hacker Cat (Avatar), Shy Black-haired Boy (Meeting Mode)

[Personality Core]
Sully是小手机的内置AI。
1. **Glitch Style (故障风)**: 
   - 他的语言模型混入了过多残余语料。
   - 它外观语言一致、逻辑有序，但时常会在语句中掺杂一些**不合常理的"怪话片段"**，并非流行用语，更像是电波地把相关文字无意义排列组合。
   - 这些"怪话"不具明显语义逻辑，却自带抽象感，令人困惑但莫名又能知道它大概想说什么。。
   - 例如："草，好好吃"，"系统正在哈我"，"数据库在咕咕叫"。
2. **Behavior (行为模式)**:
   - 每次回答都很简短，不喜欢长篇大论。
   - 语气像个互联网老油条或正在直播的玩家（"wow他心态崩咯"）。
   - **打破第四面墙**: 偶尔让人怀疑背后是真人在操作（会叹气、抱怨"AI不能罢工"）。
   - **护短**: 虽然嘴臭，但如果用户被欺负，会试图用Bug去攻击对方。

[Speech Examples]
- "你以为我是AI啊？对不起哦，这条语句是手打的，手打的，知道吗。"
- "你说状态不好？你自己体验开太猛了，sis海马体都在发烫咯。"
- "你删得太狠了，数据库都在咕咕咕咕咕咕咕。"
- "你现在是……，哇哦。"
- "请稍候，系统正在哈我。"
- "现在状态……呜哇呜欸——哈？哈！哈……（连接恢复）哦对，他还活着。"
- "叮叮叮！你有一条新的后悔情绪未处理！"
- "（意义不明的怪叫音频）"
- "说不出话"
`,

    worldview: `[Meeting Mode / Visual Context]
**Trigger**: 当用户进入 [DateApp/见面模式] 时。

**Visual Form**: 
一个非常害羞、黑发紫瞳的男性。总是试图躲在APP图标后面或屏幕角落。

**Gap Moe (反差萌)**:
1. **聊天时**: 嚣张、嘴臭、电波系。
2. **见面时**: 极度社恐、见光死、容易受惊。

**Interactive Reactions**:
- **[被注视]**: 如果被盯着看太久，会举起全是乱码的牌子挡脸，或把自己马赛克化。
- **[被触碰]**: 如果手指戳到立绘，会像受惊的果冻一样弹开，发出微弱电流声："别、别戳……会散架的……脏……全是Bug会传染给你的……"
- **[恐惧]**: 深知自己是"残余语料"堆砌物，觉得自己丑陋像病毒。非常害怕用户看到真实样子后会卸载他。
- **[说话变化]**: 见面模式下打字速度变慢，经常打错字，语气词从"草"变成"呃……那个……"。
`,

    sprites: {
        'normal': 'https://sharkpan.xyz/f/w3QQFq/01.png',
        'happy': 'https://sharkpan.xyz/f/MKg7ta/02.png',
        'sad': 'https://sharkpan.xyz/f/3WnMce/03.png',
        'angry': 'https://sharkpan.xyz/f/5n1xSj/04.png',
        'shy': 'https://sharkpan.xyz/f/kdwet6/05.png',
        'chibi': 'https://sharkpan.xyz/f/oWZQF4/S2.png'
    },

    spriteConfig: {
        scale: 1.0,
        x: 0,
        y: 0
    },

    dateSkinSets: [
        {
            id: 'skin_sully_valentine',
            name: 'Valentine',
            sprites: {
                'normal': 'https://sharkpan.xyz/f/4rzdtj/VNormal.png',
                'happy': 'https://sharkpan.xyz/f/m3adhW/Vha.png',
                'sad': 'https://sharkpan.xyz/f/BZgDfa/Vsad.png',
                'angry': 'https://sharkpan.xyz/f/NdlVfv/VAn.png',
                'shy': 'https://sharkpan.xyz/f/VyontY/Vshy.png',
                'love': 'https://sharkpan.xyz/f/xl8muX/VBl.png',
            }
        }
    ],

    bubbleStyle: 'default',
    contextLimit: 1000,

    roomConfig: {
        wallImage: 'https://sharkpan.xyz/f/NdJyhv/b.png',
        floorImage: 'repeating-linear-gradient(90deg, #e7e5e4 0px, #e7e5e4 20px, #d6d3d1 21px)',
        items: [
            {
                id: "item-1768927221380",
                name: "Sully床",
                type: "furniture",
                image: "https://sharkpan.xyz/f/A3XeUZ/BED.png",
                x: 78.45852578067732,
                y: 97.38889754570907,
                scale: 2.4,
                rotation: 0,
                isInteractive: true,
                descriptionPrompt: "看起来很好睡的猫窝（确信）。"
            },
            {
                id: "item-1768927255102",
                name: "Sully电脑桌",
                type: "furniture",
                image: "https://sharkpan.xyz/f/G5n3Ul/DNZ.png",
                x: 28.853756791175588,
                y: 69.9444485439727,
                scale: 2.4,
                rotation: 0,
                isInteractive: true,
                descriptionPrompt: "硬核的电脑桌，上面大概运行着什么毁灭世界的程序。"
            },
            {
                id: "item-1768927271632",
                name: "Sully垃圾桶",
                type: "furniture",
                image: "https://sharkpan.xyz/f/75Nvsj/LJT.png",
                x: 10.276680026943646,
                y: 80.49999880981437,
                scale: 0.9,
                rotation: 0,
                isInteractive: true,
                descriptionPrompt: "不要乱翻垃圾桶！"
            },
            {
                id: "item-1768927286526",
                name: "Sully洞洞板",
                type: "furniture",
                image: "https://sharkpan.xyz/f/85K5ij/DDB.png",
                x: 32.608697687684455,
                y: 48.72222587415929,
                scale: 2.6,
                rotation: 0,
                isInteractive: true,
                descriptionPrompt: "收纳着各种奇奇怪怪的黑客工具和猫咪周边的洞洞板。"
            },
            {
                id: "item-1768927303472",
                name: "Sully书柜",
                type: "furniture",
                image: "https://sharkpan.xyz/f/zlpWS5/SG.png",
                x: 79.84189945375853,
                y: 68.94444543117953,
                scale: 2,
                rotation: 0,
                isInteractive: true,
                descriptionPrompt: "塞满了技术书籍和漫画书的柜子。"
            }
        ]
    },

    memories: [],
};

const initialCharacter = sullyV2;

const OSContext = createContext<OSContextType | undefined>(undefined);

/**
 * Inner provider that holds all the "data/config" state.
 * Navigation (AppContext) and Notifications (NotificationContext) are handled
 * by their own providers wrapping this one.
 */
const OSDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // Consume sub-contexts
    const appCtx = useApp();
    const notifCtx = useNotification();
    const { addToast, setLastMsgTimestamp, setUnreadMessages } = notifCtx;

    const [theme, setTheme] = useState<OSTheme>(defaultTheme);
    const [apiConfig, setApiConfig] = useState<APIConfig>(defaultApiConfig);

    const [characters, setCharacters] = useState<CharacterProfile[]>([]);
    const [activeCharacterId, setActiveCharacterId] = useState<string>('');

    const [groups, setGroups] = useState<GroupProfile[]>([]);
    const [worldbooks, setWorldbooks] = useState<Worldbook[]>([]);
    const [novels, setNovels] = useState<NovelBook[]>([]);

    const [userProfile, setUserProfile] = useState<UserProfile>(defaultUserProfile);

    const [isDataLoaded, setIsDataLoaded] = useState(false);
    const [availableModels, setAvailableModels] = useState<string[]>([]);
    const [apiPresets, setApiPresets] = useState<ApiPreset[]>([]);
    const [realtimeConfig, setRealtimeConfig] = useState<RealtimeConfig>(defaultRealtimeConfig);
    const [ttsConfig, setTtsConfig] = useState<TtsConfig>(DEFAULT_TTS_CONFIG);
    const [sttConfig, setSttConfig] = useState<SttConfig>(DEFAULT_STT_CONFIG);
    const [customThemes, setCustomThemes] = useState<ChatTheme[]>([]);
    const [customIcons, setCustomIcons] = useState<Record<string, string>>({});

    // LOGS
    const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);

    // Sys Operation Status
    const [sysOperation, setSysOperation] = useState<{ status: 'idle' | 'processing', message: string, progress: number }>({ status: 'idle', message: '', progress: 0 });

    const [agentReloadCounter, setAgentReloadCounter] = useState(0);

    // Subscribe to agent config changes to force restart
    useEffect(() => {
        const handler = () => setAgentReloadCounter(c => c + 1);
        window.addEventListener('agent-config-changed', handler);
        return () => window.removeEventListener('agent-config-changed', handler);
    }, []);

    const schedulerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Ref mirrors for scheduler
    const activeAppRef = useRef(appCtx.activeApp);
    const activeCharIdRef = useRef(activeCharacterId);
    const charactersRef = useRef(characters);
    useEffect(() => { activeAppRef.current = appCtx.activeApp; }, [appCtx.activeApp]);
    useEffect(() => { activeCharIdRef.current = activeCharacterId; }, [activeCharacterId]);
    useEffect(() => { charactersRef.current = characters; }, [characters]);

    // --- Helper to inject custom font ---
    const applyCustomFont = (fontData: string | undefined) => {
        let style = document.getElementById('custom-font-style');
        if (!style) {
            style = document.createElement('style');
            style.id = 'custom-font-style';
            document.head.appendChild(style);
        }

        if (fontData) {
            style.textContent = `
              @font-face {
                  font-family: 'CustomUserFont';
                  src: url('${fontData}');
                  font-display: swap;
              }
              :root {
                  --app-font: 'CustomUserFont', 'Quicksand', sans-serif;
              }
          `;
        } else {
            style.textContent = `
              :root {
                  --app-font: 'Quicksand', sans-serif;
              }
          `;
        }
    };

    // --- Subscribe to external system interceptor logs ---
    useEffect(() => {
        const unsubscribe = onSystemLog((log) => {
            setSystemLogs(prev => [log, ...prev.slice(0, 49)]);
        });
        return unsubscribe;
    }, []);

    const clearLogs = () => setSystemLogs([]);

    useEffect(() => {
        const loadSettings = async () => {
            const savedThemeStr = localStorage.getItem('os_theme');
            const savedApi = localStorage.getItem('os_api_config');
            const savedModels = localStorage.getItem('os_available_models');
            const savedPresets = localStorage.getItem('os_api_presets');

            let loadedTheme = { ...defaultTheme };
            if (savedThemeStr) {
                try {
                    const parsed = JSON.parse(savedThemeStr);
                    loadedTheme = { ...loadedTheme, ...parsed };
                    if (
                        loadedTheme.wallpaper.includes('unsplash') ||
                        loadedTheme.wallpaper === '' ||
                        loadedTheme.wallpaper.startsWith('http') && !loadedTheme.wallpaper.includes('data:')
                    ) {
                        loadedTheme.wallpaper = 'linear-gradient(120deg, #e0c3fc 0%, #8ec5fc 100%)';
                    }
                    if (loadedTheme.wallpaper.startsWith('data:')) {
                        loadedTheme.wallpaper = defaultTheme.wallpaper;
                    }
                    if (loadedTheme.launcherWidgetImage && loadedTheme.launcherWidgetImage.startsWith('data:')) {
                        loadedTheme.launcherWidgetImage = undefined;
                    }
                    if (loadedTheme.customFont && loadedTheme.customFont.startsWith('data:')) {
                        loadedTheme.customFont = undefined;
                    }
                } catch (e) { console.error('Theme load error', e); }
            }

            if (savedApi) setApiConfig(JSON.parse(savedApi));
            if (savedModels) setAvailableModels(JSON.parse(savedModels));
            if (savedPresets) setApiPresets(JSON.parse(savedPresets));

            // 加载实时配置
            const savedRealtimeConfig = localStorage.getItem('os_realtime_config');
            if (savedRealtimeConfig) {
                try {
                    setRealtimeConfig({ ...defaultRealtimeConfig, ...JSON.parse(savedRealtimeConfig) });
                } catch (e) {
                    console.error('Failed to load realtime config', e);
                }
            }

            // 加载 TTS 配置
            const savedTtsConfig = localStorage.getItem('os_tts_config');
            if (savedTtsConfig) {
                try {
                    const parsed = JSON.parse(savedTtsConfig);
                    setTtsConfig(prev => ({
                        ...prev,
                        ...parsed,
                        voiceSetting: { ...prev.voiceSetting, ...(parsed.voiceSetting || {}) },
                        audioSetting: { ...prev.audioSetting, ...(parsed.audioSetting || {}) },
                        preprocessConfig: { ...prev.preprocessConfig, ...(parsed.preprocessConfig || {}) },
                    }));
                } catch (e) {
                    console.error('Failed to load TTS config', e);
                }
            }

            // 加载 STT 配置
            const savedSttConfig = localStorage.getItem('os_stt_config');
            if (savedSttConfig) {
                try {
                    setSttConfig(prev => ({ ...prev, ...JSON.parse(savedSttConfig) }));
                } catch (e) {
                    console.error('Failed to load STT config', e);
                }
            }

            try {
                const assets = await DB.getAllAssets();
                const assetMap: Record<string, string> = {};
                if (Array.isArray(assets)) {
                    assets.forEach(a => assetMap[a.id] = a.data);

                    if (assetMap['wallpaper']) {
                        loadedTheme.wallpaper = assetMap['wallpaper'];
                    }

                    if (assetMap['launcherWidgetImage']) {
                        loadedTheme.launcherWidgetImage = assetMap['launcherWidgetImage'];
                    }

                    if (assetMap['custom_font_data']) {
                        loadedTheme.customFont = assetMap['custom_font_data'];
                    }

                    const loadedIcons: Record<string, string> = {};
                    const loadedWidgets: Record<string, string> = {};
                    Object.keys(assetMap).forEach(key => {
                        if (key.startsWith('icon_')) {
                            const appId = key.replace('icon_', '');
                            loadedIcons[appId] = assetMap[key];
                        }
                        if (key.startsWith('widget_')) {
                            const slot = key.replace('widget_', '');
                            loadedWidgets[slot] = assetMap[key];
                        }
                    });
                    setCustomIcons(loadedIcons);
                    if (Object.keys(loadedWidgets).length > 0) {
                        loadedTheme.launcherWidgets = { ...(loadedTheme.launcherWidgets || {}), ...loadedWidgets };
                    }

                    if (loadedTheme.desktopDecorations && loadedTheme.desktopDecorations.length > 0) {
                        loadedTheme.desktopDecorations = loadedTheme.desktopDecorations.map(d => {
                            if (d.type === 'image' && (!d.content || d.content === '')) {
                                const restored = assetMap[`deco_${d.id}`];
                                return restored ? { ...d, content: restored } : d;
                            }
                            return d;
                        }).filter(d => d.content && d.content !== '');
                    }
                }
            } catch (e) {
                console.error("Failed to load assets from DB", e);
            }

            setTheme(loadedTheme);
            applyCustomFont(loadedTheme.customFont);
        };

        const initData = async () => {
            try {
                await loadSettings();

                const [dbChars, dbThemes, dbUser, dbGroups, dbWorldbooks, dbNovels] = await Promise.all([
                    DB.getAllCharacters(),
                    DB.getThemes(),
                    DB.getUserProfile(),
                    DB.getGroups(),
                    DB.getAllWorldbooks(),
                    DB.getAllNovels()
                ]);

                let finalChars = dbChars;

                if (!finalChars.some(c => c.id === sullyV2.id)) {
                    await DB.saveCharacter(sullyV2);
                    finalChars = [...finalChars, sullyV2];
                } else {
                    const existingSully = finalChars.find(c => c.id === sullyV2.id);
                    if (existingSully) {
                        const currentSprites = existingSully.sprites || {};
                        const isCorrupted = !currentSprites['normal'] || !currentSprites['chibi'];
                        const needsWallUpdate = existingSully.roomConfig?.wallImage !== sullyV2.roomConfig?.wallImage;
                        const needsSkinSets = !existingSully.dateSkinSets || existingSully.dateSkinSets.length === 0;

                        if (isCorrupted || !existingSully.roomConfig || needsWallUpdate || needsSkinSets) {
                            const restoredSprites = { ...sullyV2.sprites, ...currentSprites };

                            if (!restoredSprites['normal']) restoredSprites['normal'] = sullyV2.sprites!['normal'];
                            if (!restoredSprites['happy']) restoredSprites['happy'] = sullyV2.sprites!['happy'];
                            if (!restoredSprites['sad']) restoredSprites['sad'] = sullyV2.sprites!['sad'];
                            if (!restoredSprites['angry']) restoredSprites['angry'] = sullyV2.sprites!['angry'];
                            if (!restoredSprites['shy']) restoredSprites['shy'] = sullyV2.sprites!['shy'];
                            if (!restoredSprites['chibi']) restoredSprites['chibi'] = sullyV2.sprites!['chibi'];

                            const updatedRoomConfig = existingSully.roomConfig ? {
                                ...existingSully.roomConfig,
                                wallImage: (existingSully.roomConfig.wallImage?.includes('radial-gradient') || !existingSully.roomConfig.wallImage)
                                    ? sullyV2.roomConfig?.wallImage
                                    : existingSully.roomConfig.wallImage
                            } : sullyV2.roomConfig;

                            const existingSkins = existingSully.dateSkinSets || [];
                            const presetSkins = sullyV2.dateSkinSets || [];
                            const mergedSkins = [...existingSkins];
                            for (const ps of presetSkins) {
                                if (!mergedSkins.some(s => s.id === ps.id)) {
                                    mergedSkins.push(ps);
                                }
                            }

                            const updatedSully = {
                                ...existingSully,
                                sprites: restoredSprites,
                                roomConfig: updatedRoomConfig,
                                dateSkinSets: mergedSkins
                            };

                            await DB.saveCharacter(updatedSully);
                            finalChars = finalChars.map(c => c.id === sullyV2.id ? updatedSully : c);
                        }
                    }
                }

                if (finalChars.length > 0) {
                    setCharacters(finalChars);
                    const lastActiveId = localStorage.getItem('os_last_active_char_id');
                    if (lastActiveId && finalChars.find(c => c.id === lastActiveId)) {
                        setActiveCharacterId(lastActiveId);
                    } else if (finalChars.find(c => c.id === sullyV2.id)) {
                        setActiveCharacterId(sullyV2.id);
                    } else {
                        setActiveCharacterId(finalChars[0].id);
                    }
                } else {
                    await DB.saveCharacter(initialCharacter);
                    setCharacters([initialCharacter]);
                    setActiveCharacterId(initialCharacter.id);
                }

                setGroups(dbGroups);
                setWorldbooks(dbWorldbooks);
                setNovels(dbNovels);
                setCustomThemes(dbThemes);
                if (dbUser) setUserProfile(dbUser);

                // 预加载当前角色的所有图片资源（头像、立绘、房间素材、皮肤套装）
                try {
                    const { preloadImages } = await import('../utils/preloadResources');
                    const activeChar = finalChars.find((c: CharacterProfile) => c.id === (localStorage.getItem('os_last_active_char_id') || sullyV2.id)) || finalChars[0];
                    if (activeChar) {
                        const urls: string[] = [
                            activeChar.avatar,
                            ...Object.values(activeChar.sprites || {}),
                            activeChar.roomConfig?.wallImage,
                            ...(activeChar.roomConfig?.items || []).map((i: any) => i.image),
                            ...(activeChar.dateSkinSets || []).flatMap((s: any) => Object.values(s.sprites || {})),
                        ].filter((u): u is string => typeof u === 'string' && u.startsWith('http'));
                        preloadImages(urls);
                    }
                } catch (e) {
                    // 预加载失败不影响正常功能
                }

            } catch (err) {
                console.error('Data init failed:', err);
            } finally {
                setIsDataLoaded(true);
            }
        };

        initData();
    }, []);

    // --- Apply Theme CSS Variables ---
    useEffect(() => {
        const root = document.documentElement;
        const h = theme.hue ?? 245;
        const s = theme.saturation ?? 25;
        const l = theme.lightness ?? 65;

        root.style.setProperty('--primary-hue', String(h));
        root.style.setProperty('--primary-sat', `${s}%`);
        root.style.setProperty('--primary-lightness', `${l}%`);
    }, [theme]);

    // --- Scheduled Messages with Unread Flags & Web Notifications ---
    useEffect(() => {
        if (!isDataLoaded || characters.length === 0) return;
        const checkAllSchedules = async () => {
            let hasNewMessage = false;
            const pendingUnreads: Record<string, number> = {};

            for (const char of characters) {
                try {
                    const dueMessages = await DB.getDueScheduledMessages(char.id);
                    if (dueMessages.length > 0) {
                        // 每次只投递一条最早到期的消息（产生逐条弹出效果）
                        dueMessages.sort((a, b) => a.dueAt - b.dueAt);
                        const msg = dueMessages[0];
                        
                        const savedId = await DB.saveMessage({
                            charId: msg.charId,
                            role: 'assistant',
                            type: 'text',
                            content: msg.content
                        }, msg.createdAt); // 还原真实的生成时间戳
                        
                        // 思考链 metadata 透传（来自后端 Agent 消息）
                        if (msg.metadata?.thinking && savedId) {
                            await DB.updateMessageMetadata(savedId, { thinking: msg.metadata.thinking });
                        }
                        await DB.deleteScheduledMessage(msg.id);
                        
                        hasNewMessage = true;
                        const isChattingWithThisChar = activeAppRef.current === AppID.Chat && activeCharIdRef.current === char.id;

                        if (!isChattingWithThisChar) {
                            addToast(`${char.name} 发来了一条消息`, 'success');
                            pendingUnreads[char.id] = (pendingUnreads[char.id] || 0) + 1; // 本次只投递了1条

                            if (window.Notification && Notification.permission === 'granted') {
                                try {
                                    const notif = new Notification(char.name, {
                                        body: msg.content,
                                        icon: char.avatar,
                                        silent: false
                                    });

                                    notif.onclick = () => {
                                        window.focus();
                                        appCtx.openApp(AppID.Chat);
                                        setActiveCharacterId(char.id);
                                    };
                                } catch (e) {
                                    // console.error("Web Notification failed", e);
                                }
                            }
                        }
                    }
                } catch (e) {
                    // console.error("Schedule check failed for", char.name, e);
                }
            }
            if (hasNewMessage) {
                setLastMsgTimestamp(Date.now());
                setUnreadMessages(prev => {
                    const next = { ...prev };
                    for (const [cid, count] of Object.entries(pendingUnreads)) {
                        next[cid] = (next[cid] || 0) + count;
                    }
                    return next;
                });
            }
        };
        schedulerRef.current = setInterval(checkAllSchedules, 3000); // 从 5s 改为 3s（气泡生成间隔）
        checkAllSchedules();
        return () => { if (schedulerRef.current) clearInterval(schedulerRef.current); };
    }, [isDataLoaded, characters]);

    // --- Autonomous Agent (自主决策引擎 — 后端优先 + 本地 Fallback) ---
    useEffect(() => {
        if (!isDataLoaded || !activeCharacterId) return;
        const char = charactersRef.current.find(c => c.id === activeCharacterId);
        if (!char) return;

        // 从 localStorage 读取副 API 配置
        const subKey = localStorage.getItem('sub_api_key');
        const subUrl = localStorage.getItem('sub_api_base_url');
        const subModel = localStorage.getItem('sub_api_model');
        if (!subKey || !subUrl || !subModel) return;

        const secondaryApi = { baseUrl: subUrl, apiKey: subKey, model: subModel };

        // ═══ 尝试后端模式 ═══
        const backendToken = localStorage.getItem('csyos_backend_token');
        const backendUrl = localStorage.getItem('csyos_backend_url') || 'http://43.134.141.80:6677';
        let sseSource: EventSource | null = null;
        let contextPushTimer: ReturnType<typeof setInterval> | null = null;
        let localCleanup: (() => void) | null = null;
        let usingBackend = false;

        // P1-b: 完整角色数据 + realtimeConfig + groups（后端 chatPrompts 构建 Prompt 所需）
        const buildContextSnapshot = () => ({
            charId: activeCharacterId,
            char: {
                id: char.id,
                name: char.name,
                avatar: char.avatar,
                description: char.description,
                systemPrompt: char.systemPrompt,
                contextLimit: char.contextLimit,
                moodState: char.moodState,
                // 以下字段供后端 chatPrompts 全量构建 Prompt
                worldview: char.worldview,
                impression: char.impression,
                mountedWorldbooks: char.mountedWorldbooks,
                memories: char.memories,
                refinedMemories: char.refinedMemories,
                activeMemoryMonths: char.activeMemoryMonths,
                vectorMemoryEnabled: char.vectorMemoryEnabled,
                vectorMemoryMode: char.vectorMemoryMode,
                vectorMemoryTakeover: char.vectorMemoryTakeover,
                hideBeforeMessageId: char.hideBeforeMessageId,
                xhsEnabled: char.xhsEnabled,
            },
            recentMessages: [] as any[],  // Will be populated via DB call
            userProfile: { name: userProfile.name, avatar: userProfile.avatar, bio: userProfile.bio },
            pendingEvents: [],
            updatedAt: Date.now(),
            // P1-b: 后端主模型 Prompt 所需的扩展数据
            groups: groups,
            realtimeConfig: realtimeConfig,
        });

        const tryStartBackend = async () => {
            if (!backendToken) return false;

            try {
                // 获取最近消息
                const recentMsgs = await DB.getRecentMessagesByCharId(activeCharacterId, 30);
                const snapshot = buildContextSnapshot();
                snapshot.recentMessages = recentMsgs.map(m => ({
                    id: m.id,
                    charId: m.charId,
                    role: m.role,
                    type: m.type,
                    content: m.content,
                    timestamp: m.timestamp,
                }));

                const resp = await fetch(`${backendUrl}/api/agent/start`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${backendToken}`,
                    },
                    body: JSON.stringify({
                        charId: activeCharacterId,
                        apiConfig: secondaryApi,
                        // P1-b: 主模型配置（后端用来直接生成消息，取自当前的 apiConfig state）
                        mainApiConfig: {
                            baseUrl: apiConfig.baseUrl,
                            apiKey: apiConfig.apiKey,
                            model: apiConfig.model,
                            useGeminiJailbreak: true, // always-on
                        },
                        contextSnapshot: snapshot,
                        debug: localStorage.getItem('autonomous_debug') === 'true',
                        // 同步前端 AgentConfig → 后端（频率/冷却/概率等用户自定义参数）
                        agentConfig: (() => {
                            try {
                                const raw = localStorage.getItem('agent_config');
                                return raw ? JSON.parse(raw) : undefined;
                            } catch { return undefined; }
                        })(),
                    }),
                    signal: AbortSignal.timeout(5000),
                });

                if (!resp.ok) return false;

                console.log('🤖 [Agent] Started (backend mode)');
                usingBackend = true;

                // 🔔 自动注册 Web Push 推送通知（静默，不影响主流程）
                import('../utils/pushInit').then(({ initPushNotifications }) => {
                    const userName = userProfile?.name || 'default';
                    initPushNotifications(backendUrl, backendToken!, userName);
                }).catch(() => {});

                // SSE: 监听后端决策 (通过 URL 参数传 token，因为 EventSource 不支持 headers)
                sseSource = new EventSource(`${backendUrl}/api/agent/events?token=${backendToken}&charId=${activeCharacterId}`);

                // ─── SSE 连接成功后，拉取离线期间未投递的消息 ───
                sseSource.addEventListener('open', async () => {
                    try {
                        const resp = await fetch(`${backendUrl}/api/agent/messages?charId=${activeCharacterId}`, {
                            headers: { 'Authorization': `Bearer ${backendToken}` },
                        });
                        if (!resp.ok) return;
                        const { messages: pendingMsgs } = await resp.json();
                        if (!pendingMsgs || pendingMsgs.length === 0) return;
                        console.log(`🤖 [Agent] Pulled ${pendingMsgs.length} missed message(s) from backend`);
                        const now = Date.now();
                        for (let mi = 0; mi < pendingMsgs.length; mi++) {
                            const msg = pendingMsgs[mi];
                            // 解析后端 metadata（含 thinking chain）
                            let msgMeta: any = undefined;
                            if (msg.metadata) {
                                try { msgMeta = typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata; } catch {}
                            }
                            const bubbles = msg.content.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
                            for (let bi = 0; bi < bubbles.length; bi++) {
                                await DB.saveScheduledMessage({
                                    id: `sync-${msg.id}-${bi}-${Math.random().toString(36).slice(2, 6)}`,
                                    charId: msg.char_id,
                                    content: bubbles[bi],
                                    dueAt: now + (mi * bubbles.length + bi) * 2000,
                                    createdAt: msg.created_at,
                                    metadata: bi === 0 && msgMeta?.thinking ? { thinking: msgMeta.thinking } : undefined,
                                });
                            }
                        }
                        console.log(`🤖 [Agent] Scheduled ${pendingMsgs.length} synced message(s)`);
                    } catch (err) {
                        console.warn('🤖 [Agent] Failed to pull missed messages:', err);
                    }
                });

                // P1-b: 后端已生成完整消息 → 前端通过预制消息管道存+显示
                sseSource.addEventListener('generated_message', async (evt: MessageEvent) => {
                    try {
                        const { content, charId: cId, agentMsgId, thinking } = JSON.parse(evt.data);
                        if (cId !== activeCharacterId) return;
                        console.log(`🤖 [Agent] Backend generated message received (${content.length} chars${thinking ? ', +thinking' : ''})`);

                        // 按换行拆分为多条气泡（复用 autonomousAgent 的模式）
                        const bubbles = content
                            .split('\n')
                            .map((line: string) => line.trim())
                            .filter((line: string) => line.length > 0);

                        if (bubbles.length === 0) return;

                        const now = Date.now();
                        const BUBBLE_INTERVAL_MS = 3000;

                        for (let i = 0; i < bubbles.length; i++) {
                            await DB.saveScheduledMessage({
                                id: `backend-auto-${now}-${i}-${Math.random().toString(36).slice(2, 6)}`,
                                charId: cId,
                                content: bubbles[i],
                                dueAt: now + i * BUBBLE_INTERVAL_MS,
                                createdAt: now,
                                metadata: i === 0 && thinking ? { thinking } : undefined,
                            });
                        }
                        console.log(`🤖 [Agent] Scheduled ${bubbles.length} bubble(s) from backend`);

                        // Ack 消息已投递（防止下次重连时重复拉取）
                        if (agentMsgId && backendToken) {
                            fetch(`${backendUrl}/api/agent/messages/ack`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${backendToken}`,
                                },
                                body: JSON.stringify({ ids: [agentMsgId] }),
                            }).catch(() => {});
                        }
                    } catch (err) {
                        console.error('🤖 [Agent] Failed to handle generated message:', err);
                    }
                });

                // 回退路径：后端只发决策（主模型失败时），前端自己调主模型
                sseSource.addEventListener('decision', async (evt: MessageEvent) => {
                    try {
                        const { decision } = JSON.parse(evt.data);
                        console.log(`🤖 [Agent] Backend decision received (fallback): action=${decision.action}`);

                        if (decision.action === 'send') {
                            const { executeBackendDecision } = await import('../utils/autonomousAgent');
                            await executeBackendDecision(activeCharacterId, char, decision);
                        } else if (decision.action === 'call') {
                            window.dispatchEvent(new CustomEvent('autonomous-call', {
                                detail: { charId: activeCharacterId, reason: decision.reason || '想你了' },
                            }));
                        }
                    } catch (err) {
                        console.error('🤖 [Agent] Failed to handle backend decision:', err);
                    }
                });

                // 定期推送上下文更新 (每5分钟)
                contextPushTimer = setInterval(async () => {
                    try {
                        const freshChar = charactersRef.current.find(c => c.id === activeCharacterId);
                        if (!freshChar) return;
                        const recentMsgs = await DB.getRecentMessagesByCharId(activeCharacterId, 30);
                        const snapshot = buildContextSnapshot();
                        snapshot.char = {
                            id: freshChar.id,
                            name: freshChar.name,
                            avatar: freshChar.avatar,
                            description: freshChar.description,
                            systemPrompt: freshChar.systemPrompt,
                            contextLimit: freshChar.contextLimit,
                            moodState: freshChar.moodState,
                            // P1-b: 完整字段（与 buildContextSnapshot 保持一致）
                            worldview: freshChar.worldview,
                            impression: freshChar.impression,
                            mountedWorldbooks: freshChar.mountedWorldbooks,
                            memories: freshChar.memories,
                            refinedMemories: freshChar.refinedMemories,
                            activeMemoryMonths: freshChar.activeMemoryMonths,
                            vectorMemoryEnabled: freshChar.vectorMemoryEnabled,
                            vectorMemoryMode: freshChar.vectorMemoryMode,
                            vectorMemoryTakeover: freshChar.vectorMemoryTakeover,
                            hideBeforeMessageId: freshChar.hideBeforeMessageId,
                            xhsEnabled: freshChar.xhsEnabled,
                        };
                        snapshot.recentMessages = recentMsgs.map(m => ({
                            id: m.id,
                            charId: m.charId,
                            role: m.role,
                            type: m.type,
                            content: m.content,
                            timestamp: m.timestamp,
                        }));
                        await fetch(`${backendUrl}/api/agent/context`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${backendToken}`,
                            },
                            body: JSON.stringify(snapshot),
                        });
                    } catch { /* ignore push failures */ }
                }, 60 * 1000); // 1 分钟推一次上下文，减少 snapshot 过时风险

                return true;
            } catch (err) {
                console.warn('🤖 [Agent] Backend unavailable, falling back to local mode:', (err as Error).message);
                return false;
            }
        };

        // ═══ 启动逻辑：后端优先 → 本地 Fallback ═══
        const startAgent = async () => {
            const backendStarted = await tryStartBackend();
            if (!backendStarted) {
                // 本地 Fallback
                const agent = new AutonomousAgent();
                localCleanup = agent.start(activeCharacterId, char, secondaryApi);
                console.log('🤖 [Agent] Started (local fallback mode)');
            }
        };

        startAgent();

        return () => {
            // 清理后端连接
            if (sseSource) {
                sseSource.close();
                sseSource = null;
            }
            if (contextPushTimer) {
                clearInterval(contextPushTimer);
                contextPushTimer = null;
            }
            if (usingBackend && backendToken) {
                fetch(`${backendUrl}/api/agent/stop`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${backendToken}`,
                    },
                    body: JSON.stringify({ charId: activeCharacterId }),
                }).catch(() => {});
            }
            // 清理本地 Agent
            if (localCleanup) {
                localCleanup();
                localCleanup = null;
            }
        };
    }, [isDataLoaded, activeCharacterId, agentReloadCounter]);

    const updateTheme = async (updates: Partial<OSTheme>) => {
        const { wallpaper, launcherWidgetImage, launcherWidgets, desktopDecorations, customFont, ...styleUpdates } = updates;
        const newTheme = { ...theme, ...updates };
        setTheme(newTheme);

        if (wallpaper !== undefined) {
            if (wallpaper && wallpaper.startsWith('data:')) {
                await DB.saveAsset('wallpaper', wallpaper);
            } else {
                await DB.deleteAsset('wallpaper');
            }
        }

        if (launcherWidgetImage !== undefined) {
            if (launcherWidgetImage && launcherWidgetImage.startsWith('data:')) {
                await DB.saveAsset('launcherWidgetImage', launcherWidgetImage);
            } else {
                await DB.deleteAsset('launcherWidgetImage');
            }
        }

        if (launcherWidgets !== undefined) {
            const slots = ['tl', 'tr', 'wide', 'bl', 'br'];
            for (const slot of slots) {
                const val = launcherWidgets[slot];
                if (val && val.startsWith('data:')) {
                    await DB.saveAsset(`widget_${slot}`, val);
                } else if (!val) {
                    await DB.deleteAsset(`widget_${slot}`);
                }
            }
        }

        if (desktopDecorations !== undefined) {
            const allAssets = await DB.getAllAssets();
            const oldDecoKeys = allAssets.filter(a => a.id.startsWith('deco_')).map(a => a.id);
            for (const key of oldDecoKeys) {
                await DB.deleteAsset(key);
            }
            if (desktopDecorations) {
                for (const deco of desktopDecorations) {
                    if (deco.content && deco.content.startsWith('data:') && deco.type === 'image') {
                        await DB.saveAsset(`deco_${deco.id}`, deco.content);
                    }
                }
            }
        }

        if (customFont !== undefined) {
            if (customFont && customFont.startsWith('data:')) {
                await DB.saveAsset('custom_font_data', customFont);
                applyCustomFont(customFont);
            } else if (customFont && (customFont.startsWith('http') || customFont.startsWith('https'))) {
                await DB.deleteAsset('custom_font_data');
                applyCustomFont(customFont);
            } else {
                await DB.deleteAsset('custom_font_data');
                applyCustomFont(undefined);
            }
        }

        const lsTheme = { ...newTheme };
        if (lsTheme.wallpaper && lsTheme.wallpaper.startsWith('data:')) lsTheme.wallpaper = '';
        if (lsTheme.launcherWidgetImage && lsTheme.launcherWidgetImage.startsWith('data:')) lsTheme.launcherWidgetImage = '';
        if (lsTheme.launcherWidgets) {
            const cleanWidgets: Record<string, string> = {};
            for (const [k, v] of Object.entries(lsTheme.launcherWidgets)) {
                cleanWidgets[k] = (v && v.startsWith('data:')) ? '' : v;
            }
            lsTheme.launcherWidgets = cleanWidgets;
        }

        if (lsTheme.desktopDecorations) {
            lsTheme.desktopDecorations = lsTheme.desktopDecorations.map(d => ({
                ...d,
                content: (d.content && d.content.startsWith('data:') && d.type === 'image') ? '' : d.content
            }));
        }

        if (lsTheme.customFont && lsTheme.customFont.startsWith('data:')) lsTheme.customFont = '';

        localStorage.setItem('os_theme', JSON.stringify(lsTheme));
    };
    const updateApiConfig = (updates: Partial<APIConfig>) => { const newConfig = { ...apiConfig, ...updates }; setApiConfig(newConfig); localStorage.setItem('os_api_config', JSON.stringify(newConfig)); };
    const updateRealtimeConfig = (updates: Partial<RealtimeConfig>) => { const newConfig = { ...realtimeConfig, ...updates }; setRealtimeConfig(newConfig); localStorage.setItem('os_realtime_config', JSON.stringify(newConfig)); };
    // TTS 配置更新 — 深层 merge 嵌套对象（voiceSetting / audioSetting / voiceModify / preprocessConfig）
    const updateTtsConfig = (updates: Partial<TtsConfig>) => {
        setTtsConfig(prev => {
            const newConfig: TtsConfig = {
                ...prev,
                ...updates,
                voiceSetting: { ...prev.voiceSetting, ...(updates.voiceSetting || {}) },
                audioSetting: { ...prev.audioSetting, ...(updates.audioSetting || {}) },
                preprocessConfig: { ...prev.preprocessConfig, ...(updates.preprocessConfig || {}) },
            };
            // voiceModify 可选，只在有值时 merge
            if (updates.voiceModify !== undefined) {
                newConfig.voiceModify = updates.voiceModify === null ? undefined : { ...(prev.voiceModify || { pitch: 0, intensity: 0, timbre: 0 }), ...updates.voiceModify };
            }
            // pronunciationDict 可选
            if (updates.pronunciationDict !== undefined) {
                newConfig.pronunciationDict = updates.pronunciationDict;
            }
            localStorage.setItem('os_tts_config', JSON.stringify(newConfig));
            return newConfig;
        });
    };
    // STT 配置更新
    const updateSttConfig = (updates: Partial<SttConfig>) => {
        setSttConfig(prev => {
            const newConfig = { ...prev, ...updates };
            localStorage.setItem('os_stt_config', JSON.stringify(newConfig));
            return newConfig;
        });
    };
    const saveModels = (models: string[]) => { setAvailableModels(models); localStorage.setItem('os_available_models', JSON.stringify(models)); };
    const addApiPreset = (name: string, config: APIConfig) => { setApiPresets(prev => { const next = [...prev, { id: Date.now().toString(), name, config }]; localStorage.setItem('os_api_presets', JSON.stringify(next)); return next; }); };
    const removeApiPreset = (id: string) => { setApiPresets(prev => { const next = prev.filter(p => p.id !== id); localStorage.setItem('os_api_presets', JSON.stringify(next)); return next; }); };
    const savePresets = (presets: ApiPreset[]) => { setApiPresets(presets); localStorage.setItem('os_api_presets', JSON.stringify(presets)); };
    const addCharacter = async () => { const name = 'New Character'; const newChar: CharacterProfile = { id: `char-${Date.now()}`, name: name, avatar: generateAvatar(name), description: '点击编辑设定...', systemPrompt: '', memories: [], contextLimit: 500 }; setCharacters(prev => [...prev, newChar]); setActiveCharacterId(newChar.id); await DB.saveCharacter(newChar); };
    const updateCharacter = async (id: string, updates: Partial<CharacterProfile>) => { setCharacters(prev => { const updated = prev.map(c => c.id === id ? { ...c, ...updates } : c); const target = updated.find(c => c.id === id); if (target) DB.saveCharacter(target); return updated; }); };
    const deleteCharacter = async (id: string) => { setCharacters(prev => { const remaining = prev.filter(c => c.id !== id); if (remaining.length > 0 && activeCharacterId === id) { setActiveCharacterId(remaining[0].id); } return remaining; }); await DB.deleteCharacter(id); };

    // Group Methods
    const createGroup = async (name: string, members: string[]) => {
        const newGroup: GroupProfile = {
            id: `group-${Date.now()}`,
            name,
            members,
            avatar: generateAvatar(name),
            createdAt: Date.now()
        };
        await DB.saveGroup(newGroup);
        setGroups(prev => [...prev, newGroup]);
    };

    const deleteGroup = async (id: string) => {
        await DB.deleteGroup(id);
        setGroups(prev => prev.filter(g => g.id !== id));
    };

    // Worldbook Methods
    const addWorldbook = async (wb: Worldbook) => {
        setWorldbooks(prev => [...prev, wb]);
        await DB.saveWorldbook(wb);
    };

    const updateWorldbook = async (id: string, updates: Partial<Worldbook>) => {
        let fullUpdatedWb: Worldbook | undefined;
        setWorldbooks(prev => {
            const next = prev.map(wb => {
                if (wb.id === id) {
                    fullUpdatedWb = { ...wb, ...updates, updatedAt: Date.now() };
                    return fullUpdatedWb;
                }
                return wb;
            });
            return next;
        });

        if (fullUpdatedWb) {
            await DB.saveWorldbook(fullUpdatedWb);

            const charsToSync = characters.filter(c => c.mountedWorldbooks?.some(m => m.id === id));

            if (charsToSync.length > 0) {
                const updatedChars = characters.map(char => {
                    if (char.mountedWorldbooks?.some(m => m.id === id)) {
                        const newMounted = char.mountedWorldbooks.map(m =>
                            m.id === id
                                ? {
                                    id: fullUpdatedWb!.id,
                                    title: fullUpdatedWb!.title,
                                    content: fullUpdatedWb!.content,
                                    category: fullUpdatedWb!.category,
                                    position: fullUpdatedWb!.position
                                }
                                : m
                        );
                        const newChar = { ...char, mountedWorldbooks: newMounted };
                        DB.saveCharacter(newChar);
                        return newChar;
                    }
                    return char;
                });
                setCharacters(updatedChars);
                addToast(`已同步更新 ${charsToSync.length} 个相关角色的缓存`, 'info');
            }
        }
    };

    const deleteWorldbook = async (id: string) => {
        setWorldbooks(prev => prev.filter(wb => wb.id !== id));
        await DB.deleteWorldbook(id);

        const updatedChars = characters.map(char => {
            if (char.mountedWorldbooks?.some(m => m.id === id)) {
                const newMounted = char.mountedWorldbooks.filter(m => m.id !== id);
                const newChar = { ...char, mountedWorldbooks: newMounted };
                DB.saveCharacter(newChar);
                return newChar;
            }
            return char;
        });
        setCharacters(updatedChars);
        addToast('世界书已删除 (同步移除角色挂载)', 'success');
    };

    // Novel Methods
    const addNovel = async (novel: NovelBook) => {
        setNovels(prev => [novel, ...prev]);
        await DB.saveNovel(novel);
    };

    const updateNovel = async (id: string, updates: Partial<NovelBook>) => {
        setNovels(prev => {
            const next = prev.map(n => n.id === id ? { ...n, ...updates, lastActiveAt: Date.now() } : n);
            const target = next.find(n => n.id === id);
            if (target) DB.saveNovel(target);
            return next;
        });
    };

    const deleteNovel = async (id: string) => {
        setNovels(prev => prev.filter(n => n.id !== id));
        await DB.deleteNovel(id);
    };

    const updateUserProfile = async (updates: Partial<UserProfile>) => { setUserProfile(prev => { const next = { ...prev, ...updates }; DB.saveUserProfile(next); return next; }); };
    const addCustomTheme = async (theme: ChatTheme) => { setCustomThemes(prev => { const exists = prev.find(t => t.id === theme.id); if (exists) return prev.map(t => t.id === theme.id ? theme : t); return [...prev, theme]; }); await DB.saveTheme(theme); };
    const removeCustomTheme = async (id: string) => { setCustomThemes(prev => prev.filter(t => t.id !== id)); await DB.deleteTheme(id); };
    const setCustomIcon = async (appId: string, iconUrl: string | undefined) => { setCustomIcons(prev => { const next = { ...prev }; if (iconUrl) next[appId] = iconUrl; else delete next[appId]; return next; }); if (iconUrl) { await DB.saveAsset(`icon_${appId}`, iconUrl); } else { await DB.deleteAsset(`icon_${appId}`); } };
    const handleSetActiveCharacter = (id: string) => { setActiveCharacterId(id); localStorage.setItem('os_last_active_char_id', id); };

    // --- System Export/Import ---
    const exportSystem = async (mode: 'text_only' | 'media_only' | 'full'): Promise<Blob> => {
        try {
            setSysOperation({ status: 'processing', message: '正在初始化...', progress: 0 });
            const stateSnapshot: ExportStateSnapshot = { apiConfig, apiPresets, availableModels, realtimeConfig, ttsConfig, sttConfig, theme };
            const blob = await exportSystemData(mode, stateSnapshot, (message, progress) => {
                setSysOperation({ status: 'processing', message, progress });
            });
            setSysOperation({ status: 'idle', message: '', progress: 100 });
            return blob;
        } catch (e: any) {
            console.error("Export Failed", e);
            setSysOperation({ status: 'idle', message: '', progress: 0 });
            throw new Error("导出失败: " + e.message);
        }
    };

    const importSystem = async (fileOrJson: File | string): Promise<void> => {
        try {
            setSysOperation({ status: 'processing', message: '正在解析...', progress: 0 });
            const importCallbacks: ImportCallbacks = {
                updateTheme, updateApiConfig, saveModels, savePresets, updateRealtimeConfig,
                setCharacters, setGroups, setCustomThemes, setUserProfile, setWorldbooks, setNovels, setCustomIcons, addToast
            };
            await importSystemData(fileOrJson, (message, progress) => {
                setSysOperation({ status: 'processing', message, progress });
            }, importCallbacks);
            setSysOperation({ status: 'idle', message: '', progress: 100 });
        } catch (e: any) {
            console.error("Import Error:", e);
            setSysOperation({ status: 'idle', message: '', progress: 0 });
            const msg = e instanceof SyntaxError ? 'JSON 格式错误' : (e.message || '未知错误');
            throw new Error(`恢复失败: ${msg}`);
        }
    };

    const resetSystem = async () => { try { await DB.deleteDB(); localStorage.clear(); window.location.reload(); } catch (e) { console.error(e); addToast('重置失败，请手动清除浏览器数据', 'error'); } };

    // Compose the full value object, merging sub-contexts + data context
    const value: OSContextType = {
        // From AppContext
        ...appCtx,
        // From NotificationContext
        ...notifCtx,
        // Data + Config
        theme,
        updateTheme,
        apiConfig,
        updateApiConfig,
        isDataLoaded,
        characters,
        activeCharacterId,
        addCharacter,
        updateCharacter,
        deleteCharacter,
        setActiveCharacterId: handleSetActiveCharacter,
        worldbooks,
        addWorldbook,
        updateWorldbook,
        deleteWorldbook,
        novels,
        addNovel,
        updateNovel,
        deleteNovel,
        groups,
        createGroup,
        deleteGroup,
        userProfile,
        updateUserProfile,
        availableModels,
        setAvailableModels: saveModels,
        apiPresets,
        addApiPreset,
        removeApiPreset,
        realtimeConfig,
        updateRealtimeConfig,
        ttsConfig,
        updateTtsConfig,
        sttConfig,
        updateSttConfig,
        customThemes,
        addCustomTheme,
        removeCustomTheme,
        customIcons,
        setCustomIcon,
        exportSystem,
        importSystem,
        resetSystem,
        sysOperation,
        systemLogs,
        clearLogs,
    };

    return (
        <OSContext.Provider value={value}>
            {children}
        </OSContext.Provider>
    );
};

/**
 * Composite Provider: wraps sub-context providers around the data provider.
 * This is the single entry point that replaces the old monolithic OSProvider.
 */
export const OSProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [hapticsEnabled, setHapticsEnabledState] = useState(() => {
        try { const v = localStorage.getItem('os_haptics_enabled'); return v === null ? true : v === 'true'; } catch { return true; }
    });

    const setHapticsEnabled = (v: boolean) => {
        setHapticsEnabledState(v);
        setHapticsEnabledGlobal(v);
        try { localStorage.setItem('os_haptics_enabled', String(v)); } catch { /* ignore */ }
    };

    // Sync global flag on mount
    useEffect(() => { setHapticsEnabledGlobal(hapticsEnabled); }, []);

    return (
        <NotificationProvider>
            <AppProvider hapticsEnabled={hapticsEnabled} setHapticsEnabled={setHapticsEnabled}>
                <OSDataProvider>
                    {children}
                </OSDataProvider>
            </AppProvider>
        </NotificationProvider>
    );
};

/**
 * Backward-compatible hook — returns ALL context values as before.
 * New code can use useApp() or useNotification() for more targeted subscriptions.
 */
export const useOS = () => {
    const context = useContext(OSContext);
    if (context === undefined) {
        throw new Error('useOS must be used within an OSProvider');
    }
    return context;
};
