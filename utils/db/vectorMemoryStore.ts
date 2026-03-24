/**
 * Vector Memory IndexedDB Store
 * CRUD operations for the vector_memories object store.
 */

import { VectorMemory } from '../../types';
import { openDB, STORE_VECTOR_MEMORIES } from './core';

/**
 * Get all vector memories for a character (includes full vectors).
 */
export const getAllVectorMemories = async (charId: string): Promise<VectorMemory[]> => {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_VECTOR_MEMORIES)) return [];
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_VECTOR_MEMORIES, 'readonly');
        const store = tx.objectStore(STORE_VECTOR_MEMORIES);
        const index = store.index('charId');
        const request = index.getAll(charId);
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
};

/**
 * Get lightweight headers (no vector data) for extraction prompt building & keyword pre-filtering.
 * Uses cursor to avoid loading the full vector arrays into memory.
 */
export const getVectorMemoryHeaders = async (charId: string): Promise<{ id: string; title: string; content: string; emotionalJourney?: string; importance: number; createdAt: number; deprecated?: boolean; salienceScore?: number }[]> => {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_VECTOR_MEMORIES)) return [];
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_VECTOR_MEMORIES, 'readonly');
        const index = tx.objectStore(STORE_VECTOR_MEMORIES).index('charId');
        const request = index.openCursor(charId);
        const headers: { id: string; title: string; content: string; emotionalJourney?: string; importance: number; createdAt: number; deprecated?: boolean; salienceScore?: number }[] = [];
        request.onsuccess = () => {
            const cursor = request.result;
            if (cursor) {
                const v = cursor.value;
                headers.push({ id: v.id, title: v.title, content: v.content, emotionalJourney: v.emotionalJourney, importance: v.importance, createdAt: v.createdAt, deprecated: v.deprecated, salienceScore: v.salienceScore });
                cursor.continue();
            } else {
                resolve(headers);
            }
        };
        request.onerror = () => reject(request.error);
    });
};

/**
 * Get specific vector memories by IDs (includes full vectors).
 * Used by hybrid retrieval to selectively load only candidate memories.
 */
export const getVectorMemoriesByIds = async (ids: string[]): Promise<VectorMemory[]> => {
    if (ids.length === 0) return [];
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_VECTOR_MEMORIES)) return [];
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_VECTOR_MEMORIES, 'readonly');
        const store = tx.objectStore(STORE_VECTOR_MEMORIES);
        const results: VectorMemory[] = [];
        for (const id of ids) {
            const req = store.get(id);
            req.onsuccess = () => { if (req.result) results.push(req.result); };
        }
        tx.oncomplete = () => resolve(results);
        tx.onerror = () => reject(tx.error);
    });
};

/**
 * Get a single vector memory by ID (includes full vector).
 */
export const getVectorMemoryById = async (id: string): Promise<VectorMemory | null> => {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_VECTOR_MEMORIES)) return null;
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_VECTOR_MEMORIES, 'readonly');
        const req = tx.objectStore(STORE_VECTOR_MEMORIES).get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
};

/**
 * Save or update a vector memory (upsert by id).
 */
export const saveVectorMemory = async (vmem: VectorMemory): Promise<void> => {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_VECTOR_MEMORIES)) return;
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_VECTOR_MEMORIES, 'readwrite');
        tx.objectStore(STORE_VECTOR_MEMORIES).put(vmem);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

/**
 * Delete a single vector memory by id.
 */
export const deleteVectorMemory = async (id: string): Promise<void> => {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_VECTOR_MEMORIES)) return;
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_VECTOR_MEMORIES, 'readwrite');
        tx.objectStore(STORE_VECTOR_MEMORIES).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

/**
 * Clear all vector memories for a character.
 */
export const clearVectorMemories = async (charId: string): Promise<void> => {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_VECTOR_MEMORIES)) return;
    const all = await getAllVectorMemories(charId);
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_VECTOR_MEMORIES, 'readwrite');
        const store = tx.objectStore(STORE_VECTOR_MEMORIES);
        all.forEach(m => store.delete(m.id));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

/**
 * Count vector memories for a character.
 */
export const countVectorMemories = async (charId: string): Promise<number> => {
    const db = await openDB();
    if (!db.objectStoreNames.contains(STORE_VECTOR_MEMORIES)) return 0;
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_VECTOR_MEMORIES, 'readonly');
        const index = tx.objectStore(STORE_VECTOR_MEMORIES).index('charId');
        const request = index.count(charId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};
