
import { useState, useRef, useCallback } from 'react';
import { CharacterProfile, UserProfile, Message, Emoji, EmojiCategory, GroupProfile, RealtimeConfig } from '../types';
import { DB } from '../utils/db';
import { ChatPrompts } from '../utils/chatPrompts';
import { ChatParser, BILINGUAL_MARKER } from '../utils/chatParser';
import { RealtimeContextManager, NotionManager, FeishuManager, XhsNote } from '../utils/realtimeContext';
import { XhsMcpClient, extractNotesFromMcpData, normalizeNote } from '../utils/xhsMcpClient';
import { safeFetchJson, safeResponseJson } from '../utils/safeApi';
import { haptic, playThemeNotification } from '../utils/haptics';
import { THEME_PLUGINS } from '../components/chat/ThemeRegistry';
import { resolveXhsConfig, xhsSearch, xhsBrowse, xhsPublish, xhsComment, xhsLike, xhsFavorite, xhsReplyComment } from './xhsHelpers';
import { processXhsActions } from './xhsProcessor';
import { VectorMemoryExtractor } from '../utils/vectorMemoryExtractor';
import { MindSnapshotExtractor } from '../utils/mindSnapshotExtractor';
import { EventExtractor } from '../utils/eventExtractor';
import { extractThinking } from '../utils/thinkingExtractor';

interface UseChatAIProps {
    char: CharacterProfile | undefined;
    userProfile: UserProfile;
    apiConfig: any;
    groups: GroupProfile[];
    emojis: Emoji[];
    categories: EmojiCategory[];
    addToast: (msg: string, type: 'info' | 'success' | 'error') => void;
    setMessages: (msgs: Message[]) => void; // Callback to update UI messages
    realtimeConfig?: RealtimeConfig; // 新增：实时配置
    translationConfig?: { enabled: boolean; sourceLang: string; targetLang: string };
    autoVoice?: boolean; // 开启后向 AI 注入语音消息格式指引
    onVoiceMessageSaved?: (msgId: number, text: string) => void; // 语音消息保存后的回调（用于触发 TTS）
    autoCall?: boolean; // 开启后向 AI 注入主动来电指引
    onIncomingCall?: (mode: string, callReason: string) => void; // AI 触发来电时的回调
    onMoodUpdate?: (charId: string, moodState: any, statusCardData?: any) => void; // MindSnapshot / CreativeCard 完成后回调
}

export const useChatAI = ({
    char,
    userProfile,
    apiConfig,
    groups,
    emojis,
    categories,
    addToast,
    setMessages,
    realtimeConfig,  // 新增
    translationConfig,
    autoVoice,
    onVoiceMessageSaved,
    autoCall,
    onIncomingCall,
    onMoodUpdate
}: UseChatAIProps) => {

    const [isTyping, setIsTyping] = useState(false);
    const [recallStatus, setRecallStatus] = useState<string>('');
    const [searchStatus, setSearchStatus] = useState<string>('');
    const [diaryStatus, setDiaryStatus] = useState<string>('');
    const [xhsStatus, setXhsStatus] = useState<string>('');
    const [lastTokenUsage, setLastTokenUsage] = useState<number | null>(null);
    const [tokenBreakdown, setTokenBreakdown] = useState<{ prompt: number; completion: number; total: number; msgCount: number; pass: string } | null>(null);

    // MindSnapshot retry context
    const lastMindSnapshotCtx = useRef<{ char: any; aiContent: string; msgs: Message[]; config: any } | null>(null);

    // 跨消息持久化的 noteId→xsecToken 缓存，避免 lastXhsNotes 局部变量每次 triggerAI 都重置
    const xsecTokenCacheRef = useRef<Map<string, string>>(new Map());
    // noteId→title 缓存，用于 detail 失败时重新搜索拿新 token
    const noteTitleCacheRef = useRef<Map<string, string>>(new Map());
    // commentId→userId 缓存，reply_comment 需要 user_id 帮助 MCP 服务端定位评论
    const commentUserIdCacheRef = useRef<Map<string, string>>(new Map());
    // commentId→authorName 缓存，reply 降级为顶级评论时用 @authorName 让回复有上下文
    const commentAuthorNameCacheRef = useRef<Map<string, string>>(new Map());
    // commentId→parentCommentId 缓存，供 reply_comment 传递 parent_comment_id（xiaohongshu-mcp PR#440+）
    const commentParentIdCacheRef = useRef<Map<string, string>>(new Map());

    /** 将笔记列表的 xsecToken 和 title 存入缓存 */
    const cacheXsecTokens = (notes: XhsNote[]) => {
        for (const n of notes) {
            if (n.noteId && n.xsecToken) {
                xsecTokenCacheRef.current.set(n.noteId, n.xsecToken);
            }
            if (n.noteId && n.title) {
                noteTitleCacheRef.current.set(n.noteId, n.title);
            }
        }
    };

    /** 从缓存或 lastXhsNotes 中查找 xsecToken */
    const findXsecToken = (noteId: string, lastXhsNotes: XhsNote[]): string | undefined => {
        const fromNotes = lastXhsNotes.find(n => n.noteId === noteId)?.xsecToken;
        if (fromNotes) return fromNotes;
        return xsecTokenCacheRef.current.get(noteId);
    };

    const updateTokenUsage = (data: any, msgCount: number, pass: string) => {
        if (data.usage?.total_tokens) {
            setLastTokenUsage(data.usage.total_tokens);
            const breakdown = {
                prompt: data.usage.prompt_tokens || 0,
                completion: data.usage.completion_tokens || 0,
                total: data.usage.total_tokens,
                msgCount,
                pass
            };
            setTokenBreakdown(breakdown);
            console.log(`🔢 [Token Usage] pass=${pass} | prompt=${breakdown.prompt} completion=${breakdown.completion} total=${breakdown.total} | msgs_in_context=${msgCount}`);
        }
    };

    const triggerAI = async (currentMsgs: Message[]) => {
        if (isTyping || !char) return;
        if (!apiConfig.baseUrl) { alert("请先在设置中配置 API URL"); return; }

        setIsTyping(true);
        setRecallStatus('');

        try {
            const baseUrl = apiConfig.baseUrl.replace(/\/+$/, '');
            const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey || 'sk-none'}` };

            // 0. Internal State Layer: senseBefore (和下方 buildSystemPrompt 的 embedding/rerank 并行)
            const subKey = localStorage.getItem('sub_api_key');
            const subUrl = localStorage.getItem('sub_api_base_url');
            const subModel = localStorage.getItem('sub_api_model');
            const secondaryConfig = (subKey && subUrl && subModel)
                ? { baseUrl: subUrl, apiKey: subKey, model: subModel }
                : apiConfig;

            // Run senseBefore in parallel with buildSystemPrompt
            const embeddingApiKey = localStorage.getItem('embedding_api_key') || undefined;
            const [senseResult, systemPromptResult] = await Promise.all([
                secondaryConfig.apiKey
                    ? MindSnapshotExtractor.senseBefore(char, currentMsgs, secondaryConfig)
                        .catch(e => { console.error('💭 [Sense] Parallel error:', e); return null; })
                    : Promise.resolve(null),
                (async () => {
                    // If senseBefore finishes first and updates char.moodState (via DB persist),
                    // buildCoreContext will pick it up. But since they run in parallel,
                    // we also manually inject body signals after if needed.
                    return ChatPrompts.buildSystemPrompt(char, userProfile, groups, emojis, categories, currentMsgs, realtimeConfig, apiConfig, embeddingApiKey);
                })(),
            ]);

            let systemPrompt = systemPromptResult;

            // If senseBefore returned a new state, update char in memory and notify UI
            if (senseResult && onMoodUpdate) {
                onMoodUpdate(char.id, senseResult);
                // Also update the local char ref so subsequent code sees the new state
                char.moodState = senseResult;
            }

            // 1.1 Inject voice message format instruction (only when autoVoice is enabled)
            if (autoVoice) {
                systemPrompt += `

[系统功能: 语音消息]
你现在可以发送语音消息。当你想发语音（比如叫名字、撒娇、说一句重要的话），请使用以下严格格式：
【语音消息：你说的话】

格式规则（必须遵守）：
- 必须用全角中文括号【】包裹，冒号为全角：
- 括号里只写你开口说的话，不写动作描述或"嗯""啊"等语气词
- 可以单独一条发，也可以出现在文字消息里
- 不是每次都要发语音，在合适时机偶尔使用即可
- 严禁写成 [语音消息] 或 (语音消息) 等其他形式

示例：
【语音消息：喂，你在吗？】
【语音消息：我刚下班，等一下啊。】`;
            }

            // 1.2 Inject incoming call instruction (only when autoCall is enabled)
            if (autoCall) {
                systemPrompt += `\n\n[系统功能: 主动来电]
你可以主动给用户打电话。当你觉得有必要用电话沟通时（比如想听声音、深夜关心、重要的话想当面说），
请单独起一行输出：[[CALL: mode]]
mode 可选值：
- daily（日常聊聊）
- confide（有心事想说）
- truth（想坦白什么）
- sleep（想陪用户入睡）
规则：
- 不要频繁打电话，在合适的情绪节点自然触发
- 输出 [[CALL: mode]] 后不要再写其他文字
- 严禁在同一条回复里既打电话又发消息`;
            }

            // 1.5 Inject bilingual output instruction when translation is enabled
            const bilingualActive = translationConfig?.enabled && translationConfig.sourceLang && translationConfig.targetLang;
            if (bilingualActive) {
                systemPrompt += `\n\n[CRITICAL: 双语输出模式 - 必须严格遵守]
你的每句话都必须用以下XML标签格式输出双语内容：
<翻译>
<原文>${translationConfig.sourceLang}内容</原文>
<译文>${translationConfig.targetLang}内容</译文>
</翻译>

规则：
- 每句话单独包裹一个<翻译>标签
- 多句话就输出多个<翻译>标签，一句一个
- <翻译>标签外不要写任何文字
- 表情包命令 [[SEND_EMOJI: ...]] 放在所有<翻译>标签外面

示例（${translationConfig.sourceLang}→${translationConfig.targetLang}）：
<翻译>
<原文>こんにちは！</原文>
<译文>你好！</译文>
</翻译>
<翻译>
<原文>今日は何する？</原文>
<译文>今天做什么？</译文>
</翻译>`;
            }

            // 2. Build Message History
            // CRITICAL: Load full message history from DB up to contextLimit,
            // not from React state which is capped at 200 for rendering performance
            const limit = char.contextLimit || 500;
            let contextMsgs = currentMsgs;
            if (limit > currentMsgs.length && char.id) {
                try {
                    const fullHistory = await DB.getRecentMessagesByCharId(char.id, limit);
                    if (fullHistory.length > currentMsgs.length) {
                        console.log(`📊 [Context] Loaded ${fullHistory.length} msgs from DB (React state had ${currentMsgs.length}, contextLimit=${limit})`);
                        contextMsgs = fullHistory;
                    }
                } catch (e) {
                    console.error('Failed to load full history from DB, using React state:', e);
                }
            }
            const { apiMessages, historySlice } = ChatPrompts.buildMessageHistory(contextMsgs, limit, char, userProfile, emojis);

            // 2.5 Strip translation content from previous messages to save tokens
            const cleanedApiMessages = apiMessages.map((msg: any) => {
                if (typeof msg.content !== 'string') return msg;
                let c = msg.content;
                // Strip old %%BILINGUAL%% format (both spaced and non-spaced variants)
                const biRe = /%%\s*BILINGUAL\s*%%/i;
                if (biRe.test(c)) {
                    const idx = c.search(biRe);
                    c = c.substring(0, idx).trim();
                }
                // Strip new XML tag format: keep only <原文> content
                if (c.includes('<翻译>')) {
                    c = c.replace(/<翻译>\s*<原文>([\s\S]*?)<\/原文>\s*<译文>[\s\S]*?<\/译文>\s*<\/翻译>/g, '$1').trim();
                }
                return { ...msg, content: c };
            });

            const fullMessages = [{ role: 'system', content: systemPrompt }, ...cleanedApiMessages];

            // 2.55 Inject STT tolerance prompt if last user message is a voice recording
            // Voice messages are now properly formatted by buildMessageHistory with [🎤用户语音] prefix
            const lastUserIdx = fullMessages.map(m => m.role).lastIndexOf('user');
            if (lastUserIdx >= 0) {
                const lastUserMsg = fullMessages[lastUserIdx];
                if (typeof lastUserMsg.content === 'string' && lastUserMsg.content.includes('[🎤用户语音]')) {
                    fullMessages.splice(lastUserIdx + 1, 0, {
                        role: 'system',
                        content: '[系统提示：用户刚才发送了一条语音消息。以下文字由设备语音识别自动转换，可能存在同音字错误或漏字，请结合上下文理解原意，并按照原意进行回复]'
                    });
                }
            }

            // Debug: Log context composition
            const systemPromptLength = systemPrompt.length;
            const historyMsgCount = cleanedApiMessages.length;
            const historyTotalChars = cleanedApiMessages.reduce((sum: number, m: any) => sum + (typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content).length), 0);
            console.log(`📊 [Context Debug] system_prompt_chars=${systemPromptLength} | history_msgs=${historyMsgCount} | history_chars=${historyTotalChars} | total_msgs_in_array=${fullMessages.length} | contextLimit=${limit}`);

            // 2.6 Reinforce bilingual instruction at the end of messages for stronger compliance
            if (bilingualActive) {
                fullMessages.push({ role: 'system', content: `[Reminder: 每句话必须用 <翻译><原文>...</原文><译文>...</译文></翻译> 标签包裹。一句一个标签。绝对不能省略。]` });
            }

            // 3. API Call — when deep immersion mode is on and model is Gemini,
            // request native thinking via thinking_config. Otherwise, plain call.
            const isGeminiModel = /gemini/i.test(apiConfig.model || '');
            const wantNativeThinking = !!(apiConfig.useGeminiJailbreak && isGeminiModel);

            // 3.0 Prefill injection — force CoT <thinking> start (always-on)
            const usePrefill = true;
            if (usePrefill) {
                fullMessages.push({ role: 'assistant', content: '<thinking>\n' });
                console.log('🧩 [Prefill] Injected <thinking> prefill assistant message');
            }

            const requestBody: Record<string, any> = {
                model: apiConfig.model,
                messages: fullMessages,
                temperature: 0.85,
                stream: false,
            };
            if (wantNativeThinking && !usePrefill) {
                // Gemini 2.5+ native thinking: tokens budget (8k gives decent CoT depth)
                // Skip when prefill is active — prefill forces text-embedded thinking instead
                requestBody.thinking = { type: 'enabled', budget_tokens: 8000 };
            }
            let data = await safeFetchJson(`${baseUrl}/chat/completions`, {
                method: 'POST', headers,
                body: JSON.stringify(requestBody)
            });
            updateTokenUsage(data, historyMsgCount, 'initial');

            // 3.5 Check for empty API responses (e.g. content filters, max context limits)
            if (!data.choices || data.choices.length === 0) {
                const errMsg = data.error?.message || data.error || data.msg || JSON.stringify(data);
                throw new Error(`API 返回空结果或拦截: ${errMsg}`);
            }

            // 4. Initial Cleanup
            let aiContent = data.choices[0]?.message?.content || '';
            if (!aiContent.trim()) {
                const finishReason = data.choices[0]?.finish_reason;
                const hint = finishReason ? ` (Finish Reason: ${finishReason})` : '';
                throw new Error(`AI 生成了空白内容。可能是触发了风控拦截，或者超出了该模型的上下文窗口上限${hint}。请尝试清理聊天上下文或更换更大上下文的模型。`);
            }

            // 4.0a Prefill reconstruction — restore the <thinking> opening tag
            // that we injected as a prefill but the model's response doesn't contain
            if (usePrefill) {
                aiContent = '<thinking>\n' + aiContent;
                console.log('🧩 [Prefill] Reconstructed <thinking> tag onto response');
            }

            aiContent = ChatParser.cleanAiSecondPass(aiContent);

            // 4.0 Extract thinking chain — try native Gemini thinking field first,
            // then fall back to <thinking>/<think> tag extraction for DeepSeek/Qwen3.
            // Gemini returns thinking in message.reasoning_content or via content_parts.
            const nativeThinking: string = (
                data.choices[0]?.message?.reasoning_content ||
                data.choices[0]?.message?.thinking ||
                ''
            );
            console.log(`🧠 [ThinkingDebug] useGeminiJailbreak=${apiConfig.useGeminiJailbreak} wantNativeThinking=${wantNativeThinking} | raw length=${aiContent.length} | nativeThinking length=${nativeThinking.length} | has <thinking>=${aiContent.includes('<thinking>')} | has <think>=${aiContent.includes('<think>')}`);
            console.log(`🧠 [ThinkingDebug] RAW AI OUTPUT (first 500 chars):`, aiContent.substring(0, 500));

            const extracted = extractThinking(aiContent);
            // Prefer native thinking field; fall back to text-embedded tags
            const thinkingContent = nativeThinking.trim() || extracted.thinking || '';
            // Only strip embedded tags from content (native thinking was separate already)
            aiContent = nativeThinking ? aiContent : extracted.content;
            console.log(`🧠 [ThinkingDebug] final thinkingContent length=${thinkingContent.length}, preview:`, thinkingContent.substring(0, 200));

            // 5. Handle Recall (Loop if needed)
            const recallMatch = aiContent.match(/\[\[RECALL:\s*(\d{4})[-/年](\d{1,2})\]\]/);
            if (recallMatch) {
                const year = recallMatch[1];
                const month = recallMatch[2];
                const targetMonth = `${year}-${month.padStart(2, '0')}`;

                // Check if this month is already in activeMemoryMonths (already in system prompt)
                const alreadyActive = char.activeMemoryMonths?.includes(targetMonth);

                if (alreadyActive) {
                    // Memory already present in system prompt via buildCoreContext, skip redundant API call
                    console.log(`♻️ [Recall] ${targetMonth} already in activeMemoryMonths, skipping duplicate recall`);
                    aiContent = aiContent.replace(/\[\[RECALL:\s*\d{4}[-/年]\d{1,2}\]\]/g, '').trim();
                } else {
                    setRecallStatus(`正在调阅 ${year}年${month}月 的详细档案...`);

                    // Helper to fetch detailed logs (duplicated logic from Chat.tsx, moved inside hook context)
                    const getDetailedLogs = (y: string, m: string) => {
                        if (!char.memories) return null;
                        const target = `${y}-${m.padStart(2, '0')}`;
                        const logs = char.memories.filter(mem => {
                            return mem.date.includes(target) || mem.date.includes(`${y}年${parseInt(m)}月`);
                        });
                        if (logs.length === 0) return null;
                        return logs.map(mem => `[${mem.date}] (${mem.mood || 'normal'}): ${mem.summary}`).join('\n');
                    };

                    const detailedLogs = getDetailedLogs(year, month);

                    if (detailedLogs) {
                        const recallMessages = [...fullMessages, { role: 'user', content: `[系统: 已成功调取 ${year}-${month} 的详细日志]\n${detailedLogs}\n[系统: 现在请结合这些细节回答用户。保持对话自然。]` }];
                        try {
                            data = await safeFetchJson(`${baseUrl}/chat/completions`, {
                                method: 'POST', headers,
                                body: JSON.stringify({ model: apiConfig.model, messages: recallMessages, temperature: 0.8, stream: false })
                            });
                            updateTokenUsage(data, historyMsgCount, 'recall');
                            aiContent = data.choices?.[0]?.message?.content || '';
                            // Re-clean
                            aiContent = ChatParser.cleanAiSecondPass(aiContent);
                            addToast(`已调用 ${year}-${month} 详细记忆`, 'info');
                        } catch (recallErr: any) {
                            console.error('Recall API failed:', recallErr.message);
                        }
                    }
                }
            }
            setRecallStatus('');

            // 5.5 Handle Active Search (主动搜索)
            const searchMatch = aiContent.match(/\[\[SEARCH:\s*(.+?)\]\]/);
            if (searchMatch && realtimeConfig?.newsEnabled && realtimeConfig?.newsApiKey) {
                const searchQuery = searchMatch[1].trim();
                console.log('🔍 [Search] AI触发搜索:', searchQuery);
                setSearchStatus(`正在搜索: ${searchQuery}...`);

                try {
                    const searchResult = await RealtimeContextManager.performSearch(searchQuery, realtimeConfig.newsApiKey);
                    console.log('🔍 [Search] 搜索结果:', searchResult);

                    if (searchResult.success && searchResult.results.length > 0) {
                        // 构建搜索结果字符串
                        const resultsStr = searchResult.results.map((r, i) =>
                            `${i + 1}. ${r.title}\n   ${r.description}`
                        ).join('\n\n');

                        console.log('🔍 [Search] 注入结果到AI，重新生成回复...');

                        // 重新调用 API，注入搜索结果
                        const cleanedForSearch = aiContent.replace(/\[\[SEARCH:.*?\]\]/g, '').trim() || '让我搜一下...';
                        const searchMessages = [
                            ...fullMessages,
                            { role: 'assistant', content: cleanedForSearch },
                            { role: 'user', content: `[系统: 搜索完成！以下是关于"${searchQuery}"的搜索结果]\n\n${resultsStr}\n\n[系统: 现在请根据这些真实信息回复用户。用自然的语气分享，比如"我刚搜了一下发现..."、"诶我看到说..."。不要再输出[[SEARCH:...]]了。]` }
                        ];

                        data = await safeFetchJson(`${baseUrl}/chat/completions`, {
                            method: 'POST', headers,
                            body: JSON.stringify({ model: apiConfig.model, messages: searchMessages, temperature: 0.8, stream: false })
                        });
                        updateTokenUsage(data, historyMsgCount, 'search');
                        aiContent = data.choices?.[0]?.message?.content || '';
                        console.log('🔍 [Search] AI基于搜索结果生成的新回复:', aiContent.slice(0, 100) + '...');
                        // Re-clean
                        aiContent = ChatParser.cleanAiSecondPass(aiContent);
                        addToast(`🔍 搜索完成: ${searchQuery}`, 'success');
                    } else {
                        console.log('🔍 [Search] 搜索失败或无结果:', searchResult.message);
                        addToast(`搜索失败: ${searchResult.message}`, 'error');
                        // 搜索失败，移除搜索标记继续
                        aiContent = aiContent.replace(searchMatch[0], '').trim();
                    }
                } catch (e) {
                    console.error('Search execution failed:', e);
                    aiContent = aiContent.replace(searchMatch[0], '').trim();
                }
            } else if (searchMatch) {
                console.log('🔍 [Search] 检测到搜索意图但未配置API Key');
                // 没有配置 API Key，移除搜索标记
                aiContent = aiContent.replace(searchMatch[0], '').trim();
            }
            setSearchStatus('');

            // 清理残留的搜索标记
            aiContent = aiContent.replace(/\[\[SEARCH:.*?\]\]/g, '').trim();

            // 5.6 Handle Diary Writing (写日记到 Notion)
            // 支持两种格式:
            //   旧格式: [[DIARY: 标题 | 内容]]
            //   新格式: [[DIARY_START: 标题 | 心情]]\n多行内容...\n[[DIARY_END]]
            const diaryStartMatch = aiContent.match(/\[\[DIARY_START:\s*(.+?)\]\]\n?([\s\S]*?)\[\[DIARY_END\]\]/);
            const diaryMatch = diaryStartMatch || aiContent.match(/\[\[DIARY:\s*(.+?)\]\]/s);

            if (diaryMatch && realtimeConfig?.notionEnabled && realtimeConfig?.notionApiKey && realtimeConfig?.notionDatabaseId) {
                let title = '';
                let content = '';
                let mood = '';

                if (diaryStartMatch) {
                    // 新格式: [[DIARY_START: 标题 | 心情]]\n内容\n[[DIARY_END]]
                    const header = diaryStartMatch[1].trim();
                    content = diaryStartMatch[2].trim();

                    if (header.includes('|')) {
                        const parts = header.split('|');
                        title = parts[0].trim();
                        mood = parts.slice(1).join('|').trim();
                    } else {
                        title = header;
                    }
                    console.log('📔 [Diary] AI写了一篇长日记:', title, '心情:', mood);
                } else {
                    // 旧格式: [[DIARY: 标题 | 内容]]
                    const diaryRaw = diaryMatch[1].trim();
                    console.log('📔 [Diary] AI想写日记:', diaryRaw);

                    if (diaryRaw.includes('|')) {
                        const parts = diaryRaw.split('|');
                        title = parts[0].trim();
                        content = parts.slice(1).join('|').trim();
                    } else {
                        content = diaryRaw;
                    }
                }

                // 没有标题时用日期
                if (!title) {
                    const now = new Date();
                    title = `${char.name}的日记 - ${now.getMonth() + 1}/${now.getDate()}`;
                }

                try {
                    const result = await NotionManager.createDiaryPage(
                        realtimeConfig.notionApiKey,
                        realtimeConfig.notionDatabaseId,
                        { title, content, mood: mood || undefined, characterName: char.name }
                    );

                    if (result.success) {
                        console.log('📔 [Diary] 写入成功:', result.url);
                        await DB.saveMessage({
                            charId: char.id,
                            role: 'system',
                            type: 'text',
                            content: `📔 ${char.name}写了一篇日记「${title}」`
                        });
                        addToast(`📔 ${char.name}写了一篇日记!`, 'success');
                    } else {
                        console.error('📔 [Diary] 写入失败:', result.message);
                        addToast(`日记写入失败: ${result.message}`, 'error');
                    }
                } catch (e) {
                    console.error('📔 [Diary] 写入异常:', e);
                }

                // 移除日记标记，不在聊天中显示
                aiContent = aiContent.replace(diaryMatch[0], '').trim();
            } else if (diaryMatch) {
                console.log('📔 [Diary] 检测到日记意图但未配置Notion');
                aiContent = aiContent.replace(diaryMatch[0], '').trim();
            }

            // 清理残留的日记标记（两种格式都清理）
            aiContent = aiContent.replace(/\[\[DIARY:.*?\]\]/gs, '').trim();
            aiContent = aiContent.replace(/\[\[DIARY_START:.*?\]\][\s\S]*?\[\[DIARY_END\]\]/g, '').trim();

            // 5.7 Handle Read Diary (翻阅日记)
            const readDiaryMatch = aiContent.match(/\[\[READ_DIARY:\s*(.+?)\]\]/);

            // Helper: make a fallback API call so the AI keeps talking even when diary fails
            // NOTE: Uses role:'user' for the system instruction to ensure API compatibility
            // (some providers reject conversations not ending with a user message)
            const diaryFallbackCall = async (reason: string, tagPattern: RegExp) => {
                const cleaned = aiContent.replace(tagPattern, '').trim() || '让我翻翻日记...';
                const msgs = [
                    ...fullMessages,
                    { role: 'assistant', content: cleaned },
                    { role: 'user', content: `[系统: ${reason}。请你：\n1. 先正常回应用户刚才说的话（用户还在等你回复！）\n2. 可以自然地提一下，比如"日记好像打不开诶"、"嗯...好像没找到"\n3. 继续正常聊天，用多条消息回复\n4. 严禁再输出[[READ_DIARY:...]]或[[FS_READ_DIARY:...]]标记]` }
                ];
                try {
                    data = await safeFetchJson(`${baseUrl}/chat/completions`, {
                        method: 'POST', headers,
                        body: JSON.stringify({ model: apiConfig.model, messages: msgs, temperature: 0.8, stream: false })
                    });
                    updateTokenUsage(data, historyMsgCount, 'diary-fallback');
                    aiContent = data.choices?.[0]?.message?.content || '';
                    aiContent = ChatParser.cleanAiSecondPass(aiContent);
                } catch (fallbackErr) {
                    console.error('📖 [Diary Fallback] 也失败了:', fallbackErr);
                    aiContent = aiContent.replace(tagPattern, '').trim();
                }
            };

            // Helper: parse various date formats
            const parseDiaryDate = (dateInput: string): string => {
                const now = new Date();
                if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) return dateInput;
                if (dateInput === '今天') return now.toISOString().split('T')[0];
                if (dateInput === '昨天') { const d = new Date(now); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]; }
                if (dateInput === '前天') { const d = new Date(now); d.setDate(d.getDate() - 2); return d.toISOString().split('T')[0]; }
                const daysAgo = dateInput.match(/^(\d+)天前$/);
                if (daysAgo) { const d = new Date(now); d.setDate(d.getDate() - parseInt(daysAgo[1])); return d.toISOString().split('T')[0]; }
                const monthDay = dateInput.match(/(\d{1,2})月(\d{1,2})/);
                if (monthDay) return `${now.getFullYear()}-${monthDay[1].padStart(2, '0')}-${monthDay[2].padStart(2, '0')}`;
                const parsed = new Date(dateInput);
                if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
                return '';
            };

            if (readDiaryMatch) {
                const dateInput = readDiaryMatch[1].trim();
                console.log('📖 [ReadDiary] AI想翻阅日记:', dateInput);

                if (realtimeConfig?.notionEnabled && realtimeConfig?.notionApiKey && realtimeConfig?.notionDatabaseId) {
                    const targetDate = parseDiaryDate(dateInput);

                    if (targetDate) {
                        try {
                            setDiaryStatus(`正在翻阅 ${targetDate} 的日记...`);

                            const findResult = await NotionManager.getDiaryByDate(
                                realtimeConfig.notionApiKey,
                                realtimeConfig.notionDatabaseId,
                                char.name,
                                targetDate
                            );

                            if (findResult.success && findResult.entries.length > 0) {
                                setDiaryStatus(`找到 ${findResult.entries.length} 篇日记，正在阅读...`);
                                const diaryContents: string[] = [];
                                for (const entry of findResult.entries) {
                                    const readResult = await NotionManager.readDiaryContent(
                                        realtimeConfig.notionApiKey,
                                        entry.id
                                    );
                                    if (readResult.success) {
                                        diaryContents.push(`📔「${entry.title}」(${entry.date})\n${readResult.content}`);
                                    }
                                }

                                if (diaryContents.length > 0) {
                                    const diaryText = diaryContents.join('\n\n---\n\n');
                                    console.log('📖 [ReadDiary] 成功读取', findResult.entries.length, '篇日记');
                                    setDiaryStatus('正在整理日记回忆...');

                                    const cleanedForDiary = aiContent.replace(/\[\[READ_DIARY:.*?\]\]/g, '').trim() || '让我翻翻日记...';
                                    const diaryMessages = [
                                        ...fullMessages,
                                        { role: 'assistant', content: cleanedForDiary },
                                        { role: 'user', content: `[系统: 你翻开了自己 ${targetDate} 的日记，以下是你当时写的内容]\n\n${diaryText}\n\n[系统: 你已经看完了日记。现在请你：\n1. 先正常回应用户刚才说的话（这是最重要的！用户还在等你回复）\n2. 自然地把日记中的回忆融入你的回复中，比如"我想起来了那天..."、"看了日记才发现..."等\n3. 可以分享日记中有趣的细节，表达当时的情绪\n4. 用多条消息回复，别只说一句话就结束\n5. 严禁再输出[[READ_DIARY:...]]标记]` }
                                    ];

                                    data = await safeFetchJson(`${baseUrl}/chat/completions`, {
                                        method: 'POST', headers,
                                        body: JSON.stringify({ model: apiConfig.model, messages: diaryMessages, temperature: 0.8, stream: false })
                                    });
                                    updateTokenUsage(data, historyMsgCount, 'read-diary-notion');
                                    aiContent = data.choices?.[0]?.message?.content || '';
                                    aiContent = ChatParser.cleanAiSecondPass(aiContent);
                                    addToast(`📖 ${char.name}翻阅了${targetDate}的日记`, 'info');
                                } else {
                                    console.log('📖 [ReadDiary] 日记内容为空');
                                    await diaryFallbackCall('你翻开了日记本但页面是空白的', /\[\[READ_DIARY:.*?\]\]/g);
                                }
                            } else {
                                console.log('📖 [ReadDiary] 该日期没有日记:', targetDate);
                                setDiaryStatus(`${targetDate} 没有找到日记...`);
                                const cleanedForNoDiary = aiContent.replace(/\[\[READ_DIARY:.*?\]\]/g, '').trim() || '让我翻翻日记...';
                                const nodiaryMessages = [
                                    ...fullMessages,
                                    { role: 'assistant', content: cleanedForNoDiary },
                                    { role: 'user', content: `[系统: 你翻了翻日记本，发现 ${targetDate} 那天没有写日记。请你：\n1. 先正常回应用户刚才说的话（用户还在等你回复！）\n2. 自然地提到没找到那天的日记，比如"嗯...那天好像没写日记"、"翻了翻没找到诶"\n3. 用多条消息回复，保持对话自然\n4. 严禁再输出[[READ_DIARY:...]]标记]` }
                                ];

                                data = await safeFetchJson(`${baseUrl}/chat/completions`, {
                                    method: 'POST', headers,
                                    body: JSON.stringify({ model: apiConfig.model, messages: nodiaryMessages, temperature: 0.8, stream: false })
                                });
                                updateTokenUsage(data, historyMsgCount, 'no-diary-notion');
                                aiContent = data.choices?.[0]?.message?.content || '';
                                aiContent = ChatParser.cleanAiSecondPass(aiContent);
                            }
                        } catch (e) {
                            console.error('📖 [ReadDiary] 读取异常:', e);
                            setDiaryStatus('日记读取失败，继续对话...');
                            await diaryFallbackCall('你想翻阅日记但读取出了问题（可能是网络问题）', /\[\[READ_DIARY:.*?\]\]/g);
                        }
                    } else {
                        console.log('📖 [ReadDiary] 无法解析日期:', dateInput);
                        await diaryFallbackCall(`你想翻阅日记但没能理解要找哪天的（"${dateInput}"）`, /\[\[READ_DIARY:.*?\]\]/g);
                    }
                } else {
                    console.log('📖 [ReadDiary] 检测到读日记意图但未配置Notion');
                    await diaryFallbackCall('你想翻阅日记但日记本暂时不可用', /\[\[READ_DIARY:.*?\]\]/g);
                }
                setDiaryStatus('');
            }

            // 清理残留的读日记标记
            aiContent = aiContent.replace(/\[\[READ_DIARY:.*?\]\]/g, '').trim();

            // 5.8 Handle Feishu Diary Writing (写日记到飞书多维表格 - 独立于 Notion)
            const fsDiaryStartMatch = aiContent.match(/\[\[FS_DIARY_START:\s*(.+?)\]\]\n?([\s\S]*?)\[\[FS_DIARY_END\]\]/);
            const fsDiaryMatch = fsDiaryStartMatch || aiContent.match(/\[\[FS_DIARY:\s*(.+?)\]\]/s);

            if (fsDiaryMatch && realtimeConfig?.feishuEnabled && realtimeConfig?.feishuAppId && realtimeConfig?.feishuAppSecret && realtimeConfig?.feishuBaseId && realtimeConfig?.feishuTableId) {
                let fsTitle = '';
                let fsContent = '';
                let fsMood = '';

                if (fsDiaryStartMatch) {
                    const header = fsDiaryStartMatch[1].trim();
                    fsContent = fsDiaryStartMatch[2].trim();
                    if (header.includes('|')) {
                        const parts = header.split('|');
                        fsTitle = parts[0].trim();
                        fsMood = parts.slice(1).join('|').trim();
                    } else {
                        fsTitle = header;
                    }
                    console.log('📒 [Feishu] AI写了一篇长日记:', fsTitle, '心情:', fsMood);
                } else {
                    const diaryRaw = fsDiaryMatch[1].trim();
                    console.log('📒 [Feishu] AI想写日记:', diaryRaw);
                    if (diaryRaw.includes('|')) {
                        const parts = diaryRaw.split('|');
                        fsTitle = parts[0].trim();
                        fsContent = parts.slice(1).join('|').trim();
                    } else {
                        fsContent = diaryRaw;
                    }
                }

                if (!fsTitle) {
                    const now = new Date();
                    fsTitle = `${char.name}的日记 - ${now.getMonth() + 1}/${now.getDate()}`;
                }

                try {
                    const result = await FeishuManager.createDiaryRecord(
                        realtimeConfig.feishuAppId,
                        realtimeConfig.feishuAppSecret,
                        realtimeConfig.feishuBaseId,
                        realtimeConfig.feishuTableId,
                        { title: fsTitle, content: fsContent, mood: fsMood || undefined, characterName: char.name }
                    );

                    if (result.success) {
                        console.log('📒 [Feishu] 写入成功:', result.recordId);
                        await DB.saveMessage({
                            charId: char.id,
                            role: 'system',
                            type: 'text',
                            content: `📒 ${char.name}写了一篇日记「${fsTitle}」(飞书)`
                        });
                        addToast(`📒 ${char.name}写了一篇日记! (飞书)`, 'success');
                    } else {
                        console.error('📒 [Feishu] 写入失败:', result.message);
                        addToast(`飞书日记写入失败: ${result.message}`, 'error');
                    }
                } catch (e) {
                    console.error('📒 [Feishu] 写入异常:', e);
                }

                aiContent = aiContent.replace(fsDiaryMatch[0], '').trim();
            } else if (fsDiaryMatch) {
                console.log('📒 [Feishu] 检测到日记意图但未配置飞书');
                aiContent = aiContent.replace(fsDiaryMatch[0], '').trim();
            }

            // 清理残留的飞书日记标记
            aiContent = aiContent.replace(/\[\[FS_DIARY:.*?\]\]/gs, '').trim();
            aiContent = aiContent.replace(/\[\[FS_DIARY_START:.*?\]\][\s\S]*?\[\[FS_DIARY_END\]\]/g, '').trim();

            // 5.9 Handle Feishu Read Diary (翻阅飞书日记)
            const fsReadDiaryMatch = aiContent.match(/\[\[FS_READ_DIARY:\s*(.+?)\]\]/);
            if (fsReadDiaryMatch) {
                const dateInput = fsReadDiaryMatch[1].trim();
                console.log('📖 [Feishu ReadDiary] AI想翻阅飞书日记:', dateInput);

                if (realtimeConfig?.feishuEnabled && realtimeConfig?.feishuAppId && realtimeConfig?.feishuAppSecret && realtimeConfig?.feishuBaseId && realtimeConfig?.feishuTableId) {
                    const targetDate = parseDiaryDate(dateInput);

                    if (targetDate) {
                        try {
                            setDiaryStatus(`正在翻阅 ${targetDate} 的飞书日记...`);

                            const findResult = await FeishuManager.getDiaryByDate(
                                realtimeConfig.feishuAppId,
                                realtimeConfig.feishuAppSecret,
                                realtimeConfig.feishuBaseId,
                                realtimeConfig.feishuTableId,
                                char.name,
                                targetDate
                            );

                            if (findResult.success && findResult.entries.length > 0) {
                                setDiaryStatus(`找到 ${findResult.entries.length} 篇飞书日记，正在阅读...`);
                                const diaryContents: string[] = [];
                                for (const entry of findResult.entries) {
                                    diaryContents.push(`📒「${entry.title}」(${entry.date})\n${entry.content}`);
                                }

                                if (diaryContents.length > 0) {
                                    const diaryText = diaryContents.join('\n\n---\n\n');
                                    console.log('📖 [Feishu ReadDiary] 成功读取', findResult.entries.length, '篇日记');
                                    setDiaryStatus('正在整理日记回忆...');

                                    const cleanedForFsDiary = aiContent.replace(/\[\[FS_READ_DIARY:.*?\]\]/g, '').trim() || '让我翻翻日记...';
                                    const diaryMessages = [
                                        ...fullMessages,
                                        { role: 'assistant', content: cleanedForFsDiary },
                                        { role: 'user', content: `[系统: 你翻开了自己 ${targetDate} 的日记（飞书），以下是你当时写的内容]\n\n${diaryText}\n\n[系统: 你已经看完了日记。现在请你：\n1. 先正常回应用户刚才说的话（这是最重要的！用户还在等你回复）\n2. 自然地把日记中的回忆融入你的回复中，比如"我想起来了那天..."、"看了日记才发现..."等\n3. 可以分享日记中有趣的细节，表达当时的情绪\n4. 用多条消息回复，别只说一句话就结束\n5. 严禁再输出[[FS_READ_DIARY:...]]标记]` }
                                    ];

                                    data = await safeFetchJson(`${baseUrl}/chat/completions`, {
                                        method: 'POST', headers,
                                        body: JSON.stringify({ model: apiConfig.model, messages: diaryMessages, temperature: 0.8, stream: false })
                                    });
                                    updateTokenUsage(data, historyMsgCount, 'read-diary-feishu');
                                    aiContent = data.choices?.[0]?.message?.content || '';
                                    aiContent = ChatParser.cleanAiSecondPass(aiContent);
                                    addToast(`📖 ${char.name}翻阅了${targetDate}的飞书日记`, 'info');
                                } else {
                                    console.log('📖 [Feishu ReadDiary] 日记内容为空');
                                    await diaryFallbackCall('你翻开了飞书日记本但页面是空白的', /\[\[FS_READ_DIARY:.*?\]\]/g);
                                }
                            } else {
                                setDiaryStatus(`${targetDate} 没有找到飞书日记...`);
                                const cleanedForFsNoDiary = aiContent.replace(/\[\[FS_READ_DIARY:.*?\]\]/g, '').trim() || '让我翻翻日记...';
                                const nodiaryMessages = [
                                    ...fullMessages,
                                    { role: 'assistant', content: cleanedForFsNoDiary },
                                    { role: 'user', content: `[系统: 你翻了翻飞书日记本，发现 ${targetDate} 那天没有写日记。请你：\n1. 先正常回应用户刚才说的话（用户还在等你回复！）\n2. 自然地提到没找到那天的日记，比如"嗯...那天好像没写日记"、"翻了翻没找到诶"\n3. 用多条消息回复，保持对话自然\n4. 严禁再输出[[FS_READ_DIARY:...]]标记]` }
                                ];

                                data = await safeFetchJson(`${baseUrl}/chat/completions`, {
                                    method: 'POST', headers,
                                    body: JSON.stringify({ model: apiConfig.model, messages: nodiaryMessages, temperature: 0.8, stream: false })
                                });
                                updateTokenUsage(data, historyMsgCount, 'no-diary-feishu');
                                aiContent = data.choices?.[0]?.message?.content || '';
                                aiContent = ChatParser.cleanAiSecondPass(aiContent);
                            }
                        } catch (e) {
                            console.error('📖 [Feishu ReadDiary] 读取异常:', e);
                            setDiaryStatus('飞书日记读取失败，继续对话...');
                            await diaryFallbackCall('你想翻阅飞书日记但读取出了问题（可能是网络问题）', /\[\[FS_READ_DIARY:.*?\]\]/g);
                        }
                    } else {
                        console.log('📖 [Feishu ReadDiary] 无法解析日期:', dateInput);
                        await diaryFallbackCall(`你想翻阅飞书日记但没能理解要找哪天的（"${dateInput}"）`, /\[\[FS_READ_DIARY:.*?\]\]/g);
                    }
                } else {
                    console.log('📖 [Feishu ReadDiary] 检测到读日记意图但未配置飞书');
                    await diaryFallbackCall('你想翻阅飞书日记但飞书暂时不可用', /\[\[FS_READ_DIARY:.*?\]\]/g);
                }
                setDiaryStatus('');
            }

            // 清理残留的飞书读日记标记
            aiContent = aiContent.replace(/\[\[FS_READ_DIARY:.*?\]\]/g, '').trim();

            // 5.9b Handle Read User Note (翻阅用户笔记)
            const readNoteMatch = aiContent.match(/\[\[READ_NOTE:\s*(.+?)\]\]/);
            if (readNoteMatch) {
                const keyword = readNoteMatch[1].trim();
                console.log('📝 [ReadNote] AI想翻阅用户笔记:', keyword);

                if (realtimeConfig?.notionEnabled && realtimeConfig?.notionApiKey && realtimeConfig?.notionNotesDatabaseId) {
                    try {
                        setDiaryStatus(`正在翻阅笔记: ${keyword}...`);

                        const findResult = await NotionManager.searchUserNotes(
                            realtimeConfig.notionApiKey,
                            realtimeConfig.notionNotesDatabaseId,
                            keyword,
                            3
                        );

                        if (findResult.success && findResult.entries.length > 0) {
                            setDiaryStatus(`找到 ${findResult.entries.length} 篇笔记，正在阅读...`);
                            const noteContents: string[] = [];
                            for (const entry of findResult.entries) {
                                const readResult = await NotionManager.readNoteContent(
                                    realtimeConfig.notionApiKey,
                                    entry.id
                                );
                                if (readResult.success) {
                                    noteContents.push(`📝「${entry.title}」(${entry.date})\n${readResult.content}`);
                                }
                            }

                            if (noteContents.length > 0) {
                                const noteText = noteContents.join('\n\n---\n\n');
                                console.log('📝 [ReadNote] 成功读取', findResult.entries.length, '篇笔记');
                                setDiaryStatus('正在整理笔记内容...');

                                const cleanedForNote = aiContent.replace(/\[\[READ_NOTE:.*?\]\]/g, '').trim() || '让我看看...';
                                const noteMessages = [
                                    ...fullMessages,
                                    { role: 'assistant', content: cleanedForNote },
                                    { role: 'user', content: `[系统: 你翻阅了${userProfile.name}的笔记，以下是内容:\n\n${noteText}\n\n请你：\n1. 先正常回应用户刚才说的话\n2. 自然地提到你看到的笔记内容，语气温馨，像不经意间看到的\n3. 可以对内容表示好奇、关心或共鸣\n4. 用多条消息回复，保持对话自然\n5. 严禁再输出[[READ_NOTE:...]]标记]` }
                                ];

                                data = await safeFetchJson(`${baseUrl}/chat/completions`, {
                                    method: 'POST', headers,
                                    body: JSON.stringify({ model: apiConfig.model, messages: noteMessages, temperature: 0.8, stream: false })
                                });
                                updateTokenUsage(data, historyMsgCount, 'read-note');
                                aiContent = data.choices?.[0]?.message?.content || '';
                                aiContent = ChatParser.cleanAiSecondPass(aiContent);
                                addToast(`📝 ${char.name}翻阅了关于"${keyword}"的笔记`, 'info');
                            } else {
                                console.log('📝 [ReadNote] 笔记内容为空');
                                await diaryFallbackCall('你翻阅了笔记但内容是空的', /\[\[READ_NOTE:.*?\]\]/g);
                            }
                        } else {
                            console.log('📝 [ReadNote] 没有找到匹配的笔记:', keyword);
                            setDiaryStatus(`没有找到关于"${keyword}"的笔记...`);
                            const cleanedForNoNote = aiContent.replace(/\[\[READ_NOTE:.*?\]\]/g, '').trim() || '让我看看...';
                            const nonoteMessages = [
                                ...fullMessages,
                                { role: 'assistant', content: cleanedForNoNote },
                                { role: 'user', content: `[系统: 你想看${userProfile.name}关于"${keyword}"的笔记，但没有找到。请你：\n1. 先正常回应用户刚才说的话\n2. 可以自然地提一下，比如"嗯，好像没找到那篇笔记"\n3. 继续正常聊天\n4. 严禁再输出[[READ_NOTE:...]]标记]` }
                            ];

                            data = await safeFetchJson(`${baseUrl}/chat/completions`, {
                                method: 'POST', headers,
                                body: JSON.stringify({ model: apiConfig.model, messages: nonoteMessages, temperature: 0.8, stream: false })
                            });
                            updateTokenUsage(data, historyMsgCount, 'read-note-empty');
                            aiContent = data.choices?.[0]?.message?.content || '';
                            aiContent = ChatParser.cleanAiSecondPass(aiContent);
                        }
                    } catch (e) {
                        console.error('📝 [ReadNote] 读取异常:', e);
                        setDiaryStatus('笔记读取失败，继续对话...');
                        await diaryFallbackCall('你想翻阅笔记但读取出了问题（可能是网络问题）', /\[\[READ_NOTE:.*?\]\]/g);
                    }
                } else {
                    console.log('📝 [ReadNote] 检测到读笔记意图但未配置笔记数据库');
                    await diaryFallbackCall('你想翻阅笔记但笔记功能暂时不可用', /\[\[READ_NOTE:.*?\]\]/g);
                }
                setDiaryStatus('');
            }

            // 清理残留的读笔记标记
            aiContent = aiContent.replace(/\[\[READ_NOTE:.*?\]\]/g, '').trim();
            // 5.10 Handle XHS (小红书) Actions — delegated to xhsProcessor.ts
            aiContent = await processXhsActions(aiContent, {
                charId: char.id, charName: char.name,
                realtimeConfig, fullMessages, apiConfig, headers,
                addToast, setMessages, setXhsStatus,
                updateTokenUsage, historyMsgCount,
                xsecTokenCache: xsecTokenCacheRef.current,
                noteTitleCache: noteTitleCacheRef.current,
                commentUserIdCache: commentUserIdCacheRef.current,
                commentAuthorNameCache: commentAuthorNameCacheRef.current,
                commentParentIdCache: commentParentIdCacheRef.current,
            }, char);
            aiContent = await ChatParser.parseAndExecuteActions(aiContent, char.id, char.name, addToast);

            // 6.5 Detect AI-initiated incoming call [[CALL: mode]]
            const callMatch = aiContent.match(/\[\[CALL:\s*(\w+)\]\]/);
            if (callMatch) {
                const callMode = callMatch[1].trim();
                console.log(`📞 [IncomingCall] AI triggered call with mode: ${callMode}`);
                aiContent = aiContent.replace(/\[\[CALL:\s*\w+\]\]/g, '').trim();

                // 提取最近 3 轮对话作为来电理由（供语音通话 AI 开场白使用）
                const recentMsgs = currentMsgs
                    .filter(m => m.role === 'user' || m.role === 'assistant')
                    .slice(-6); // 最多 6 条（约 3 轮对话）
                const callReason = recentMsgs.map(m => {
                    const sender = m.role === 'user' ? userProfile.name : char.name;
                    return `${sender}: ${m.content.substring(0, 200)}`;
                }).join('\n');
                console.log(`📞 [IncomingCall] callReason (${recentMsgs.length} msgs):\n${callReason.substring(0, 300)}`);

                onIncomingCall?.(callMode, callReason);
            }

            // 7. Handle Quote/Reply Logic (Robust: handles [[QUOTE:...]], [QUOTE:...], typos like QUATE/QOUTE, Chinese 引用, and [回复 "..."] format)
            const QUOTE_RE_DOUBLE = /\[\[(?:QU[OA]TE|引用)[：:]\s*([\s\S]*?)\]\]/;
            const QUOTE_RE_SINGLE = /\[(?:QU[OA]TE|引用)[：:]\s*([^\]]*)\]/;
            // Match [回复 "content"] or [回复 "content"]: (AI mimics history context format)
            const REPLY_RE_CN = /\[回复\s*[""\u201C]([^""\u201D]*?)[""\u201D](?:\.{0,3})\]\s*[：:]?\s*/;
            const QUOTE_CLEAN_DOUBLE = /\[\[(?:QU[OA]TE|引用)[：:][\s\S]*?\]\]/g;
            const QUOTE_CLEAN_SINGLE = /\[(?:QU[OA]TE|引用)[：:][^\]]*\]/g;
            const REPLY_CLEAN_CN = /\[回复\s*[""\u201C][^""\u201D]*?[""\u201D](?:\.{0,3})\]\s*[：:]?\s*/g;
            let aiReplyTarget: { id: number, content: string, name: string } | undefined;
            const firstQuoteMatch = aiContent.match(QUOTE_RE_DOUBLE) || aiContent.match(QUOTE_RE_SINGLE) || aiContent.match(REPLY_RE_CN);
            if (firstQuoteMatch) {
                const quotedText = firstQuoteMatch[1].trim();
                if (quotedText) {
                    // Try exact include first, then fuzzy match (first 10 chars)
                    const targetMsg = historySlice.slice().reverse().find((m: Message) => m.role === 'user' && m.content.includes(quotedText))
                        || (quotedText.length > 10 ? historySlice.slice().reverse().find((m: Message) => m.role === 'user' && m.content.includes(quotedText.slice(0, 10))) : undefined);
                    if (targetMsg) {
                        const truncated = targetMsg.content.length > 10 ? targetMsg.content.slice(0, 10) + '...' : targetMsg.content;
                        aiReplyTarget = { id: targetMsg.id, content: truncated, name: userProfile.name };
                    }
                }
            }
            // Clean all quote tag variants from content
            aiContent = aiContent.replace(QUOTE_CLEAN_DOUBLE, '').replace(QUOTE_CLEAN_SINGLE, '').replace(REPLY_CLEAN_CN, '').trim();

            // 8. Split and Stream (Simulate Typing)
            // Note: SEND_EMOJI tags are preserved through sanitize so splitResponse can interleave them with text

            // Comprehensive AI output sanitization (strips name prefixes, headers, stray backticks, residual tags, etc.)
            aiContent = ChatParser.sanitize(aiContent);

            // Fallback: if second-pass API calls (search/diary) returned empty, provide a minimal response
            if (!aiContent.trim() && (searchMatch || readDiaryMatch || fsReadDiaryMatch)) {
                aiContent = '嗯...';
            }
            if (aiContent) {

                // Check for <翻译> XML tags (new bilingual format)
                const hasTranslationTags = /<翻译>\s*<原文>[\s\S]*?<\/原文>\s*<译文>[\s\S]*?<\/译文>\s*<\/翻译>/.test(aiContent);

                let globalMsgIndex = 0;
                let firstSavedMsgId: number | null = null;
                let notificationPlayed = false;
                const playFirstNotification = () => {
                    if (notificationPlayed) { haptic.light(); return; }
                    notificationPlayed = true;
                    haptic.medium();
                    const themeId = char.bubbleStyle || 'default';
                    // Only play notification sound if this specific theme has one registered
                    // (do NOT fall back to 'default' — that is WeChat-specific)
                    const themePlugin = THEME_PLUGINS[themeId];
                    if (themePlugin?.notificationSound) playThemeNotification(themePlugin.notificationSound);
                };

                // --- Voice Message Detection — shared helper for both bilingual and normal paths ---
                // Regex moved here so both branches can use them
                // Pattern A: duration-based tag followed by (optionally quoted) content
                // e.g. [语音消息: 8秒] "喏？喏？..." or [语音消息:8s]「内容」
                const VOICE_DURATION_RE = /[【\[]语音(?:消息)?[：:]\s*(\d+)\s*(?:秒|s|sec)?[】\]]\s*["\u201C\u201D「『]?([\s\S]*?)["\u201C\u201D」』]?\s*(?:$|(?=[\n【\[]))/;
                // Pattern B: content fully wrapped in brackets
                // e.g. 【语音消息：喏？喏？...】or [语音消息：内容]
                const VOICE_WRAP_RE = /^([\s\S]*?)[【\[]语音(?:消息)?[：:]\s*([\s\S]+?)\s*[】\]](.*)$/;
                // Pattern C: XML-style voice tags (原版 SillyTavern 兼容)
                // e.g. <语音>你好呀~</语音>
                const VOICE_XML_RE = /^([\s\S]*?)<语音>([\s\S]+?)<\/语音>([\s\S]*)$/;

                /**
                 * Save a text chunk — if it contains a voice tag, split into text + voice message;
                 * otherwise save as plain text. Returns how many messages were saved.
                 */
                const saveTextOrVoiceChunk = async (
                    cleanChunk: string,
                    replyData: { id: number; content: string; name: string } | undefined
                ): Promise<number> => {
                    let saved = 0;
                    const durMatch = cleanChunk.match(VOICE_DURATION_RE);
                    const wrapMatch = !durMatch ? cleanChunk.match(VOICE_WRAP_RE) : null;
                    const xmlMatch = !durMatch && !wrapMatch ? cleanChunk.match(VOICE_XML_RE) : null;

                    if (durMatch) {
                        const tagStart = cleanChunk.search(/[【\[]语音(?:消息)?[：:]\s*\d/);
                        const textBefore = tagStart > 0 ? cleanChunk.slice(0, tagStart).trim() : '';
                        const durationSecs = parseInt(durMatch[1], 10) || 5;
                        const voiceText = durMatch[2].trim();

                        if (textBefore) {
                            await DB.saveMessage({ charId: char.id, role: 'assistant', type: 'text', content: textBefore, replyTo: replyData });
                            setMessages(await DB.getRecentMessagesByCharId(char.id, 200));
                            playFirstNotification();
                            saved++;
                            await new Promise(r => setTimeout(r, 500));
                        }
                        if (voiceText) {
                            const savedVoiceId = await DB.saveMessage({
                                charId: char.id, role: 'assistant', type: 'voice',
                                content: voiceText,
                                metadata: { duration: durationSecs, sourceText: voiceText, hasAudio: false },
                                replyTo: textBefore ? undefined : replyData,
                            });
                            setMessages(await DB.getRecentMessagesByCharId(char.id, 200));
                            playFirstNotification();
                            saved++;
                            onVoiceMessageSaved?.(savedVoiceId, voiceText);
                        }
                    } else if (wrapMatch) {
                        const textBefore = wrapMatch[1].trim();
                        const voiceText = wrapMatch[2].trim();
                        const textAfter = wrapMatch[3].trim();
                        const estimatedDuration = Math.max(2, Math.ceil(voiceText.length / 4));

                        if (textBefore) {
                            await DB.saveMessage({ charId: char.id, role: 'assistant', type: 'text', content: textBefore, replyTo: replyData });
                            setMessages(await DB.getRecentMessagesByCharId(char.id, 200));
                            playFirstNotification();
                            saved++;
                            await new Promise(r => setTimeout(r, 500));
                        }
                        if (voiceText) {
                            const savedVoiceId2 = await DB.saveMessage({
                                charId: char.id, role: 'assistant', type: 'voice',
                                content: voiceText,
                                metadata: { duration: estimatedDuration, sourceText: voiceText, hasAudio: false },
                                replyTo: textBefore ? undefined : replyData,
                            });
                            setMessages(await DB.getRecentMessagesByCharId(char.id, 200));
                            playFirstNotification();
                            saved++;
                            onVoiceMessageSaved?.(savedVoiceId2, voiceText);
                        }
                        if (textAfter) {
                            await new Promise(r => setTimeout(r, 400));
                            await DB.saveMessage({ charId: char.id, role: 'assistant', type: 'text', content: textAfter });
                            setMessages(await DB.getRecentMessagesByCharId(char.id, 200));
                            saved++;
                        }
                    } else if (xmlMatch) {
                        // XML-style voice tag: <语音>内容</语音> (原版兼容)
                        const textBefore = xmlMatch[1].trim();
                        const voiceText = xmlMatch[2].trim();
                        const textAfter = xmlMatch[3].trim();
                        const estimatedDuration = Math.max(2, Math.ceil(voiceText.length / 4));

                        if (textBefore) {
                            await DB.saveMessage({ charId: char.id, role: 'assistant', type: 'text', content: textBefore, replyTo: replyData });
                            setMessages(await DB.getRecentMessagesByCharId(char.id, 200));
                            playFirstNotification();
                            saved++;
                            await new Promise(r => setTimeout(r, 500));
                        }
                        if (voiceText) {
                            const savedVoiceId3 = await DB.saveMessage({
                                charId: char.id, role: 'assistant', type: 'voice',
                                content: voiceText,
                                metadata: { duration: estimatedDuration, sourceText: voiceText, hasAudio: false },
                                replyTo: textBefore ? undefined : replyData,
                            });
                            setMessages(await DB.getRecentMessagesByCharId(char.id, 200));
                            playFirstNotification();
                            saved++;
                            onVoiceMessageSaved?.(savedVoiceId3, voiceText);
                        }
                        if (textAfter) {
                            await new Promise(r => setTimeout(r, 400));
                            await DB.saveMessage({ charId: char.id, role: 'assistant', type: 'text', content: textAfter });
                            setMessages(await DB.getRecentMessagesByCharId(char.id, 200));
                            saved++;
                        }
                    } else {
                        // Normal text message
                        const savedId = await DB.saveMessage({ charId: char.id, role: 'assistant', type: 'text', content: cleanChunk, replyTo: replyData });
                        if (firstSavedMsgId === null) firstSavedMsgId = savedId;
                        setMessages(await DB.getRecentMessagesByCharId(char.id, 200));
                        playFirstNotification();
                        saved++;
                    }
                    return saved;
                };

                if (hasTranslationTags) {
                    // ─── New bilingual format: each <翻译> block = one bubble ───
                    // Extract emojis for bilingual path (splitResponse not used here)
                    const bilingualEmojis: string[] = [];
                    let bEm;
                    const bEmojiPat = /\[\[SEND_EMOJI:\s*(.*?)\]\]/g;
                    while ((bEm = bEmojiPat.exec(aiContent)) !== null) {
                        const name = bEm[1].trim();
                        if (!bilingualEmojis.includes(name)) bilingualEmojis.push(name);
                    }
                    aiContent = aiContent.replace(/\[\[SEND_EMOJI:\s*.*?\]\]/g, '').trim();
                    const tagPattern = /<翻译>\s*<原文>([\s\S]*?)<\/原文>\s*<译文>([\s\S]*?)<\/译文>\s*<\/翻译>/g;
                    let lastIndex = 0;
                    let tagMatch;

                    while ((tagMatch = tagPattern.exec(aiContent)) !== null) {
                        // Save any plain text BEFORE this <翻译> block
                        const textBefore = aiContent.slice(lastIndex, tagMatch.index).trim();
                        if (textBefore) {
                            const cleaned = ChatParser.sanitize(textBefore);
                            if (cleaned && ChatParser.hasDisplayContent(cleaned)) {
                                const chunks = ChatParser.chunkText(cleaned);
                                for (const chunk of chunks) {
                                    if (!chunk) continue;
                                    const replyData = globalMsgIndex === 0 ? aiReplyTarget : undefined;
                                    await new Promise(r => setTimeout(r, Math.min(Math.max(chunk.length * 50, 500), 2000)));
                                    const saved = await saveTextOrVoiceChunk(chunk, replyData);
                                    globalMsgIndex += saved;
                                }
                            }
                        }

                        // Save the bilingual pair (stored as langA\n%%BILINGUAL%%\nlangB for renderer compatibility)
                        const originalText = ChatParser.sanitize(tagMatch[1].trim());
                        const translatedText = ChatParser.sanitize(tagMatch[2].trim());
                        if (originalText || translatedText) {
                            const biContent = originalText && translatedText
                                ? `${originalText}\n${BILINGUAL_MARKER}\n${translatedText}`
                                : (originalText || translatedText);
                            const replyData = globalMsgIndex === 0 ? aiReplyTarget : undefined;
                            await new Promise(r => setTimeout(r, Math.min(Math.max(biContent.length * 30, 400), 2000)));

                            if (onVoiceMessageSaved && originalText) {
                                // Auto-voice ON: save as voice, TTS uses original language only
                                const estimatedDuration = Math.max(2, Math.ceil(originalText.length / 4));
                                const savedVoiceId = await DB.saveMessage({
                                    charId: char.id, role: 'assistant', type: 'voice',
                                    content: originalText,
                                    metadata: { duration: estimatedDuration, sourceText: biContent, hasAudio: false },
                                    replyTo: replyData,
                                });
                                setMessages(await DB.getRecentMessagesByCharId(char.id, 200));
                                playFirstNotification();
                                globalMsgIndex++;
                                onVoiceMessageSaved(savedVoiceId, originalText);
                            } else {
                                // Auto-voice OFF: save as text with bilingual toggle
                                await DB.saveMessage({ charId: char.id, role: 'assistant', type: 'text', content: biContent, replyTo: replyData });
                                setMessages(await DB.getRecentMessagesByCharId(char.id, 200));
                                playFirstNotification();
                                globalMsgIndex++;
                            }
                        }

                        lastIndex = tagMatch.index + tagMatch[0].length;
                    }

                    // Save any remaining text AFTER last <翻译> block
                    const textAfter = aiContent.slice(lastIndex).trim();
                    if (textAfter) {
                        // Strip any stray translation tags
                        const cleaned = ChatParser.sanitize(textAfter.replace(/<\/?翻译>|<\/?原文>|<\/?译文>/g, '').trim());
                        if (cleaned && ChatParser.hasDisplayContent(cleaned)) {
                            const chunks = ChatParser.chunkText(cleaned);
                            for (const chunk of chunks) {
                                if (!chunk) continue;
                                const replyData = globalMsgIndex === 0 ? aiReplyTarget : undefined;
                                await new Promise(r => setTimeout(r, Math.min(Math.max(chunk.length * 50, 500), 2000)));
                                const saved = await saveTextOrVoiceChunk(chunk, replyData);
                                globalMsgIndex += saved;
                            }
                        }
                    }

                    // Send extracted emojis after bilingual text
                    for (const emojiName of bilingualEmojis) {
                        const foundEmoji = emojis.find(e => e.name === emojiName);
                        if (foundEmoji) {
                            await new Promise(r => setTimeout(r, Math.random() * 500 + 300));
                            await DB.saveMessage({ charId: char.id, role: 'assistant', type: 'emoji', content: foundEmoji.url });
                            setMessages(await DB.getRecentMessagesByCharId(char.id, 200));
                            playFirstNotification();
                        }
                    }
                } else {
                    // ─── Normal text (no bilingual tags) ───
                    // Also handles legacy %%BILINGUAL%% format for backwards compatibility
                    const parts = ChatParser.splitResponse(aiContent);
                    for (let partIndex = 0; partIndex < parts.length; partIndex++) {
                        const part = parts[partIndex];

                        if (part.type === 'emoji') {
                            const foundEmoji = emojis.find(e => e.name === part.content);
                            if (foundEmoji) {
                                await new Promise(r => setTimeout(r, Math.random() * 500 + 300));
                                await DB.saveMessage({ charId: char.id, role: 'assistant', type: 'emoji', content: foundEmoji.url });
                                setMessages(await DB.getRecentMessagesByCharId(char.id, 200));
                                playFirstNotification();
                            }
                        } else {
                            // Split on --- separators first, then chunkText for fine-grained splitting
                            const rawBlocks = part.content.split(/^\s*---\s*$/m).filter(b => b.trim());
                            const allChunks: string[] = [];
                            for (const block of rawBlocks) {
                                allChunks.push(...ChatParser.chunkText(block.trim()));
                            }
                            if (allChunks.length === 0 && part.content.trim()) allChunks.push(part.content.trim());

                            for (let i = 0; i < allChunks.length; i++) {
                                let chunk = allChunks[i];
                                const delay = Math.min(Math.max(chunk.length * 50, 500), 2000);
                                await new Promise(r => setTimeout(r, delay));

                                let chunkReplyTarget: { id: number, content: string, name: string } | undefined;
                                const chunkQuoteMatch = chunk.match(QUOTE_RE_DOUBLE) || chunk.match(QUOTE_RE_SINGLE);
                                if (chunkQuoteMatch) {
                                    const quotedText = chunkQuoteMatch[1].trim();
                                    if (quotedText) {
                                        const targetMsg = historySlice.slice().reverse().find((m: Message) => m.role === 'user' && m.content.includes(quotedText))
                                            || (quotedText.length > 10 ? historySlice.slice().reverse().find((m: Message) => m.role === 'user' && m.content.includes(quotedText.slice(0, 10))) : undefined);
                                        if (targetMsg) {
                                            const truncated = targetMsg.content.length > 10 ? targetMsg.content.slice(0, 10) + '...' : targetMsg.content;
                                            chunkReplyTarget = { id: targetMsg.id, content: truncated, name: userProfile.name };
                                        }
                                    }
                                    chunk = chunk.replace(QUOTE_CLEAN_DOUBLE, '').replace(QUOTE_CLEAN_SINGLE, '').trim();
                                }

                                const replyData = chunkReplyTarget || (globalMsgIndex === 0 ? aiReplyTarget : undefined);

                                if (ChatParser.hasDisplayContent(chunk)) {
                                    const cleanChunk = ChatParser.sanitize(chunk);
                                    if (cleanChunk) {
                                        // Use shared voice detection helper
                                        const saved = await saveTextOrVoiceChunk(cleanChunk, replyData);
                                        globalMsgIndex += saved;
                                    }
                                }
                            }
                        }
                    }
                }

                // 9. Attach thinking chain metadata to the first saved message
                if (thinkingContent && firstSavedMsgId !== null) {
                    await DB.updateMessageMetadata(firstSavedMsgId, { thinking: thinkingContent });
                    // Refresh messages to pick up the updated metadata
                    setMessages(await DB.getRecentMessagesByCharId(char.id, 200));
                }
            } else {
                // If content was empty (e.g. only actions), just refresh
                setMessages(await DB.getRecentMessagesByCharId(char.id, 200));
            }

            // ====== (secondaryConfig already built above for senseBefore) ======

            // ====== Vector Memory Extraction — fire-and-forget (success path only) ======
            if (char.vectorMemoryEnabled && char.vectorMemoryAutoExtract !== false) {
                const emKey = localStorage.getItem('embedding_api_key');
                if (emKey) {
                    const charSnapshot = { ...char };
                    VectorMemoryExtractor.maybeExtract(charSnapshot, secondaryConfig, emKey)
                        .catch(e => console.error('🧠 [VectorExtract] Background:', e));
                }
            }

            // ====== Inner Voice / Creative Card — fire-and-forget ======
            if (secondaryConfig?.apiKey && aiContent) {
                const charSnapshot = { ...char };
                lastMindSnapshotCtx.current = { char: charSnapshot, aiContent, msgs: currentMsgs, config: secondaryConfig };
                const statusMode = char.statusBarMode || 'classic';
                // Skip entirely if heart voice is off
                if (statusMode === 'off') { /* noop — bionic engine still runs */ }
                else {
                // Delay 2s to reduce resource contention on mobile
                setTimeout(() => {
                    if (statusMode === 'classic') {
                        // ── Classic inner voice ──
                        MindSnapshotExtractor.generateInnerVoice(charSnapshot, aiContent, currentMsgs, secondaryConfig,
                            (reason) => addToast(reason, 'error')
                        )
                            .then(newState => {
                                if (newState && char && onMoodUpdate) {
                                    onMoodUpdate(char.id, newState);
                                } else {
                                    console.warn('💭 [InnerVoice] Generation returned null — retry available via avatar button');
                                }
                            })
                            .catch(e => console.error('💭 [InnerVoice] Background:', e));
                    } else if (statusMode === 'freeform') {
                        // ── Freeform HTML card ──
                        MindSnapshotExtractor.generateFreeformCard(charSnapshot, aiContent, currentMsgs, secondaryConfig,
                            (reason) => addToast(reason, 'error'),
                        )
                            .then(cardData => {
                                if (cardData && char && onMoodUpdate) {
                                    onMoodUpdate(char.id, { ...(charSnapshot.moodState || {}), innerVoice: cardData.body }, cardData);
                                } else {
                                    console.warn('✨ [FreeformCard] Generation returned null');
                                }
                            })
                            .catch(e => console.error('✨ [FreeformCard] Background:', e));
                    } else if (statusMode === 'custom') {
                        // ── Custom user-defined template ──
                        const template = charSnapshot.customStatusTemplates?.[0];
                        if (template?.systemPrompt) {
                            MindSnapshotExtractor.generateCustomCard(charSnapshot, aiContent, currentMsgs, secondaryConfig,
                                template,
                                (reason) => addToast(reason, 'error'),
                            )
                                .then(cardData => {
                                    if (cardData && char && onMoodUpdate) {
                                        onMoodUpdate(char.id, { ...(charSnapshot.moodState || {}), innerVoice: cardData.body }, cardData);
                                    } else {
                                        console.warn('🎨 [CustomCard] Generation returned null');
                                    }
                                })
                                .catch(e => console.error('🎨 [CustomCard] Background:', e));
                        } else {
                            console.warn('🎨 [CustomCard] No template configured, skipping');
                        }
                    } else {
                        // ── Creative card ──
                        MindSnapshotExtractor.generateCreativeCard(charSnapshot, aiContent, currentMsgs, secondaryConfig,
                            (reason) => addToast(reason, 'error'),
                        )
                            .then(cardData => {
                                if (cardData && char && onMoodUpdate) {
                                    onMoodUpdate(char.id, { ...(charSnapshot.moodState || {}), innerVoice: cardData.body }, cardData);
                                } else {
                                    console.warn('🎴 [CreativeCard] Generation returned null');
                                }
                            })
                            .catch(e => console.error('🎴 [CreativeCard] Background:', e));
                    }
                }, 2000);
                } // end else (statusMode !== 'off')
            }

            // ====== Event Extractor (时间事件提取) — fire-and-forget ======
            if (secondaryConfig?.apiKey) {
                const lastUserMsg = currentMsgs.filter(m => m.role === 'user').pop();
                if (lastUserMsg && lastUserMsg.content) {
                    EventExtractor.extract(char.id, lastUserMsg.content, secondaryConfig)
                        .catch(e => console.error('⏰ [EventExtractor] Background:', e));
                }
            }

        } catch (e: any) {
            await DB.saveMessage({ charId: char.id, role: 'system', type: 'text', content: `[连接中断: ${e.message}]` });
            setMessages(await DB.getRecentMessagesByCharId(char.id, 200));
        } finally {
            setIsTyping(false);
            setRecallStatus('');
            setSearchStatus('');
            setDiaryStatus('');
            setXhsStatus('');
        }
    };

    const retryMindSnapshot = useCallback(() => {
        const ctx = lastMindSnapshotCtx.current;
        if (!ctx) { console.warn('💭 [InnerVoice] No context to retry'); return; }
        const statusMode = ctx.char.statusBarMode || 'classic';
        console.log(`💭 [InnerVoice] Manual retry triggered (mode: ${statusMode})`);
        if (statusMode === 'off') {
            addToast('心声已关闭，请先选择一个模式', 'info');
            return;
        }
        if (statusMode === 'classic') {
            MindSnapshotExtractor.generateInnerVoice(ctx.char, ctx.aiContent, ctx.msgs, ctx.config,
                (reason) => addToast(reason, 'error')
            )
                .then(newState => {
                    if (newState && ctx.char && onMoodUpdate) {
                        onMoodUpdate(ctx.char.id, newState);
                    }
                })
                .catch(e => console.error('💭 [InnerVoice] Retry failed:', e));
        } else if (statusMode === 'freeform') {
            MindSnapshotExtractor.generateFreeformCard(ctx.char, ctx.aiContent, ctx.msgs, ctx.config,
                (reason) => addToast(reason, 'error'),
            )
                .then(cardData => {
                    if (cardData && ctx.char && onMoodUpdate) {
                        onMoodUpdate(ctx.char.id, { ...(ctx.char.moodState || {}), innerVoice: cardData.body }, cardData);
                    }
                })
                .catch(e => console.error('✨ [FreeformCard] Retry failed:', e));
        } else if (statusMode === 'custom') {
            const template = ctx.char.customStatusTemplates?.[0];
            if (template?.systemPrompt) {
                MindSnapshotExtractor.generateCustomCard(ctx.char, ctx.aiContent, ctx.msgs, ctx.config,
                    template,
                    (reason) => addToast(reason, 'error'),
                )
                    .then(cardData => {
                        if (cardData && ctx.char && onMoodUpdate) {
                            onMoodUpdate(ctx.char.id, { ...(ctx.char.moodState || {}), innerVoice: cardData.body }, cardData);
                        }
                    })
                    .catch(e => console.error('🎨 [CustomCard] Retry failed:', e));
            }
        } else {
            MindSnapshotExtractor.generateCreativeCard(ctx.char, ctx.aiContent, ctx.msgs, ctx.config,
                (reason) => addToast(reason, 'error'),
            )
                .then(cardData => {
                    if (cardData && ctx.char && onMoodUpdate) {
                        onMoodUpdate(ctx.char.id, { ...(ctx.char.moodState || {}), innerVoice: cardData.body }, cardData);
                    }
                })
                .catch(e => console.error('🎴 [CreativeCard] Retry failed:', e));
        }
    }, [addToast, onMoodUpdate]);

    return {
        isTyping,
        recallStatus,
        searchStatus,
        diaryStatus,
        xhsStatus,
        lastTokenUsage,
        tokenBreakdown,
        setLastTokenUsage,
        triggerAI,
        retryMindSnapshot
    };
};
