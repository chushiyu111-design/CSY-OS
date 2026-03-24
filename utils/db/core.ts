
import {
    CharacterProfile, ChatTheme, Message, UserProfile,
    Task, Anniversary, DiaryEntry, RoomTodo, RoomNote,
    GalleryImage, FullBackupData, GroupProfile, SocialPost, StudyCourse, GameSession, Worldbook, NovelBook, Emoji, EmojiCategory,
    BankTransaction, SavingsGoal, BankFullState, DollhouseState, XhsStockImage, XhsActivityRecord
} from '../../types';

const DB_NAME = 'AetherOS_Data';
const DB_VERSION = 38; // Bumped for Vector Memory store

export const STORE_CHARACTERS = 'characters';
export const STORE_MESSAGES = 'messages';
export const STORE_EMOJIS = 'emojis';
export const STORE_EMOJI_CATEGORIES = 'emoji_categories';
export const STORE_THEMES = 'themes';
export const STORE_ASSETS = 'assets';
export const STORE_SCHEDULED = 'scheduled_messages';
export const STORE_GALLERY = 'gallery';
export const STORE_USER = 'user_profile';
export const STORE_DIARIES = 'diaries';
export const STORE_TASKS = 'tasks';
export const STORE_ANNIVERSARIES = 'anniversaries';
export const STORE_ROOM_TODOS = 'room_todos';
export const STORE_ROOM_NOTES = 'room_notes';
export const STORE_GROUPS = 'groups';
export const STORE_JOURNAL_STICKERS = 'journal_stickers';
export const STORE_SOCIAL_POSTS = 'social_posts';
export const STORE_COURSES = 'courses';
export const STORE_GAMES = 'games';
export const STORE_WORLDBOOKS = 'worldbooks';
export const STORE_NOVELS = 'novels';
export const STORE_BANK_TX = 'bank_transactions';
export const STORE_BANK_DATA = 'bank_data';
export const STORE_XHS_STOCK = 'xhs_stock';
export const STORE_XHS_ACTIVITIES = 'xhs_activities';
export const STORE_LETTERS = 'letters';
export const STORE_VOICE_AUDIO = 'voice_audio';
export const STORE_VECTOR_MEMORIES = 'vector_memories';

export interface ScheduledMessage {
    id: string;
    charId: string;
    content: string;
    dueAt: number;
    createdAt: number;
}

// Built-in Presets
export const SULLY_CATEGORY_ID = 'cat_sully_exclusive';
export const SULLY_PRESET_EMOJIS = [
    { name: 'Sully晚安', url: 'https://sharkpan.xyz/f/pWg6HQ/night.png', categoryId: SULLY_CATEGORY_ID },
    { name: 'Sully无语', url: 'https://sharkpan.xyz/f/75wvuj/w.png', categoryId: SULLY_CATEGORY_ID },
    { name: 'Sully偷看', url: 'https://sharkpan.xyz/f/MK77Ia/see.png', categoryId: SULLY_CATEGORY_ID },
    { name: 'Sully打气', url: 'https://sharkpan.xyz/f/3WwMHe/fight.png', categoryId: SULLY_CATEGORY_ID },
    { name: 'Sully生气', url: 'https://sharkpan.xyz/f/5nwxCj/an.png', categoryId: SULLY_CATEGORY_ID },
    { name: 'Sully疑惑', url: 'https://sharkpan.xyz/f/ylWpfN/sDN.png', categoryId: SULLY_CATEGORY_ID },
    { name: 'Sully道歉', url: 'https://sharkpan.xyz/f/QdnaU6/sorry.png', categoryId: SULLY_CATEGORY_ID },
    { name: 'Sully等你消息', url: 'https://sharkpan.xyz/f/5nrJsj/wait.png', categoryId: SULLY_CATEGORY_ID },
];

export const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error("DB Open Error:", request.error);
            reject(request.error);
        };

        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;

            const createStore = (name: string, options?: IDBObjectStoreParameters) => {
                if (!db.objectStoreNames.contains(name)) {
                    db.createObjectStore(name, options);
                }
            };

            createStore(STORE_CHARACTERS, { keyPath: 'id' });

            if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
                const msgStore = db.createObjectStore(STORE_MESSAGES, { keyPath: 'id', autoIncrement: true });
                msgStore.createIndex('charId', 'charId', { unique: false });
                msgStore.createIndex('groupId', 'groupId', { unique: false });
            } else {
                const msgStore = (event.target as IDBOpenDBRequest).transaction?.objectStore(STORE_MESSAGES);
                if (msgStore && !msgStore.indexNames.contains(STORE_MESSAGES) && !msgStore.indexNames.contains('groupId')) {
                    try {
                        msgStore.createIndex('groupId', 'groupId', { unique: false });
                    } catch (e) { console.log('Index already exists'); }
                }
            }

            createStore(STORE_EMOJIS, { keyPath: 'name' });
            createStore(STORE_EMOJI_CATEGORIES, { keyPath: 'id' });

            createStore(STORE_THEMES, { keyPath: 'id' });
            createStore(STORE_ASSETS, { keyPath: 'id' });

            if (!db.objectStoreNames.contains(STORE_SCHEDULED)) {
                const schedStore = db.createObjectStore(STORE_SCHEDULED, { keyPath: 'id' });
                schedStore.createIndex('charId', 'charId', { unique: false });
            }

            if (!db.objectStoreNames.contains(STORE_GALLERY)) {
                const galleryStore = db.createObjectStore(STORE_GALLERY, { keyPath: 'id' });
                galleryStore.createIndex('charId', 'charId', { unique: false });
            }

            createStore(STORE_USER, { keyPath: 'id' });

            if (!db.objectStoreNames.contains(STORE_DIARIES)) {
                const diaryStore = db.createObjectStore(STORE_DIARIES, { keyPath: 'id' });
                diaryStore.createIndex('charId', 'charId', { unique: false });
            }

            createStore(STORE_TASKS, { keyPath: 'id' });
            createStore(STORE_ANNIVERSARIES, { keyPath: 'id' });

            if (!db.objectStoreNames.contains(STORE_ROOM_TODOS)) {
                db.createObjectStore(STORE_ROOM_TODOS, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(STORE_ROOM_NOTES)) {
                const notesStore = db.createObjectStore(STORE_ROOM_NOTES, { keyPath: 'id' });
                notesStore.createIndex('charId', 'charId', { unique: false });
            }

            createStore(STORE_GROUPS, { keyPath: 'id' });
            createStore(STORE_JOURNAL_STICKERS, { keyPath: 'name' });
            createStore(STORE_SOCIAL_POSTS, { keyPath: 'id' });
            createStore(STORE_COURSES, { keyPath: 'id' });
            createStore(STORE_GAMES, { keyPath: 'id' });
            createStore(STORE_WORLDBOOKS, { keyPath: 'id' });
            createStore(STORE_NOVELS, { keyPath: 'id' });

            createStore(STORE_BANK_TX, { keyPath: 'id' });
            createStore(STORE_BANK_DATA, { keyPath: 'id' });
            createStore(STORE_XHS_STOCK, { keyPath: 'id' });

            if (!db.objectStoreNames.contains(STORE_XHS_ACTIVITIES)) {
                const xhsActStore = db.createObjectStore(STORE_XHS_ACTIVITIES, { keyPath: 'id' });
                xhsActStore.createIndex('characterId', 'characterId', { unique: false });
            }

            if (!db.objectStoreNames.contains(STORE_LETTERS)) {
                const letterStore = db.createObjectStore(STORE_LETTERS, { keyPath: 'id' });
                letterStore.createIndex('charId', 'charId', { unique: false });
            }

            createStore(STORE_VOICE_AUDIO, { keyPath: 'msgId' });

            // Vector Memory store with charId index for per-character queries
            if (!db.objectStoreNames.contains(STORE_VECTOR_MEMORIES)) {
                const vmStore = db.createObjectStore(STORE_VECTOR_MEMORIES, { keyPath: 'id' });
                vmStore.createIndex('charId', 'charId', { unique: false });
            }
        };
    });
};

export const DB_NAME_CONST = DB_NAME;
