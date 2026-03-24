/**
 * Vector Memory Retriever — Hybrid Read Path (v2)
 * 
 * Improvements over v1:
 *   1. LLM Query Rewriting — uses Qwen3-8B (free, SiliconFlow) to distill
 *      conversational context into a focused retrieval query.
 *      Falls back to rule-based cleanup if LLM call fails/times out.
 *   2. Dynamic TOP_K — adjusts K based on top-1 similarity.
 *   3. IDF-weighted keywords — rare words (names, places) score higher.
 *   4. Tiered time window — candidates filtered by keyword strength × recency.
 *   5. Expanded temporal intent — absolute dates, frequency queries.
 * 
 * Two-stage retrieval combining Dense (vector) + Sparse (keyword) signals:
 * 
 * Stage 0 — Query Rewriting (1 lightweight LLM call, 3s timeout):
 *   Rewrite raw conversation into a focused retrieval query.
 *   Fallback: rule-based cleanup (strip RP actions, user-only).
 * 
 * Stage 1 — Keyword Pre-filter (no API call, no vectors loaded):
 *   Load lightweight headers → IDF-weighted keyword score → tiered candidate selection
 * 
 * Stage 2 — Vector Scoring (1 embedding API call, selective vector load):
 *   Embed query → load only candidate vectors → cosine similarity
 *   Combined score = cosine + IDF-keyword + importance + freshness
 * 
 * Output Filter:
 *   rawSim >= 0.35 OR kwScore >= 0.5 → allows keyword-rescued memories
 */

import { Message, VectorMemory, APIConfig, InternalState } from '../types';
import { EmbeddingService, getEmbeddingConfig, segmentWords } from './embeddingService';
import { DB } from './db';
import { parseDateExpression } from './parseDateExpression';
import { extractHormoneSnapshot, hormoneResonance as computeHormoneResonance } from './hormoneDynamics';

const QUERY_REWRITE_MODEL = 'Qwen/Qwen3-8B';
const QUERY_REWRITE_TIMEOUT_MS = 3000;

const MIN_RAW_SIMILARITY = 0.35;
const MIN_KEYWORD_SCORE = 0.5;      // Keyword-only rescue threshold
const CANDIDATE_CAP = 100;          // Max candidates for vector scoring
const RERANK_CANDIDATE_COUNT = 20;  // Top candidates to send to Rerank

// ====== Temporal Intent Detection (expanded) ======

type TemporalIntent =
    | { type: 'first' }
    | { type: 'latest' }
    | { type: 'frequent' }
    | { type: 'absolute'; start: number; end: number }
    | null;

function detectTemporalIntent(query: string): TemporalIntent {
    // Exact temporal phrases
    if (/第一次|初次|首次|最早|一开始|刚开始/.test(query)) return { type: 'first' };
    if (/上次|上一次|最近一次|最后一次|之前那次/.test(query)) return { type: 'latest' };
    if (/经常|总是|每次|老是|一直/.test(query)) return { type: 'frequent' };

    // Absolute time range via parseDateExpression
    const dateRange = parseDateExpression(query);
    if (dateRange) return { type: 'absolute', start: dateRange.start, end: dateRange.end };

    return null;
}

// ====== LLM Query Rewriting ======

const REWRITE_PROMPT_TEMPLATE = `你是一个记忆检索助手。根据以下对话上下文，提取用户当前最可能想了解或回忆的话题，生成一段精简的检索查询（30字以内）。
只输出查询文本，不要加任何解释、引号或标点修饰。

对话上下文：
{context}`;

/**
 * Rewrite conversational context into a focused retrieval query.
 * Uses a lightweight free LLM call with 3s timeout.
 * 
 * Provider routing:
 *   - OpenAI-compatible: uses embedding key + SiliconFlow endpoint (Qwen3-8B)
 *   - Cohere: embedding key can't call LLM, so fallback to:
 *       1. SiliconFlow STT key → Qwen3-8B (free, unlimited)
 *       2. Groq STT key → llama-3.3-70b-versatile (free, generous limits)
 *       3. null (rule-based fallback)
 * 
 * Returns null on failure (caller should fallback).
 */
async function rewriteQueryWithLLM(
    contextMsgs: Message[],
    embeddingApiKey: string
): Promise<string | null> {
    const config = getEmbeddingConfig();

    // Determine which LLM endpoint + key to use for query rewrite
    let rewriteBaseUrl: string;
    let rewriteApiKey: string;
    let rewriteModel: string;

    if (config.provider === 'cohere') {
        // Cohere key can't call chat/completions — try STT keys instead
        let sttSiliconKey = '';
        let sttGroqKey = '';
        try {
            const sttRaw = localStorage.getItem('os_stt_config');
            if (sttRaw) {
                const sttCfg = JSON.parse(sttRaw);
                sttSiliconKey = sttCfg.siliconflowApiKey || '';
                sttGroqKey = sttCfg.groqApiKey || '';
            }
        } catch { /* silent */ }

        if (sttSiliconKey) {
            // Best: SiliconFlow Qwen3-8B — completely free, no monthly limit
            rewriteBaseUrl = 'https://api.siliconflow.cn/v1';
            rewriteApiKey = sttSiliconKey;
            rewriteModel = QUERY_REWRITE_MODEL; // Qwen/Qwen3-8B
            console.log('🧠 [VectorRetriever] Cohere mode: using SiliconFlow STT key for query rewrite');
        } else if (sttGroqKey) {
            // Fallback: Groq Llama — free with generous limits
            rewriteBaseUrl = 'https://api.groq.com/openai/v1';
            rewriteApiKey = sttGroqKey;
            rewriteModel = 'llama-3.3-70b-versatile';
            console.log('🧠 [VectorRetriever] Cohere mode: using Groq STT key for query rewrite');
        } else {
            // No free LLM key available — fall back to rule-based
            console.log('🧠 [VectorRetriever] Cohere mode: no STT key found, using rule-based fallback');
            return null;
        }
    } else {
        // OpenAI-compatible: use embedding key + same base URL (SiliconFlow)
        rewriteBaseUrl = config.baseUrl.replace(/\/+$/, '');
        rewriteApiKey = embeddingApiKey;
        rewriteModel = QUERY_REWRITE_MODEL;
    }

    // Build context: last 1 assistant + last 2 user messages
    const contextLines: string[] = [];
    const reversed = [...contextMsgs].reverse();
    let userCount = 0;
    let assistantCount = 0;
    for (const m of reversed) {
        if (m.role === 'user' && userCount < 2) {
            contextLines.unshift(`用户: ${stripRPActions(m.content).slice(0, 200)}`);
            userCount++;
        } else if (m.role === 'assistant' && assistantCount < 1) {
            contextLines.unshift(`角色: ${stripRPActions(m.content).slice(0, 150)}`);
            assistantCount++;
        }
        if (userCount >= 2 && assistantCount >= 1) break;
    }

    if (contextLines.length === 0) return null;

    const prompt = REWRITE_PROMPT_TEMPLATE.replace('{context}', contextLines.join('\n'));

    // AbortController for timeout
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), QUERY_REWRITE_TIMEOUT_MS);

    try {
        const resp = await fetch(`${rewriteBaseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${rewriteApiKey}`,
            },
            body: JSON.stringify({
                model: rewriteModel,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
                max_tokens: 100,
            }),
            signal: controller.signal,
        });

        if (!resp.ok) {
            console.warn(`🧠 [VectorRetriever] Query rewrite LLM error ${resp.status}, falling back`);
            return null;
        }

        const data = await resp.json();
        let rewritten = (data.choices?.[0]?.message?.content || '').trim();

        // Strip any <think>...</think> tags from reasoning models
        rewritten = rewritten.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

        if (!rewritten || rewritten.length < 2 || rewritten.length > 200) return null;

        console.log(`🧠 [VectorRetriever] Rewritten query: "${rewritten}"`);
        return rewritten;
    } catch (err: any) {
        if (err.name === 'AbortError') {
            console.warn(`🧠 [VectorRetriever] Query rewrite timed out (${QUERY_REWRITE_TIMEOUT_MS}ms), falling back`);
        } else {
            console.warn('🧠 [VectorRetriever] Query rewrite failed, falling back:', err.message);
        }
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Rule-based fallback: strip RP actions, keep only user messages.
 */
function buildFallbackQuery(contextMsgs: Message[]): string {
    return contextMsgs
        .filter(m => m.role === 'user')
        .slice(-3)
        .map(m => stripRPActions(m.content))
        .join('\n')
        .slice(0, 500);
}

/** Strip RP action descriptions: *动作*, （描写）, (actions) */
function stripRPActions(text: string): string {
    return text
        .replace(/\*[^*]+\*/g, '')       // *italics actions*
        .replace(/（[^）]+）/g, '')       // （中文括号描写）
        .replace(/\([^)]+\)/g, '')        // (English paren actions)
        .replace(/\s+/g, ' ')
        .trim();
}

// ====== Dynamic TOP_K ======

function computeTopK(topSimilarity: number): number {
    if (topSimilarity >= 0.70) return 3;   // Precise match — few, focused results
    if (topSimilarity >= 0.50) return 5;   // Normal
    return 7;                               // Fuzzy intent — more context
}

// ====== IDF Index Builder ======

function buildIDFIndex(headers: { title: string; content: string; emotionalJourney?: string }[]): Map<string, number> {
    const N = headers.length;
    if (N === 0) return new Map();

    // Count document frequency: how many memories contain each word
    const dfMap = new Map<string, number>();
    for (const h of headers) {
        const text = `${h.title} ${h.content} ${h.emotionalJourney || ''}`;
        const uniqueWords = new Set(segmentWords(text));
        for (const w of uniqueWords) {
            dfMap.set(w, (dfMap.get(w) || 0) + 1);
        }
    }

    // IDF = log(N / df) — rare words get high IDF, common words get low IDF
    const idfMap = new Map<string, number>();
    for (const [w, df] of dfMap) {
        idfMap.set(w, Math.log(N / df));
    }
    return idfMap;
}

// ====== Main Retriever ======

export const VectorMemoryRetriever = {

    /**
     * Retrieve top-K relevant vector memories for a conversation.
     * Returns formatted markdown string for system prompt injection, or null.
     * 
     * NEVER throws — returns null on any error for graceful degradation.
     */
    async retrieve(
        charId: string,
        currentMsgs: Message[],
        embeddingApiKey: string,
        _apiConfig?: APIConfig,  // reserved for future use
        currentHormoneState?: InternalState,  // 当前激素状态（用于状态依存性检索）
    ): Promise<string | null> {
        try {
            // Extract recent conversation context
            const contextMsgs = currentMsgs
                .filter(m => (m.role === 'user' || m.role === 'assistant') && (m.type === 'text' || m.type === 'call_log'))
                .slice(-5);

            if (contextMsgs.filter(m => m.role === 'user').length === 0) return null;

            // ====== Stage 0: Query Rewriting ======
            // Try LLM rewrite first, fallback to rule-based cleanup
            let queryText = await rewriteQueryWithLLM(contextMsgs, embeddingApiKey);
            if (!queryText) {
                queryText = buildFallbackQuery(contextMsgs);
                console.log('🧠 [VectorRetriever] Using fallback query:', queryText.slice(0, 50) + '...');
            }
            if (!queryText.trim()) return null;

            // Detect temporal intent from the last user message
            const lastUserMsg = contextMsgs.filter(m => m.role === 'user').pop()?.content || '';
            const temporalIntent = detectTemporalIntent(lastUserMsg);
            if (temporalIntent) console.log(`🧠 [VectorRetriever] Temporal intent: "${temporalIntent.type}"${temporalIntent.type === 'absolute' ? ` (${new Date(temporalIntent.start).toLocaleDateString()} ~ ${new Date(temporalIntent.end).toLocaleDateString()})` : ''}`);

            // ====== Stage 1: Keyword Pre-filter with IDF ======
            const headers = await DB.getVectorMemoryHeaders(charId);
            const activeHeaders = headers.filter(h => !h.deprecated);
            if (activeHeaders.length === 0) return null;

            // Build IDF index from all active headers
            const idfMap = buildIDFIndex(activeHeaders);

            // Compute IDF-weighted keyword scores for all headers
            const headerScored = activeHeaders.map(h => {
                const memText = `${h.title} ${h.content} ${h.emotionalJourney || ''}`;
                const kwScore = EmbeddingService.keywordMatchScoreWithIDF(queryText!, memText, idfMap);
                return { ...h, kwScore };
            });

            // ====== Tiered Candidate Selection ======
            const now = Date.now();
            const DAY = 24 * 60 * 60 * 1000;
            const candidates = new Set<string>();

            // For absolute temporal intent: force-include memories in the target time range
            if (temporalIntent?.type === 'absolute') {
                for (const h of activeHeaders) {
                    if (h.createdAt >= temporalIntent.start && h.createdAt <= temporalIntent.end) {
                        candidates.add(h.id);
                    }
                }
            }

            // Tiered by keyword score × recency
            for (const h of headerScored) {
                const ageMs = now - h.createdAt;
                if (h.kwScore >= 0.3) {
                    // Strong keyword match → no time limit
                    candidates.add(h.id);
                } else if (h.kwScore > 0 && ageMs < 90 * DAY) {
                    // Weak keyword match → last 90 days
                    candidates.add(h.id);
                } else if (h.importance >= 7) {
                    // High importance → no time limit
                    candidates.add(h.id);
                } else if (ageMs < 14 * DAY) {
                    // No keyword match → last 14 days only
                    candidates.add(h.id);
                }
            }

            // Fallback: ensure at least 30 candidates
            if (candidates.size < 30) {
                const byRecent = [...activeHeaders].sort((a, b) => b.createdAt - a.createdAt);
                for (const h of byRecent) {
                    candidates.add(h.id);
                    if (candidates.size >= 50) break;
                }
            }

            // Cap at CANDIDATE_CAP
            const candidateIds = [...candidates].slice(0, CANDIDATE_CAP);
            console.log(`🧠 [VectorRetriever] Pre-filter: ${activeHeaders.length} total → ${candidateIds.length} candidates (${headerScored.filter(h => h.kwScore > 0).length} keyword hits)`);

            // Build keyword score map for fast lookup
            const kwScoreMap = new Map<string, number>();
            for (const h of headerScored) {
                kwScoreMap.set(h.id, h.kwScore);
            }

            // ====== Stage 2: Vector Scoring (1 API call) ======
            console.log('🧠 [VectorRetriever] Embedding query:', queryText.slice(0, 50) + '...');
            const queryVector = await EmbeddingService.embed(queryText, 'RETRIEVAL_QUERY', embeddingApiKey);
            const queryDim = queryVector.length;

            // Load vectors only for candidates (selective load, not full table)
            let memories = await DB.getVectorMemoriesByIds(candidateIds);

            // Filter out deprecated memories before scoring
            memories = memories.filter(m => !m.deprecated);

            // Score candidates with combined signal
            const scored: { memory: VectorMemory; score: number; rawSim: number; kwScore: number }[] = [];
            let skippedCount = 0;

            // Precompute current hormone snapshot for resonance matching
            const currentSnapshot = currentHormoneState ? extractHormoneSnapshot(currentHormoneState) : null;

            for (const mem of memories) {
                if (mem.vector.length !== queryDim) {
                    skippedCount++;
                    continue;
                }
                const rawSim = EmbeddingService.cosineSimilarity(queryVector, mem.vector);
                const kwScore = kwScoreMap.get(mem.id) || 0;

                // Compute hormone resonance: cosine similarity between current state and memory's snapshot
                let resonance = 0;
                if (currentSnapshot && mem.hormoneSnapshot) {
                    resonance = computeHormoneResonance(currentSnapshot, mem.hormoneSnapshot);
                }

                const score = EmbeddingService.weightedScore(
                    rawSim, mem.importance, mem.createdAt, kwScore, mem.lastMentioned,
                    mem.salienceScore || 0, resonance,
                );
                scored.push({ memory: mem, score, rawSim, kwScore });
            }

            if (skippedCount > 0) {
                console.warn(`🧠 [VectorRetriever] Skipped ${skippedCount} memories with incompatible dimensions (expected ${queryDim})`);
            }

            // ====== Stage 3: Rerank (cross-encoder precision scoring) ======
            // Take top candidates by weighted score → rerank with cross-encoder → blend scores
            if (!temporalIntent && scored.length > 0) {
                scored.sort((a, b) => b.score - a.score);
                const rerankCandidates = scored.slice(0, RERANK_CANDIDATE_COUNT);
                const rerankDocuments = rerankCandidates.map(s => {
                    const m = s.memory;
                    return `${m.title}: ${m.content}${m.emotionalJourney ? ` (${m.emotionalJourney})` : ''}`;
                });

                const rerankResults = await EmbeddingService.rerank(
                    queryText!, rerankDocuments, undefined, embeddingApiKey
                );

                if (rerankResults && rerankResults.length > 0) {
                    // Blend: 50% rerank score + 50% original weighted score
                    const rerankScoreMap = new Map<number, number>();
                    for (const r of rerankResults) {
                        rerankScoreMap.set(r.index, r.relevance_score);
                    }
                    for (let i = 0; i < rerankCandidates.length; i++) {
                        const rerankScore = rerankScoreMap.get(i) ?? 0;
                        rerankCandidates[i].score = rerankScore * 0.5 + rerankCandidates[i].score * 0.5;
                    }
                    // Re-sort by blended score
                    rerankCandidates.sort((a, b) => b.score - a.score);
                    // Replace scored array top portion with reranked results
                    scored.splice(0, RERANK_CANDIDATE_COUNT, ...rerankCandidates);
                    console.log(`🧠 [VectorRetriever] Rerank: ${rerankCandidates.length} candidates reranked (top: ${rerankCandidates[0]?.score.toFixed(3)})`);
                } else {
                    console.log('🧠 [VectorRetriever] Rerank skipped (fallback to original scores)');
                }
            }

            // ====== Dynamic TOP_K + Temporal sorting ======
            let relevant: typeof scored;

            if (temporalIntent) {
                // Temporal: filter all by threshold → sort by temporal logic → take top-K
                const allRelevant = scored.filter(s =>
                    s.rawSim >= MIN_RAW_SIMILARITY || s.kwScore >= MIN_KEYWORD_SCORE
                );

                if (temporalIntent.type === 'first') {
                    allRelevant.sort((a, b) => a.memory.createdAt - b.memory.createdAt);
                } else if (temporalIntent.type === 'latest') {
                    allRelevant.sort((a, b) => b.memory.createdAt - a.memory.createdAt);
                } else if (temporalIntent.type === 'frequent') {
                    // Sort by mention count for "经常/总是" queries
                    allRelevant.sort((a, b) => b.memory.mentionCount - a.memory.mentionCount);
                } else if (temporalIntent.type === 'absolute') {
                    // For absolute time range: boost memories within range, then by createdAt
                    allRelevant.sort((a, b) => {
                        const aInRange = a.memory.createdAt >= temporalIntent.start && a.memory.createdAt <= temporalIntent.end;
                        const bInRange = b.memory.createdAt >= temporalIntent.start && b.memory.createdAt <= temporalIntent.end;
                        if (aInRange && !bInRange) return -1;
                        if (!aInRange && bInRange) return 1;
                        return a.memory.createdAt - b.memory.createdAt;
                    });
                }

                const dynamicK = computeTopK(allRelevant[0]?.rawSim || 0);
                relevant = allRelevant.slice(0, dynamicK);
                console.log(`🧠 [VectorRetriever] Temporal "${temporalIntent.type}": ${allRelevant.length} relevant → ${relevant.length} selected (K=${dynamicK})`);
            } else {
                // Normal: take top K by weighted score (already reranked), then filter
                scored.sort((a, b) => b.score - a.score);
                const dynamicK = computeTopK(scored[0]?.rawSim || 0);
                const topKResults = scored.slice(0, dynamicK);
                relevant = topKResults.filter(s =>
                    s.rawSim >= MIN_RAW_SIMILARITY || s.kwScore >= MIN_KEYWORD_SCORE
                );
                console.log(`🧠 [VectorRetriever] Normal mode: K=${dynamicK}, ${relevant.length} above threshold`);
            }

            if (relevant.length === 0) {
                console.log('🧠 [VectorRetriever] No memories above threshold');
                return null;
            }

            const topHit = relevant[0];
            console.log(`🧠 [VectorRetriever] Found ${relevant.length} relevant (top: sim=${topHit.rawSim.toFixed(3)}, kw=${topHit.kwScore.toFixed(2)}, score=${topHit.score.toFixed(3)})`);

            // Update mentionCount and lastMentioned for matched memories (fire-and-forget)
            for (const { memory } of relevant) {
                const updated: VectorMemory = {
                    ...memory,
                    mentionCount: memory.mentionCount + 1,
                    lastMentioned: Date.now(),
                };
                DB.saveVectorMemory(updated).catch(() => { /* silent */ });
            }

            // Build sequence position map: all headers sorted by createdAt → ordinal position
            const sortedHeaders = [...activeHeaders].sort((a, b) => a.createdAt - b.createdAt);
            const positionMap = new Map<string, number>();
            sortedHeaders.forEach((h, i) => positionMap.set(h.id, i + 1));
            const totalMemories = activeHeaders.length;

            // Temporal intent: preserve time-priority sort; normal: chronological for natural timeline
            if (!temporalIntent) {
                relevant.sort((a, b) => a.memory.createdAt - b.memory.createdAt);
            }

            // Format as markdown for prompt injection
            const formatted = relevant.map((s, i) => {
                const m = s.memory;
                const pos = positionMap.get(m.id) || 0;

                // Relative time label
                const ageMs = Date.now() - m.createdAt;
                const days = Math.floor(ageMs / (24 * 60 * 60 * 1000));
                let timeLabel: string;
                if (days === 0) timeLabel = '今天';
                else if (days === 1) timeLabel = '昨天';
                else if (days < 7) timeLabel = `${days}天前`;
                else if (days < 30) timeLabel = `约${Math.round(days / 7)}周前`;
                else if (days < 365) timeLabel = `约${Math.round(days / 30)}个月前`;
                else timeLabel = `约${(days / 365).toFixed(1)}年前`;

                // Date string (month granularity for context)
                const dateStr = new Date(m.createdAt).toLocaleDateString('zh-CN', {
                    year: 'numeric', month: 'long'
                });

                let line = `${i + 1}. [#${pos}/${totalMemories}, ${timeLabel}, ${dateStr}] ${m.title}\n   ${m.content}`;
                if (m.emotionalJourney) {
                    line += `\n   → 当时的感受: ${m.emotionalJourney}`;
                }
                return line;
            }).join('\n\n');

            const intentHint = temporalIntent?.type === 'first'
                ? '，以下是最早的相关记忆'
                : temporalIntent?.type === 'latest'
                    ? '，以下是最近的相关记忆'
                    : temporalIntent?.type === 'frequent'
                        ? '，以下是经常被提起的记忆'
                        : temporalIntent?.type === 'absolute'
                            ? `，以下是该时间段的相关记忆`
                            : '，以下按时间顺序排列';

            return `**你的记忆 · 浮现**
此情此景，一些过去的画面自然涌上心头。
这些瞬间不是孤立的——它们就藏在你上面回忆过的那些日子里。
（共${totalMemories}段记忆${intentHint}）

${formatted}`;

        } catch (err) {
            console.error('🧠 [VectorRetriever] Retrieval error (silent fail):', err);
            return null;
        }
    },
};
