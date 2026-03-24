
import { DB } from './db';
import { LocalNotifications } from '@capacitor/local-notifications';

// ═══════════════════════════════════════════════════════════════════════
//  Bilingual Marker — single source of truth for the %%BILINGUAL%% system
// ═══════════════════════════════════════════════════════════════════════

/** Canonical marker written into new messages (no spaces) */
export const BILINGUAL_MARKER = '%%BILINGUAL%%';

/**
 * Regex that matches BOTH old format `%% BILINGUAL %%` (with spaces)
 * and new format `%%BILINGUAL%%` (no spaces) for backward compatibility.
 * Use with `gi` flags for global/case-insensitive matching.
 */
export const BILINGUAL_RE = /%%\s*BILINGUAL\s*%%/gi;

/**
 * Parse a content string that may contain a %%BILINGUAL%% marker.
 * Returns { hasBilingual, langA, langB }
 *   - langA = original text (before marker)
 *   - langB = translated text (after marker), empty string if no marker
 *
 * @param raw  The raw message content
 * @param clean  Optional cleanup function to apply to each half (e.g. stripJunk)
 */
export function parseBilingual(
    raw: string,
    clean?: (s: string) => string,
): { hasBilingual: boolean; langA: string; langB: string } {
    const match = raw.match(/%%\s*BILINGUAL\s*%%/i);
    if (!match) {
        const a = clean ? clean(raw) : raw;
        return { hasBilingual: false, langA: a, langB: '' };
    }
    const idx = match.index!;
    const markerLen = match[0].length;
    const a = clean ? clean(raw.substring(0, idx)) : raw.substring(0, idx).trim();
    const b = clean ? clean(raw.substring(idx + markerLen)) : raw.substring(idx + markerLen).trim();
    return { hasBilingual: true, langA: a, langB: b };
}

export const ChatParser = {
    // Return cleaned content and perform side effects
    parseAndExecuteActions: async (
        aiContent: string,
        charId: string,
        charName: string,
        addToast: (msg: string, type: 'info' | 'success' | 'error') => void
    ) => {
        let content = aiContent;

        // POKE
        if (content.includes('[[ACTION:POKE]]')) {
            await DB.saveMessage({ charId, role: 'assistant', type: 'interaction', content: '[戳一戳]' });
            content = content.replace('[[ACTION:POKE]]', '').trim();
        }

        // TRANSFER (AI initiates a transfer to the user)
        const transferMatch = content.match(/\[\[ACTION:TRANSFER:(\d+)\]\]/);
        if (transferMatch) {
            await DB.saveMessage({ charId, role: 'assistant', type: 'transfer', content: '[转账]', metadata: { amount: transferMatch[1], status: 'pending' } });
            content = content.replace(transferMatch[0], '').trim();
        }

        // RECEIVE_TRANSFER (AI accepts a pending user transfer)
        if (content.includes('[[ACTION:RECEIVE_TRANSFER]]')) {
            try {
                const recentMsgs = await DB.getRecentMessagesByCharId(charId, 50);
                const pendingUserTransfer = recentMsgs.slice().reverse().find(
                    m => m.role === 'user' && m.type === 'transfer' && m.metadata?.status === 'pending'
                );
                if (pendingUserTransfer) {
                    await DB.updateMessageMetadata(pendingUserTransfer.id, { status: 'accepted' });
                    addToast(`${charName} 已收取 ¥${pendingUserTransfer.metadata?.amount}`, 'success');
                }
            } catch (e) { console.error('RECEIVE_TRANSFER failed:', e); }
            content = content.replace('[[ACTION:RECEIVE_TRANSFER]]', '').trim();
        }

        // RETURN_TRANSFER (AI returns/rejects a pending user transfer)
        if (content.includes('[[ACTION:RETURN_TRANSFER]]')) {
            try {
                const recentMsgs = await DB.getRecentMessagesByCharId(charId, 50);
                const pendingUserTransfer = recentMsgs.slice().reverse().find(
                    m => m.role === 'user' && m.type === 'transfer' && m.metadata?.status === 'pending'
                );
                if (pendingUserTransfer) {
                    await DB.updateMessageMetadata(pendingUserTransfer.id, { status: 'returned' });
                    addToast(`${charName} 退还了 ¥${pendingUserTransfer.metadata?.amount}`, 'info');
                }
            } catch (e) { console.error('RETURN_TRANSFER failed:', e); }
            content = content.replace('[[ACTION:RETURN_TRANSFER]]', '').trim();
        }

        // ADD_EVENT
        const eventMatch = content.match(/\[\[ACTION:ADD_EVENT\s*\|\s*(.*?)\s*\|\s*(.*?)\]\]/);
        if (eventMatch) {
            const title = eventMatch[1].trim();
            const date = eventMatch[2].trim();
            if (title && date) {
                const anni: any = { id: `anni-${Date.now()}`, title: title, date: date, charId };
                await DB.saveAnniversary(anni);
                addToast(`${charName} 添加了新日程: ${title}`, 'success');
                await DB.saveMessage({ charId, role: 'system', type: 'text', content: `[系统: ${charName} 新增了日程 "${title}" (${date})]`, metadata: { source: 'schedule', scheduleEvent: 'add_event' } });
            }
            content = content.replace(eventMatch[0], '').trim();
        }

        // SCHEDULE
        const scheduleRegex = /\[schedule_message \| (.*?) \| fixed \| (.*?)\]/g;
        let match;
        while ((match = scheduleRegex.exec(content)) !== null) {
            const timeStr = match[1].trim();
            const msgContent = match[2].trim();
            const dueTime = new Date(timeStr).getTime();
            if (!isNaN(dueTime) && dueTime > Date.now()) {
                await DB.saveScheduledMessage({ id: `sched-${Date.now()}-${Math.random()}`, charId, content: msgContent, dueAt: dueTime, createdAt: Date.now() });
                try {
                    const hasPerm = await LocalNotifications.checkPermissions();
                    if (hasPerm.display === 'granted') {
                        await LocalNotifications.schedule({ notifications: [{ title: charName, body: msgContent, id: Math.floor(Math.random() * 100000), schedule: { at: new Date(dueTime) }, smallIcon: 'ic_stat_icon_config_sample' }] });
                    }
                } catch (e) { console.log("Notification schedule skipped (web mode)"); }
                addToast(`${charName} 似乎打算一会儿找你...`, 'info');
            }
        }
        content = content.replace(scheduleRegex, '').trim();

        // RECALL tag removal (handling done in main loop logic, but cleaning here just in case)
        content = content.replace(/\[\[RECALL:.*?\]\]/g, '').trim();

        return content;
    },

    /**
     * Post-API-call cleanup for AI output.
     * Strips leaked timestamps, name prefixes, and normalises sticker tags.
     * Called after every API completion (initial + re-calls from search/diary/xhs).
     */
    cleanAiSecondPass: (text: string): string => {
        return text
            .replace(/\[\d{4}[-/年]\d{1,2}[-/月]\d{1,2}.*?\]/g, '')
            .replace(/^[\w\u4e00-\u9fa5]+:\s*/, '')
            .replace(/\[(?:你|User|用户|System)\s*发送了表情包[:：]\s*(.*?)\]/g, '[[SEND_EMOJI: $1]]');
    },

    /**
     * Comprehensive sanitizer for AI output before saving to DB.
     * Removes AI-specific artifacts that should never appear in chat bubbles.
     * Safe to call multiple times (idempotent). Preserves %%BILINGUAL%% markers.
     */
    sanitize: (text: string): string => {
        return text
            // Strip leaked timestamps from chat history context:
            // [2026-02-11 13:52] format (bracketed, from history entries)
            .replace(/\[\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\]\s*/g, '')
            // 2026-02-11 13:52 format (unbracketed, at line start)
            .replace(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s*/gm, '')
            // （下午1:52）or（上午10:30）Chinese 12h parenthetical
            .replace(/（[上下]午\d{1,2}[：:]\d{2}）/g, '')
            // (1:52 PM) or (10:30 AM) English 12h parenthetical
            .replace(/\(\d{1,2}:\d{2}\s*[AP]M\)/gi, '')
            // Strip markdown headers (# ## ### etc) → keep the text
            .replace(/^#{1,6}\s+/gm, '')
            // Strip residual action/system tags that weren't caught earlier
            .replace(/\[\[(?:ACTION|RECALL|SEARCH|DIARY|READ_DIARY|FS_DIARY|FS_READ_DIARY|DIARY_START|DIARY_END|FS_DIARY_START|FS_DIARY_END|CALL)[:\s][\s\S]*?\]\]/g, '')
            .replace(/\[schedule_message[^\]]*\]/g, '')
            .replace(/\[\[(?:QU[OA]TE|引用)[：:][\s\S]*?\]\]/g, '')
            .replace(/\[(?:QU[OA]TE|引用)[：:][^\]]*\]/g, '')
            // [回复 "content"]: format (AI mimics history context format)
            .replace(/\[回复\s*[""\u201C][^""\u201D]*?[""\u201D](?:\.{0,3})\]\s*[：:]?\s*/g, '')
            // Strip backtick-wrapped action tags and empty backtick pairs
            .replace(/`(\[\[[\s\S]*?\]\])`/g, '$1')
            .replace(/``+/g, '')
            .replace(/(^|\s)`(\s|$)/gm, '$1$2')
            // Strip markdown links → keep text only: [text](url) → text
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            // Strip all ** sequences (orphaned bold markers are common AI artifacts;
            // in chat context, losing bold formatting is acceptable for clean display)
            .replace(/\*{2,}/g, '')
            // Strip standalone separators and bullets
            .replace(/^\s*---\s*$/gm, '')
            .replace(/^\s*[-*+]\s*$/gm, '')
            // Strip legacy translation marker (but keep %%BILINGUAL%% and <翻译> XML tags)
            .replace(/%%TRANS%%[\s\S]*/gi, '')
            // Collapse excessive whitespace
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    },

    /**
     * Check if text has meaningful display content after stripping all markers/junk.
     * Used to decide whether a chunk is worth saving as a message.
     */
    hasDisplayContent: (text: string): boolean => {
        const stripped = text
            .replace(/%%\s*BILINGUAL\s*%%/gi, '')
            .replace(/%%TRANS%%[\s\S]*/gi, '')
            .replace(/<\/?翻译>|<\/?原文>|<\/?译文>/g, '')
            .replace(/^\s*---\s*$/gm, '')
            .replace(/``+/g, '')
            .replace(/(^|\s)`(\s|$)/gm, '$1$2')
            .replace(/\[\[[\s\S]*?\]\]/g, '')
            .replace(/\[(?:QU[OA]TE|引用)[：:][^\]]*\]/g, '')
            .replace(/\[回复\s*[""\u201C][^""\u201D]*?[""\u201D](?:\.{0,3})\]\s*[：:]?\s*/g, '')
            .replace(/^#{1,6}\s+/gm, '')
            .replace(/^\s*[-*+]\s*$/gm, '')
            .trim();
        return stripped.length > 0;
    },

    // Split text into bubbles (text and emojis)
    splitResponse: (content: string): { type: 'text' | 'emoji', content: string }[] => {
        const emojiPattern = /\[\[SEND_EMOJI:\s*(.*?)\]\]/g;
        const parts: { type: 'text' | 'emoji', content: string }[] = [];
        let lastIndex = 0;
        let emojiMatch;

        while ((emojiMatch = emojiPattern.exec(content)) !== null) {
            if (emojiMatch.index > lastIndex) {
                const textBefore = content.slice(lastIndex, emojiMatch.index).trim();
                if (textBefore) parts.push({ type: 'text', content: textBefore });
            }
            parts.push({ type: 'emoji', content: emojiMatch[1].trim() });
            lastIndex = emojiMatch.index + emojiMatch[0].length;
        }

        if (lastIndex < content.length) {
            const remaining = content.slice(lastIndex).trim();
            if (remaining) parts.push({ type: 'text', content: remaining });
        }

        if (parts.length === 0 && content.trim()) parts.push({ type: 'text', content: content.trim() });
        return parts;
    },

    // Chunking text for typing effect - splits into separate chat bubbles
    // Primary: split on line breaks (AI decides where to break)
    // Fallback: if no line breaks and text is long, split on spaces between CJK characters
    //   (Chinese text normally has no spaces, so "汉字 汉字" means the AI intended a line break)
    chunkText: (text: string): string[] => {
        // Try line breaks first
        let chunks = text.split(/(?:\r\n|\r|\n|\u2028|\u2029)+/)
            .map(c => c.trim())
            .filter(c => c.length > 0);

        // Fallback: no line breaks found and text is long enough
        // Split on spaces that sit between CJK characters/punctuation (中文里不该有空格)
        if (chunks.length <= 1 && text.trim().length > 50) {
            // Match a CJK char/punct, then space(s), then CJK char
            // Split AFTER the first CJK char + space boundary using lookbehind/lookahead
            chunks = text.split(/(?<=[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef\u2000-\u206f\u2e80-\u2eff\u3001-\u3003\u2018-\u201f\u300a-\u300f\uff01-\uff0f\uff1a-\uff20])\s+(?=[\u4e00-\u9fff\u3400-\u4dbf])/)
                .map(c => c.trim())
                .filter(c => c.length > 0);
        }

        return chunks;
    }
}
