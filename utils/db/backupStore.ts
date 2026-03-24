import { CharacterProfile, FullBackupData } from '../../types';
import {
    openDB, STORE_CHARACTERS, STORE_MESSAGES, STORE_THEMES, STORE_EMOJIS,
    STORE_EMOJI_CATEGORIES, STORE_ASSETS, STORE_GALLERY, STORE_USER,
    STORE_DIARIES, STORE_TASKS, STORE_ANNIVERSARIES, STORE_ROOM_TODOS,
    STORE_ROOM_NOTES, STORE_GROUPS, STORE_JOURNAL_STICKERS, STORE_SOCIAL_POSTS,
    STORE_COURSES, STORE_GAMES, STORE_WORLDBOOKS, STORE_NOVELS,
    STORE_BANK_TX, STORE_BANK_DATA, STORE_XHS_ACTIVITIES, STORE_XHS_STOCK,
    STORE_VECTOR_MEMORIES,
    DB_NAME_CONST
} from './core';

export const deleteDB = async (): Promise<void> => {
    return new Promise((resolve, reject) => {
        const req = indexedDB.deleteDatabase(DB_NAME_CONST);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        req.onblocked = () => console.warn('Delete blocked');
    });
};

export const getRawStoreData = async (storeName: string): Promise<any[]> => {
    const db = await openDB();
    if (!db.objectStoreNames.contains(storeName)) return [];
    return new Promise((resolve, reject) => {
        const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
};

export const exportFullData = async (): Promise<Partial<FullBackupData>> => {
    const db = await openDB();

    const getAllFromStore = (storeName: string): Promise<any[]> => {
        if (!db.objectStoreNames.contains(storeName)) return Promise.resolve([]);
        return new Promise((resolve) => {
            const req = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });
    };

    const [characters, messages, themes, emojis, emojiCategories, assets, galleryImages, userProfiles, diaries, tasks, anniversaries, roomTodos, roomNotes, groups, journalStickers, socialPosts, courses, games, worldbooks, novels, bankTx, bankData, xhsActivities, xhsStockImages, vectorMemories] = await Promise.all([
        getAllFromStore(STORE_CHARACTERS), getAllFromStore(STORE_MESSAGES),
        getAllFromStore(STORE_THEMES), getAllFromStore(STORE_EMOJIS),
        getAllFromStore(STORE_EMOJI_CATEGORIES), getAllFromStore(STORE_ASSETS),
        getAllFromStore(STORE_GALLERY), getAllFromStore(STORE_USER),
        getAllFromStore(STORE_DIARIES), getAllFromStore(STORE_TASKS),
        getAllFromStore(STORE_ANNIVERSARIES), getAllFromStore(STORE_ROOM_TODOS),
        getAllFromStore(STORE_ROOM_NOTES), getAllFromStore(STORE_GROUPS),
        getAllFromStore(STORE_JOURNAL_STICKERS), getAllFromStore(STORE_SOCIAL_POSTS),
        getAllFromStore(STORE_COURSES), getAllFromStore(STORE_GAMES),
        getAllFromStore(STORE_WORLDBOOKS), getAllFromStore(STORE_NOVELS),
        getAllFromStore(STORE_BANK_TX), getAllFromStore(STORE_BANK_DATA),
        getAllFromStore(STORE_XHS_ACTIVITIES), getAllFromStore(STORE_XHS_STOCK),
        getAllFromStore(STORE_VECTOR_MEMORIES),
    ]);

    const userProfile = userProfiles.length > 0 ? { name: userProfiles[0].name, avatar: userProfiles[0].avatar, bio: userProfiles[0].bio } : undefined;
    const mainState = bankData.find((d: any) => d.id === 'main_state');
    const dollhouseRecord = bankData.find((d: any) => d.id === 'dollhouse_state');

    return {
        characters, messages, customThemes: themes, savedEmojis: emojis, emojiCategories, assets, galleryImages, userProfile, diaries, tasks, anniversaries, roomTodos, roomNotes, groups, savedJournalStickers: journalStickers, socialPosts, courses, games, worldbooks, novels,
        bankState: mainState ? { ...mainState, id: undefined } : undefined,
        bankDollhouse: dollhouseRecord?.data || undefined,
        bankTransactions: bankTx,
        xhsActivities, xhsStockImages,
        vectorMemories
    };
};

export const importFullData = async (data: FullBackupData): Promise<void> => {
    const db = await openDB();

    const availableStores = [
        STORE_CHARACTERS, STORE_MESSAGES, STORE_THEMES, STORE_EMOJIS, STORE_EMOJI_CATEGORIES,
        STORE_ASSETS, STORE_GALLERY, STORE_USER, STORE_DIARIES,
        STORE_TASKS, STORE_ANNIVERSARIES, STORE_ROOM_TODOS, STORE_ROOM_NOTES,
        STORE_GROUPS, STORE_JOURNAL_STICKERS, STORE_SOCIAL_POSTS, STORE_COURSES, STORE_GAMES, STORE_WORLDBOOKS, STORE_NOVELS,
        STORE_BANK_TX, STORE_BANK_DATA,
        STORE_XHS_ACTIVITIES, STORE_XHS_STOCK,
        STORE_VECTOR_MEMORIES
    ].filter(name => db.objectStoreNames.contains(name));

    const tx = db.transaction(availableStores, 'readwrite');

    const clearAndAdd = (storeName: string, items: any[]) => {
        if (!availableStores.includes(storeName) || !items || items.length === 0) return;
        const store = tx.objectStore(storeName);
        store.clear();
        items.forEach(item => store.put(item));
    };

    const mergeStore = (storeName: string, items: any[]) => {
        if (!availableStores.includes(storeName) || !items || items.length === 0) return;
        items.forEach(item => tx.objectStore(storeName).put(item));
    };

    if (data.characters) {
        if (data.mediaAssets) {
            data.characters = data.characters.map(c => {
                const media = data.mediaAssets?.find(m => m.charId === c.id);
                if (media) {
                    return {
                        ...c,
                        avatar: media.avatar || c.avatar,
                        sprites: media.sprites || c.sprites,
                        chatBackground: media.backgrounds?.chat || c.chatBackground,
                        dateBackground: media.backgrounds?.date || c.dateBackground,
                        roomConfig: c.roomConfig ? {
                            ...c.roomConfig,
                            wallImage: media.backgrounds?.roomWall || c.roomConfig.wallImage,
                            floorImage: media.backgrounds?.roomFloor || c.roomConfig.floorImage,
                            items: c.roomConfig.items.map(item => {
                                const img = media.roomItems?.[item.id];
                                return img ? { ...item, image: img } : item;
                            })
                        } : c.roomConfig
                    } as CharacterProfile;
                }
                return c;
            });
        }
        clearAndAdd(STORE_CHARACTERS, data.characters);
    } else if (data.mediaAssets && availableStores.includes(STORE_CHARACTERS)) {
        const charStore = tx.objectStore(STORE_CHARACTERS);
        const request = charStore.getAll();
        request.onsuccess = () => {
            const existingChars = request.result as CharacterProfile[];
            if (existingChars && existingChars.length > 0) {
                const updatedChars = existingChars.map(c => {
                    const media = data.mediaAssets?.find(m => m.charId === c.id);
                    if (media) {
                        return {
                            ...c,
                            avatar: media.avatar || c.avatar,
                            sprites: media.sprites || c.sprites,
                            chatBackground: media.backgrounds?.chat || c.chatBackground,
                            dateBackground: media.backgrounds?.date || c.dateBackground,
                            roomConfig: c.roomConfig ? {
                                ...c.roomConfig,
                                wallImage: media.backgrounds?.roomWall || c.roomConfig.wallImage,
                                floorImage: media.backgrounds?.roomFloor || c.roomConfig.floorImage,
                                items: c.roomConfig.items.map(item => {
                                    const img = media.roomItems?.[item.id];
                                    return img ? { ...item, image: img } : item;
                                })
                            } : c.roomConfig
                        } as CharacterProfile;
                    }
                    return c;
                });
                updatedChars.forEach(c => charStore.put(c));
            }
        };
    }

    if (data.messages) {
        if (availableStores.includes(STORE_MESSAGES) && data.messages.length > 0) {
            const store = tx.objectStore(STORE_MESSAGES);
            if (data.characters) store.clear();
            data.messages.forEach(m => store.put(m));
        }
    }

    if (data.customThemes) mergeStore(STORE_THEMES, data.customThemes);
    if (data.savedEmojis) mergeStore(STORE_EMOJIS, data.savedEmojis);
    if (data.emojiCategories) mergeStore(STORE_EMOJI_CATEGORIES, data.emojiCategories);
    if (data.assets) mergeStore(STORE_ASSETS, data.assets);
    if (data.savedJournalStickers) mergeStore(STORE_JOURNAL_STICKERS, data.savedJournalStickers);

    if (data.galleryImages) clearAndAdd(STORE_GALLERY, data.galleryImages);
    if (data.diaries) clearAndAdd(STORE_DIARIES, data.diaries);
    if (data.tasks) clearAndAdd(STORE_TASKS, data.tasks);
    if (data.anniversaries) clearAndAdd(STORE_ANNIVERSARIES, data.anniversaries);
    if (data.roomTodos) clearAndAdd(STORE_ROOM_TODOS, data.roomTodos);
    if (data.roomNotes) clearAndAdd(STORE_ROOM_NOTES, data.roomNotes);
    if (data.groups) clearAndAdd(STORE_GROUPS, data.groups);
    if (data.socialPosts) clearAndAdd(STORE_SOCIAL_POSTS, data.socialPosts);
    if (data.courses) clearAndAdd(STORE_COURSES, data.courses);
    if (data.games) clearAndAdd(STORE_GAMES, data.games);
    if (data.worldbooks) clearAndAdd(STORE_WORLDBOOKS, data.worldbooks);
    if (data.novels) clearAndAdd(STORE_NOVELS, data.novels);
    if (data.bankTransactions) clearAndAdd(STORE_BANK_TX, data.bankTransactions);
    if (data.xhsActivities) clearAndAdd(STORE_XHS_ACTIVITIES, data.xhsActivities);
    if (data.xhsStockImages) clearAndAdd(STORE_XHS_STOCK, data.xhsStockImages);
    if (data.vectorMemories) clearAndAdd(STORE_VECTOR_MEMORIES, data.vectorMemories);

    if (data.userProfile) {
        if (availableStores.includes(STORE_USER)) {
            const store = tx.objectStore(STORE_USER);
            store.clear();
            store.put({ ...data.userProfile, id: 'me' });
        }
    }

    if (data.bankState || data.bankDollhouse) {
        if (availableStores.includes(STORE_BANK_DATA)) {
            const store = tx.objectStore(STORE_BANK_DATA);
            store.clear();
            if (data.bankState) store.put({ ...data.bankState, id: 'main_state' });
            if (data.bankDollhouse) store.put({ id: 'dollhouse_state', data: data.bankDollhouse });
        }
    }

    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};
