import { ChatTheme, Emoji, EmojiCategory, UserProfile, GalleryImage, XhsStockImage, XhsActivityRecord } from '../../types';
import {
    openDB, STORE_THEMES, STORE_EMOJIS, STORE_EMOJI_CATEGORIES, STORE_ASSETS,
    STORE_USER, STORE_GALLERY, STORE_JOURNAL_STICKERS,
    STORE_XHS_STOCK, STORE_XHS_ACTIVITIES, STORE_VOICE_AUDIO,
    SULLY_CATEGORY_ID, SULLY_PRESET_EMOJIS
} from './core';

// --- Themes ---
export const getThemes = async (): Promise<ChatTheme[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const request = db.transaction(STORE_THEMES, 'readonly').objectStore(STORE_THEMES).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
};
export const saveTheme = async (theme: ChatTheme): Promise<void> => { const db = await openDB(); db.transaction(STORE_THEMES, 'readwrite').objectStore(STORE_THEMES).put(theme); };
export const deleteTheme = async (id: string): Promise<void> => { const db = await openDB(); db.transaction(STORE_THEMES, 'readwrite').objectStore(STORE_THEMES).delete(id); };

// --- Assets ---
export const getAllAssets = async (): Promise<{ id: string, data: string }[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const request = db.transaction(STORE_ASSETS, 'readonly').objectStore(STORE_ASSETS).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
};
export const getAsset = async (id: string): Promise<string | null> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const request = db.transaction(STORE_ASSETS, 'readonly').objectStore(STORE_ASSETS).get(id);
        request.onsuccess = () => resolve(request.result?.data || null);
        request.onerror = () => reject(request.error);
    });
};
export const saveAsset = async (id: string, data: string): Promise<void> => { const db = await openDB(); db.transaction(STORE_ASSETS, 'readwrite').objectStore(STORE_ASSETS).put({ id, data }); };
export const getAssetRaw = async (id: string): Promise<any | null> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const request = db.transaction(STORE_ASSETS, 'readonly').objectStore(STORE_ASSETS).get(id);
        request.onsuccess = () => resolve(request.result?.data ?? null);
        request.onerror = () => reject(request.error);
    });
};
export const saveAssetRaw = async (id: string, data: any): Promise<void> => { const db = await openDB(); db.transaction(STORE_ASSETS, 'readwrite').objectStore(STORE_ASSETS).put({ id, data }); };
export const deleteAsset = async (id: string): Promise<void> => { const db = await openDB(); db.transaction(STORE_ASSETS, 'readwrite').objectStore(STORE_ASSETS).delete(id); };

// --- Emojis ---
export const getEmojis = async (): Promise<Emoji[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const request = db.transaction(STORE_EMOJIS, 'readonly').objectStore(STORE_EMOJIS).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
};
export const saveEmoji = async (name: string, url: string, categoryId?: string): Promise<void> => { const db = await openDB(); db.transaction(STORE_EMOJIS, 'readwrite').objectStore(STORE_EMOJIS).put({ name, url, categoryId }); };
export const deleteEmoji = async (name: string): Promise<void> => { const db = await openDB(); db.transaction(STORE_EMOJIS, 'readwrite').objectStore(STORE_EMOJIS).delete(name); };

export const getEmojiCategories = async (): Promise<EmojiCategory[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(STORE_EMOJI_CATEGORIES)) { resolve([]); return; }
        const request = db.transaction(STORE_EMOJI_CATEGORIES, 'readonly').objectStore(STORE_EMOJI_CATEGORIES).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
};
export const saveEmojiCategory = async (category: EmojiCategory): Promise<void> => { const db = await openDB(); db.transaction(STORE_EMOJI_CATEGORIES, 'readwrite').objectStore(STORE_EMOJI_CATEGORIES).put(category); };
export const deleteEmojiCategory = async (id: string): Promise<void> => {
    const db = await openDB();
    const tx = db.transaction([STORE_EMOJI_CATEGORIES, STORE_EMOJIS], 'readwrite');
    tx.objectStore(STORE_EMOJI_CATEGORIES).delete(id);
    const emojiStore = tx.objectStore(STORE_EMOJIS);
    const request = emojiStore.getAll();
    request.onsuccess = () => {
        const allEmojis = request.result as Emoji[];
        allEmojis.forEach(e => { if (e.categoryId === id) emojiStore.delete(e.name); });
    };
    return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
};

export const initializeEmojiData = async (): Promise<void> => {
    const cats = await getEmojiCategories();
    if (!cats.some(c => c.id === 'default')) {
        await saveEmojiCategory({ id: 'default', name: '默认', isSystem: true });
    }
    if (!cats.some(c => c.id === SULLY_CATEGORY_ID)) {
        await saveEmojiCategory({ id: SULLY_CATEGORY_ID, name: 'Sully 专属', isSystem: true });
        const db = await openDB();
        const tx = db.transaction(STORE_EMOJIS, 'readwrite');
        const store = tx.objectStore(STORE_EMOJIS);
        SULLY_PRESET_EMOJIS.forEach(emoji => store.put(emoji));
        await new Promise(resolve => { tx.oncomplete = resolve; });
    }
};

// --- Journal Stickers ---
export const getJournalStickers = async (): Promise<{ name: string, url: string }[]> => {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_JOURNAL_STICKERS)) return [];
    return new Promise((resolve, reject) => {
        const request = db.transaction(STORE_JOURNAL_STICKERS, 'readonly').objectStore(STORE_JOURNAL_STICKERS).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
};
export const saveJournalSticker = async (name: string, url: string): Promise<void> => { const db = await openDB(); db.transaction(STORE_JOURNAL_STICKERS, 'readwrite').objectStore(STORE_JOURNAL_STICKERS).put({ name, url }); };
export const deleteJournalSticker = async (name: string): Promise<void> => { const db = await openDB(); db.transaction(STORE_JOURNAL_STICKERS, 'readwrite').objectStore(STORE_JOURNAL_STICKERS).delete(name); };

// --- User Profile ---
export const saveUserProfile = async (profile: UserProfile): Promise<void> => { const db = await openDB(); db.transaction(STORE_USER, 'readwrite').objectStore(STORE_USER).put({ ...profile, id: 'me' }); };
export const getUserProfile = async (): Promise<UserProfile | null> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const request = db.transaction(STORE_USER, 'readonly').objectStore(STORE_USER).get('me');
        request.onsuccess = () => {
            if (request.result) { const { id, ...profile } = request.result; resolve(profile as UserProfile); }
            else resolve(null);
        };
        request.onerror = () => reject(request.error);
    });
};

// --- Gallery ---
export const saveGalleryImage = async (img: GalleryImage): Promise<void> => { const db = await openDB(); db.transaction(STORE_GALLERY, 'readwrite').objectStore(STORE_GALLERY).put(img); };
export const getGalleryImages = async (charId?: string): Promise<GalleryImage[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const store = db.transaction(STORE_GALLERY, 'readonly').objectStore(STORE_GALLERY);
        const request = charId ? store.index('charId').getAll(IDBKeyRange.only(charId)) : store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
};
export const updateGalleryImageReview = async (id: string, review: string): Promise<void> => {
    const db = await openDB();
    const store = db.transaction(STORE_GALLERY, 'readwrite').objectStore(STORE_GALLERY);
    return new Promise((resolve, reject) => {
        const req = store.get(id);
        req.onsuccess = () => {
            const data = req.result as GalleryImage;
            if (data) { data.review = review; data.reviewTimestamp = Date.now(); store.put(data); resolve(); }
            else reject(new Error('Image not found'));
        };
        req.onerror = () => reject(req.error);
    });
};
export const deleteGalleryImage = async (id: string): Promise<void> => { const db = await openDB(); db.transaction(STORE_GALLERY, 'readwrite').objectStore(STORE_GALLERY).delete(id); };

// --- XHS Stock Images ---
export const getXhsStockImages = async (): Promise<XhsStockImage[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const request = db.transaction(STORE_XHS_STOCK, 'readonly').objectStore(STORE_XHS_STOCK).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
};
export const saveXhsStockImage = async (img: XhsStockImage): Promise<void> => { const db = await openDB(); db.transaction(STORE_XHS_STOCK, 'readwrite').objectStore(STORE_XHS_STOCK).put(img); };
export const deleteXhsStockImage = async (id: string): Promise<void> => { const db = await openDB(); db.transaction(STORE_XHS_STOCK, 'readwrite').objectStore(STORE_XHS_STOCK).delete(id); };
export const updateXhsStockImageUsage = async (id: string): Promise<void> => {
    const db = await openDB();
    const store = db.transaction(STORE_XHS_STOCK, 'readwrite').objectStore(STORE_XHS_STOCK);
    return new Promise((resolve, reject) => {
        const req = store.get(id);
        req.onsuccess = () => {
            const data = req.result as XhsStockImage;
            if (data) { data.usedCount = (data.usedCount || 0) + 1; data.lastUsedAt = Date.now(); store.put(data); resolve(); }
            else reject(new Error('Stock image not found'));
        };
        req.onerror = () => reject(req.error);
    });
};

// --- XHS Activities ---
export const saveXhsActivity = async (activity: XhsActivityRecord): Promise<void> => { const db = await openDB(); db.transaction(STORE_XHS_ACTIVITIES, 'readwrite').objectStore(STORE_XHS_ACTIVITIES).put(activity); };
export const getXhsActivities = async (characterId: string, limit?: number): Promise<XhsActivityRecord[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const index = db.transaction(STORE_XHS_ACTIVITIES, 'readonly').objectStore(STORE_XHS_ACTIVITIES).index('characterId');
        const request = index.getAll(IDBKeyRange.only(characterId));
        request.onsuccess = () => {
            let results = (request.result || []) as XhsActivityRecord[];
            results.sort((a, b) => b.timestamp - a.timestamp);
            if (limit) results = results.slice(0, limit);
            resolve(results);
        };
        request.onerror = () => reject(request.error);
    });
};
export const getAllXhsActivities = async (): Promise<XhsActivityRecord[]> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const request = db.transaction(STORE_XHS_ACTIVITIES, 'readonly').objectStore(STORE_XHS_ACTIVITIES).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
};
export const deleteXhsActivity = async (id: string): Promise<void> => { const db = await openDB(); db.transaction(STORE_XHS_ACTIVITIES, 'readwrite').objectStore(STORE_XHS_ACTIVITIES).delete(id); };
export const clearXhsActivities = async (characterId: string): Promise<void> => {
    const activities = await getXhsActivities(characterId);
    const db = await openDB();
    const store = db.transaction(STORE_XHS_ACTIVITIES, 'readwrite').objectStore(STORE_XHS_ACTIVITIES);
    for (const a of activities) store.delete(a.id);
};

// --- Voice Audio ---
export const saveVoiceAudio = async (msgId: number, blob: Blob): Promise<void> => {
    const db = await openDB();
    db.transaction(STORE_VOICE_AUDIO, 'readwrite').objectStore(STORE_VOICE_AUDIO).put({ msgId, blob, createdAt: Date.now() });
};
export const getVoiceAudio = async (msgId: number): Promise<Blob | null> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const request = db.transaction(STORE_VOICE_AUDIO, 'readonly').objectStore(STORE_VOICE_AUDIO).get(msgId);
        request.onsuccess = () => resolve(request.result?.blob ?? null);
        request.onerror = () => reject(request.error);
    });
};
export const deleteVoiceAudio = async (msgId: number): Promise<void> => {
    const db = await openDB();
    db.transaction(STORE_VOICE_AUDIO, 'readwrite').objectStore(STORE_VOICE_AUDIO).delete(msgId);
};
