import { ChatParser } from '../utils/chatParser';
import { safeFetchJson } from '../utils/safeApi';
import { RealtimeContextManager } from '../utils/realtimeContext';


export async function processRecall(
    aiContent: string,
    ctx: {
        char: any,
        fullMessages: any[],
        baseUrl: string,
        model: string,
        headers: any,
        historyMsgCount: number,
        addToast: (msg: string, type: 'info' | 'success' | 'error') => void,
        setRecallStatus: (s: string) => void,
        updateTokenUsage: (data: any, msgCount: number, pass: string) => void
    }
): Promise<string> {
    const recallMatch = aiContent.match(/\[\[RECALL:\s*(\d{4})[-/年](\d{1,2})\]\]/);
    if (recallMatch) {
        const year = recallMatch[1];
        const month = recallMatch[2];
        const targetMonth = `${year}-${month.padStart(2, '0')}`;

        const alreadyActive = ctx.char.activeMemoryMonths?.includes(targetMonth);

        if (alreadyActive) {
            console.log(`♻️ [Recall] ${targetMonth} already in activeMemoryMonths, skipping duplicate recall`);
            aiContent = aiContent.replace(/\[\[RECALL:\s*\d{4}[-/年]\d{1,2}\]\]/g, '').trim();
        } else {
            ctx.setRecallStatus(`正在调阅 ${year}年${month}月 的详细档案...`);

            const getDetailedLogs = (y: string, m: string) => {
                if (!ctx.char.memories) return null;
                const target = `${y}-${m.padStart(2, '0')}`;
                const logs = ctx.char.memories.filter((mem: any) => {
                    return mem.date.includes(target) || mem.date.includes(`${y}年${parseInt(m)}月`);
                });
                if (logs.length === 0) return null;
                return logs.map((mem: any) => `[${mem.date}] (${mem.mood || 'normal'}): ${mem.summary}`).join('\n');
            };

            const detailedLogs = getDetailedLogs(year, month);

            if (detailedLogs) {
                const recallMessages = [...ctx.fullMessages, { role: 'user', content: `[系统: 已成功调取 ${year}-${month} 的详细日志]\n${detailedLogs}\n[系统: 现在请结合这些细节回答用户。保持对话自然。]` }];
                try {
                    const data = await safeFetchJson(`${ctx.baseUrl}/chat/completions`, {
                        method: 'POST', headers: ctx.headers,
                        body: JSON.stringify({ model: ctx.model, messages: recallMessages, temperature: 0.8, stream: false })
                    });
                    ctx.updateTokenUsage(data, ctx.historyMsgCount, 'recall');
                    aiContent = data.choices?.[0]?.message?.content || '';
                    aiContent = ChatParser.cleanAiSecondPass(aiContent);
                    ctx.addToast(`已调用 ${year}-${month} 详细记忆`, 'info');
                } catch (recallErr: any) {
                    console.error('Recall API failed:', recallErr.message);
                }
            }
        }
    }
    ctx.setRecallStatus('');
    return aiContent;
}

export async function processSearch(
    aiContent: string,
    ctx: {
        realtimeConfig?: any,
        fullMessages: any[],
        baseUrl: string,
        model: string,
        headers: any,
        historyMsgCount: number,
        addToast: (msg: string, type: 'info' | 'success' | 'error') => void,
        setSearchStatus: (s: string) => void,
        updateTokenUsage: (data: any, msgCount: number, pass: string) => void
    }
): Promise<string> {
    const searchMatch = aiContent.match(/\[\[SEARCH:\s*(.+?)\]\]/);
    if (searchMatch && ctx.realtimeConfig?.newsEnabled && ctx.realtimeConfig?.newsApiKey) {
        const searchQuery = searchMatch[1].trim();
        console.log('🔍 [Search] AI触发搜索:', searchQuery);
        ctx.setSearchStatus(`正在搜索: ${searchQuery}...`);

        try {
            const searchResult = await RealtimeContextManager.performSearch(searchQuery, ctx.realtimeConfig.newsApiKey);
            console.log('🔍 [Search] 搜索结果:', searchResult);

            if (searchResult.success && searchResult.results.length > 0) {
                const resultsStr = searchResult.results.map((r: any, i: number) =>
                    `${i + 1}. ${r.title}\n   ${r.description}`
                ).join('\n\n');

                console.log('🔍 [Search] 注入结果到AI，重新生成回复...');

                const cleanedForSearch = aiContent.replace(/\[\[SEARCH:.*?\]\]/g, '').trim() || '让我搜一下...';
                const searchMessages = [
                    ...ctx.fullMessages,
                    { role: 'assistant', content: cleanedForSearch },
                    { role: 'user', content: `[系统: 搜索完成！以下是关于"${searchQuery}"的搜索结果]\n\n${resultsStr}\n\n[系统: 现在请根据这些真实信息回复用户。用自然的语气分享，比如"我刚搜了一下发现..."、"诶我看到说..."。不要再输出[[SEARCH:...]]了。]` }
                ];

                const data = await safeFetchJson(`${ctx.baseUrl}/chat/completions`, {
                    method: 'POST', headers: ctx.headers,
                    body: JSON.stringify({ model: ctx.model, messages: searchMessages, temperature: 0.8, stream: false })
                });
                ctx.updateTokenUsage(data, ctx.historyMsgCount, 'search');
                aiContent = data.choices?.[0]?.message?.content || '';
                console.log('🔍 [Search] AI基于搜索结果生成的新回复:', aiContent.slice(0, 100) + '...');
                aiContent = ChatParser.cleanAiSecondPass(aiContent);
                ctx.addToast(`🔍 搜索完成: ${searchQuery}`, 'success');
            } else {
                console.log('🔍 [Search] 搜索失败或无结果:', searchResult.message);
                ctx.addToast(`搜索失败: ${searchResult.message}`, 'error');
                aiContent = aiContent.replace(searchMatch[0], '').trim();
            }
        } catch (e) {
            console.error('Search execution failed:', e);
            aiContent = aiContent.replace(searchMatch[0], '').trim();
        }
    } else if (searchMatch) {
        console.log('🔍 [Search] 检测到搜索意图但未配置API Key');
        aiContent = aiContent.replace(searchMatch[0], '').trim();
    }
    ctx.setSearchStatus('');

    aiContent = aiContent.replace(/\[\[SEARCH:.*?\]\]/g, '').trim();
    return aiContent;
}
