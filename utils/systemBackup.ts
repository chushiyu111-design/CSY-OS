
import { APIConfig, OSTheme, CharacterProfile, ChatTheme, FullBackupData, UserProfile, ApiPreset, GroupProfile, SystemLog, Worldbook, NovelBook, Message, RealtimeConfig, TtsConfig, SttConfig } from '../types';
import { DB } from './db';

// ─── JSZip Dynamic Loader ───────────────────────────────────────────────

interface JSZipLike {
    folder: (name: string) => { file: (name: string, data: string, options?: { base64?: boolean }) => void } | null;
    file: (...args: any[]) => any;
    generateAsync: (options: { type: 'blob' }, onUpdate?: (metadata: { percent: number }) => void) => Promise<Blob>;
}

interface JSZipCtorLike {
    new(): JSZipLike;
    loadAsync: (file: File) => Promise<JSZipLike>;
}

const dynamicImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>;
let jszipCtorPromise: Promise<JSZipCtorLike> | null = null;

function loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
        // Check if already loaded
        if (document.querySelector(`script[src="${src}"]`)) {
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = src;
        script.async = true;

        script.onload = () => {
            // Give it a tick to register globals
            setTimeout(resolve, 50);
        };
        script.onerror = () => reject(new Error(`Failed to load script: ${src}`));

        document.head.appendChild(script);
    });
}

export function loadJSZip(): Promise<JSZipCtorLike> {
    if (jszipCtorPromise) return jszipCtorPromise;

    jszipCtorPromise = (async () => {
        try {
            const mod = await dynamicImport('https://esm.sh/jszip@3.10.1');
            return mod.default as JSZipCtorLike;
        } catch {
            console.warn('ESM import failed, falling back to CDN script tag');
            await loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
            return (window as any).JSZip as JSZipCtorLike;
        }
    })();

    return jszipCtorPromise;
}

// ─── Pure Data Processing Helpers ───────────────────────────────────────

/** Strip all base64 image data URIs recursively */
function stripBase64(obj: any): any {
    if (typeof obj === 'string') {
        if (obj.startsWith('data:image')) return '';
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(item => stripBase64(item));
    }
    if (obj !== null && typeof obj === 'object') {
        const newObj: any = {};
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                newObj[key] = stripBase64(obj[key]);
            }
        }
        return newObj;
    }
    return obj;
}

/** Extract base64 images into ZIP assets folder, replacing them with path references */
function processObjectForZip(
    obj: any,
    assetsFolder: { file: (name: string, data: string, options?: { base64?: boolean }) => void } | null,
    assetCounter: { count: number }
): any {
    if (obj === null || typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
        return obj.map(item => processObjectForZip(item, assetsFolder, assetCounter));
    }

    const newObj: any = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            let value = obj[key];
            if (typeof value === 'string' && value.startsWith('data:image/')) {
                try {
                    const extMatch = value.match(/data:image\/([a-zA-Z0-9]+);base64,/);
                    if (extMatch) {
                        const ext = extMatch[1] === 'jpeg' ? 'jpg' : extMatch[1];
                        const filename = `asset_${Date.now()}_${assetCounter.count++}.${ext}`;
                        const base64Data = value.split(',')[1];
                        assetsFolder?.file(filename, base64Data, { base64: true });
                        value = `assets/${filename}`;
                    }
                } catch (e) {
                    console.warn("Failed to process asset", e);
                }
            } else {
                value = processObjectForZip(value, assetsFolder, assetCounter);
            }
            newObj[key] = value;
        }
    }
    return newObj;
}

/** Restore ZIP asset references back to base64 data URIs */
async function restoreAssetsFromZip(obj: any, zip: JSZipLike | null): Promise<any> {
    if (obj === null || typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
        const arr = [];
        for (const item of obj) {
            arr.push(await restoreAssetsFromZip(item, zip));
        }
        return arr;
    }

    const newObj: any = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            let value = obj[key];
            if (typeof value === 'string' && value.startsWith('assets/') && zip) {
                try {
                    const filename = value.split('/')[1];
                    const fileInZip = zip.file(`assets/${filename}`);
                    if (fileInZip) {
                        const base64 = await (fileInZip as any).async("base64");
                        const ext = filename.split('.').pop() || 'png';
                        let mime = 'image/png';
                        if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg';
                        if (ext === 'gif') mime = 'image/gif';
                        if (ext === 'webp') mime = 'image/webp';

                        value = `data:${mime};base64,${base64}`;
                    }
                } catch (e) {
                    console.warn(`Failed to restore asset: ${value}`);
                }
            } else {
                value = await restoreAssetsFromZip(value, zip);
            }
            newObj[key] = value;
        }
    }
    return newObj;
}

// ─── Store Definitions ──────────────────────────────────────────────────

const ALL_STORES = [
    'characters', 'messages', 'themes', 'emojis', 'emoji_categories', 'assets', 'gallery',
    'user_profile', 'diaries', 'tasks', 'anniversaries', 'room_todos',
    'room_notes', 'groups', 'journal_stickers', 'social_posts', 'courses', 'games', 'worldbooks', 'novels',
    'bank_transactions', 'bank_data',
    'xhs_activities', 'xhs_stock',
    'vector_memories'
];

// localStorage keys to include in backup (sub API, embedding, backend, etc.)
const EXTRA_LS_KEYS = [
    'sub_api_key', 'sub_api_base_url', 'sub_api_model', 'sub_api_presets',
    'csyos_backend_token', 'csyos_backend_url',
    'embedding_provider', 'embedding_api_key', 'embedding_base_url', 'embedding_model',
    'embedding_api_key_openai', 'embedding_base_url_openai', 'embedding_model_openai',
    'embedding_api_key_cohere', 'embedding_base_url_cohere', 'embedding_model_cohere',
    'cohere_rerank_api_key', 'cohere_rerank_use_paid',
    'body_signal_mode', 'autonomous_debug',
];

function getStoresToProcess(mode: 'text_only' | 'media_only' | 'full'): string[] {
    if (mode === 'full') return ALL_STORES;
    if (mode === 'text_only') return ALL_STORES.filter(s => s !== 'assets');
    // media_only
    return ['gallery', 'emojis', 'emoji_categories', 'journal_stickers', 'user_profile', 'characters', 'messages', 'themes', 'assets', 'bank_data'];
}

// ─── Export Pipeline ────────────────────────────────────────────────────

export interface ExportStateSnapshot {
    apiConfig: APIConfig;
    apiPresets: ApiPreset[];
    availableModels: string[];
    realtimeConfig: RealtimeConfig;
    ttsConfig: TtsConfig;
    sttConfig: SttConfig;
    theme: OSTheme;
}

export async function exportSystemData(
    mode: 'text_only' | 'media_only' | 'full',
    state: ExportStateSnapshot,
    onProgress: (message: string, progress: number) => void
): Promise<Blob> {
    onProgress('正在初始化打包引擎...', 0);

    const JSZip = await loadJSZip();
    const zip = new JSZip();
    const assetsFolder = zip.folder("assets");
    const assetCounter = { count: 0 };

    const processObject = (obj: any) => processObjectForZip(obj, assetsFolder, assetCounter);

    const storesToProcess = getStoresToProcess(mode);

    // Fetch Social App & Room Assets
    const sparkUserBg = await DB.getAsset('spark_user_bg');
    const sparkSocialProfile = await DB.getAsset('spark_social_profile');
    const roomCustomAssets = await DB.getAsset('room_custom_assets_list');

    const backupData: Partial<FullBackupData> = {
        timestamp: Date.now(),
        version: 2,
        apiConfig: (mode === 'text_only' || mode === 'full') ? state.apiConfig : undefined,
        apiPresets: (mode === 'text_only' || mode === 'full') ? state.apiPresets : undefined,
        availableModels: (mode === 'text_only' || mode === 'full') ? state.availableModels : undefined,
        realtimeConfig: (mode === 'text_only' || mode === 'full') ? state.realtimeConfig : undefined,
        ttsConfig: (mode === 'text_only' || mode === 'full') ? state.ttsConfig : undefined,
        sttConfig: (mode === 'text_only' || mode === 'full') ? state.sttConfig : undefined,
        theme: state.theme,

        socialAppData: (mode === 'text_only' || mode === 'media_only' || mode === 'full') ? {
            charHandles: JSON.parse(localStorage.getItem('spark_char_handles') || '{}'),
            userProfile: sparkSocialProfile ? JSON.parse(sparkSocialProfile) : undefined,
            userId: localStorage.getItem('spark_user_id') || undefined,
            userBg: sparkUserBg || undefined
        } : undefined,

        roomCustomAssets: (mode === 'text_only' || mode === 'media_only' || mode === 'full') ? (roomCustomAssets ? JSON.parse(roomCustomAssets) : []) : undefined,
        mediaAssets: [],
    };

    const totalSteps = storesToProcess.length + 3;
    let currentStep = 0;

    // Pre-process specialized image fields
    if (mode !== 'text_only') {
        if (backupData.socialAppData?.userProfile) backupData.socialAppData.userProfile = processObject(backupData.socialAppData.userProfile);
        if (backupData.socialAppData?.userBg) backupData.socialAppData.userBg = processObject(backupData.socialAppData.userBg);
        if (backupData.roomCustomAssets) backupData.roomCustomAssets = processObject(backupData.roomCustomAssets);
        if (backupData.theme) backupData.theme = processObject(backupData.theme);
    } else {
        if (backupData.socialAppData?.userProfile) backupData.socialAppData.userProfile = stripBase64(backupData.socialAppData.userProfile);
        if (backupData.socialAppData?.userBg) backupData.socialAppData.userBg = stripBase64(backupData.socialAppData.userBg);
        if (backupData.roomCustomAssets) backupData.roomCustomAssets = stripBase64(backupData.roomCustomAssets);
        if (backupData.theme) {
            const savedPresetDecos = backupData.theme.desktopDecorations
                ?.filter(d => d.type === 'preset')
                .map(d => ({ id: d.id, content: d.content }));
            backupData.theme = stripBase64(backupData.theme);
            if (backupData.theme!.desktopDecorations && savedPresetDecos) {
                backupData.theme!.desktopDecorations = backupData.theme!.desktopDecorations
                    .map((d: any) => {
                        const saved = savedPresetDecos.find(p => p.id === d.id);
                        return saved ? { ...d, content: saved.content } : d;
                    })
                    .filter((d: any) => d.content && d.content !== '');
            }
        }
    }

    for (const storeName of storesToProcess) {
        currentStep++;
        onProgress(`正在打包: ${storeName} ...`, (currentStep / totalSteps) * 100);

        let rawData = await DB.getRawStoreData(storeName);
        let processedData: any;

        if (mode === 'text_only') {
            processedData = stripBase64(rawData);
        } else {
            if (storeName === 'messages' && mode === 'media_only') {
                rawData = rawData.filter((m: Message) => m.type === 'image' || m.type === 'emoji');
            }

            if (storeName === 'characters' && mode === 'media_only') {
                const mediaList = rawData.map((c: CharacterProfile) => {
                    const extracted = {
                        charId: c.id,
                        avatar: c.avatar,
                        sprites: c.sprites,
                        roomItems: c.roomConfig?.items?.reduce((acc: any, item: any) => {
                            if (item.image && item.image.startsWith('data:')) {
                                acc[item.id] = item.image;
                            }
                            return acc;
                        }, {}),
                        backgrounds: {
                            chat: c.chatBackground,
                            date: c.dateBackground,
                            roomWall: c.roomConfig?.wallImage,
                            roomFloor: c.roomConfig?.floorImage
                        }
                    };
                    return processObject(extracted);
                });
                backupData.mediaAssets = mediaList;
                continue;
            }

            processedData = processObject(rawData);
        }

        // Assign to Backup Data
        switch (storeName) {
            case 'characters': if (mode !== 'media_only') backupData.characters = processedData; break;
            case 'messages': backupData.messages = processedData; break;
            case 'themes': backupData.customThemes = processedData; break;
            case 'emojis': backupData.savedEmojis = processedData; break;
            case 'assets': backupData.assets = processedData; break;
            case 'gallery': backupData.galleryImages = processedData; break;
            case 'user_profile': if (processedData[0]) backupData.userProfile = processedData[0]; break;
            case 'diaries': backupData.diaries = processedData; break;
            case 'tasks': backupData.tasks = processedData; break;
            case 'anniversaries': backupData.anniversaries = processedData; break;
            case 'room_todos': backupData.roomTodos = processedData; break;
            case 'room_notes': backupData.roomNotes = processedData; break;
            case 'groups': backupData.groups = processedData; break;
            case 'journal_stickers': backupData.savedJournalStickers = processedData; break;
            case 'social_posts': backupData.socialPosts = processedData; break;
            case 'courses': backupData.courses = processedData; break;
            case 'games': backupData.games = processedData; break;
            case 'worldbooks': backupData.worldbooks = processedData; break;
            case 'novels': backupData.novels = processedData; break;
            case 'bank_transactions': backupData.bankTransactions = processedData; break;
            case 'bank_data': {
                if (Array.isArray(processedData)) {
                    const mainState = processedData.find((d: any) => d.id === 'main_state');
                    const dollhouseRecord = processedData.find((d: any) => d.id === 'dollhouse_state');
                    backupData.bankState = mainState ? { ...mainState, id: undefined } : undefined;
                    backupData.bankDollhouse = dollhouseRecord?.data || undefined;
                }
                break;
            }
            case 'xhs_activities': backupData.xhsActivities = processedData; break;
            case 'xhs_stock': backupData.xhsStockImages = processedData; break;
            case 'emoji_categories': backupData.emojiCategories = processedData; break;
            case 'vector_memories': backupData.vectorMemories = processedData; break;
        }

        await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Collect extra localStorage config keys
    const extraConfig: Record<string, string> = {};
    for (const key of EXTRA_LS_KEYS) {
        const val = localStorage.getItem(key);
        if (val !== null) extraConfig[key] = val;
    }
    if (Object.keys(extraConfig).length > 0) {
        backupData.extraLocalStorageConfig = extraConfig;
    }

    onProgress('正在生成压缩包...', 95);

    zip.file("data.json", JSON.stringify(backupData));

    const content = await zip.generateAsync({ type: "blob" }, (metadata) => {
        if (Math.random() > 0.8) {
            onProgress(`压缩中 ${metadata.percent.toFixed(0)}%...`, 95);
        }
    });

    return content;
}

// ─── Import Pipeline ────────────────────────────────────────────────────

export interface ImportCallbacks {
    updateTheme: (updates: Partial<OSTheme>) => void;
    updateApiConfig: (updates: Partial<APIConfig>) => void;
    saveModels: (models: string[]) => void;
    savePresets: (presets: ApiPreset[]) => void;
    updateRealtimeConfig: (updates: Partial<RealtimeConfig>) => void;
    setCharacters: (chars: CharacterProfile[]) => void;
    setGroups: (groups: GroupProfile[]) => void;
    setCustomThemes: (themes: ChatTheme[]) => void;
    setUserProfile: (profile: UserProfile) => void;
    setWorldbooks: (books: Worldbook[]) => void;
    setNovels: (novels: NovelBook[]) => void;
    setCustomIcons: (icons: Record<string, string>) => void;
    addToast: (message: string, type: 'info' | 'success' | 'error') => void;
}

export async function importSystemData(
    fileOrJson: File | string,
    onProgress: (message: string, progress: number) => void,
    callbacks: ImportCallbacks
): Promise<void> {
    onProgress('正在解析备份文件...', 0);
    let data: FullBackupData;
    let zip: JSZipLike | null = null;

    if (typeof fileOrJson === 'string') {
        data = JSON.parse(fileOrJson);
    } else {
        if (!fileOrJson.name.endsWith('.zip')) {
            try {
                const text = await fileOrJson.text();
                data = JSON.parse(text);
            } catch (e) {
                throw new Error("无效的文件格式，请上传 .zip 或 .json");
            }
        } else {
            const JSZip = await loadJSZip();
            const loadedZip = await JSZip.loadAsync(fileOrJson);
            zip = loadedZip;
            const dataFile = loadedZip.file("data.json");
            if (!dataFile) throw new Error("损坏的备份包: 缺少 data.json");
            const jsonStr = await dataFile.async("string");
            data = JSON.parse(jsonStr);
        }
    }

    onProgress('正在恢复数据与素材...', 50);

    if (zip) {
        data = await restoreAssetsFromZip(data, zip);
    }

    await DB.importFullData(data);

    // ── Write config to localStorage directly (NO React setState!) ──────
    // All DB data is already written by importFullData above.
    // After reload, initData() will read everything from DB.
    // We only need localStorage writes for settings that are loaded from localStorage on boot.
    // Triggering React setState here would cause cross-version import crashes
    // (insertBefore error) because the UI re-renders with potentially incompatible data
    // right before reload.

    if (data.theme) {
        const cleanTheme = { ...data.theme } as any;
        if (cleanTheme.wallpaper && cleanTheme.wallpaper.startsWith('data:')) { delete cleanTheme.wallpaper; }
        if (cleanTheme.launcherWidgetImage && cleanTheme.launcherWidgetImage.startsWith('data:')) { delete cleanTheme.launcherWidgetImage; }
        if (cleanTheme.launcherWidgets) {
            const cw = { ...cleanTheme.launcherWidgets };
            for (const k of Object.keys(cw)) { if (cw[k]?.startsWith('data:')) delete cw[k]; }
            cleanTheme.launcherWidgets = Object.keys(cw).length > 0 ? cw : undefined;
        }
        if (cleanTheme.customFont && cleanTheme.customFont.startsWith('data:')) { delete cleanTheme.customFont; }
        if (cleanTheme.desktopDecorations) {
            cleanTheme.desktopDecorations = cleanTheme.desktopDecorations.map((d: any) => ({
                ...d,
                content: (d.content && d.content.startsWith('data:') && d.type === 'image') ? '' : d.content
            }));
        }
        localStorage.setItem('os_theme', JSON.stringify(cleanTheme));
    }
    if (data.apiConfig) localStorage.setItem('os_api_config', JSON.stringify(data.apiConfig));
    if (data.availableModels) localStorage.setItem('os_available_models', JSON.stringify(data.availableModels));
    if (data.apiPresets) localStorage.setItem('os_api_presets', JSON.stringify(data.apiPresets));
    if (data.realtimeConfig) localStorage.setItem('os_realtime_config', JSON.stringify(data.realtimeConfig));
    if (data.ttsConfig) localStorage.setItem('os_tts_config', JSON.stringify(data.ttsConfig));
    if (data.sttConfig) localStorage.setItem('os_stt_config', JSON.stringify(data.sttConfig));

    if (data.socialAppData) {
        if (data.socialAppData.charHandles) localStorage.setItem('spark_char_handles', JSON.stringify(data.socialAppData.charHandles));
        if (data.socialAppData.userId) localStorage.setItem('spark_user_id', data.socialAppData.userId);
        if (data.socialAppData.userProfile) await DB.saveAsset('spark_social_profile', JSON.stringify(data.socialAppData.userProfile));
        if (data.socialAppData.userBg) await DB.saveAsset('spark_user_bg', data.socialAppData.userBg);
    }

    if (data.roomCustomAssets) {
        await DB.saveAsset('room_custom_assets_list', JSON.stringify(data.roomCustomAssets));
    }

    // Restore extra localStorage config (sub API, embedding, backend, etc.)
    if (data.extraLocalStorageConfig) {
        for (const [key, value] of Object.entries(data.extraLocalStorageConfig)) {
            localStorage.setItem(key, value);
        }
    }

    callbacks.addToast('恢复成功，系统即将重启...', 'success');
    setTimeout(() => window.location.reload(), 1500);
}
