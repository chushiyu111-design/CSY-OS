/**
 * Autonomous Agent — 自主决策引擎
 * 
 * 完全独立的管线：不修改主聊天 Prompt，不侵入 useChatAI。
 * 通过 DB.saveScheduledMessage 复用现有预制消息管道输出消息。
 * 通过 CustomEvent 触发来电。
 * 
 * 关闭方法：调用 start() 返回的 cleanup 函数即可一键停止，不留痕迹。
 */

import { DB } from './db';
import { getPendingEvents, PendingEvent } from './temporalContext';
import { ChatPrompts } from './chatPrompts';
import { CharacterProfile, APIConfig, Message, InternalState } from '../types';
import {
    resolveInternalState,
    computeActivationLevel,
    computeSalience,
    extractHormoneSnapshot,
    hormoneResonance,
} from './hormoneDynamics';
import { LocalNotifications } from '@capacitor/local-notifications';

// ═══════════════════════════════════════════════════════════════
//  429 无限重试 fetch
// ═══════════════════════════════════════════════════════════════

/**
 * 带 429 无限重试的 fetch。遇到 429 时指数退避重试直到成功。
 * 其他 HTTP 错误或网络异常会正常抛出/返回。
 */
async function fetchWithRetry(
    input: RequestInfo | URL,
    init?: RequestInit,
): Promise<Response> {
    const isDebug = localStorage.getItem('autonomous_debug') === 'true';
    let delay = 2000;  // 初始等待 2 秒
    const MAX_DELAY = 30000;  // 最长等待 30 秒
    let attempt = 0;

    while (true) {
        const resp = await fetch(input, init);
        if (resp.status !== 429) return resp;

        attempt++;
        if (isDebug) {
            console.log(`🤖 [Agent] 429 限流，${(delay / 1000).toFixed(0)}s 后重试（第 ${attempt} 次）...`);
        }
        await new Promise(r => setTimeout(r, delay));
        delay = Math.min(delay * 2, MAX_DELAY);  // 指数退避：2→4→8→16→30→30...
    }
}

// ═══════════════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════════════

export interface SecondaryApiConfig {
    baseUrl: string;
    apiKey: string;
    model: string;
}

interface TriggerContext {
    hoursSinceLastUserMsg: number;
    hoursSinceLastAIMsg: number;
    lastMsgWasFromAI: boolean;
    hasExpiredEvents: boolean;
    expiredEvents: PendingEvent[];
    currentHour: number;
    moodIntensity: number;
    recentSummary: string;       // 最后几条消息的极简摘要
    charMood: string;
    userName: string;
    // ═══ 新增：完整内部状态 ═══
    internalState: InternalState | null;  // 完整的荷尔蒙状态
    salience: number;                     // 情绪冲量 (0-7)
    topMemory: string | null;             // 精选高权重记忆（标题+摘要）
}

interface CooldownState {
    lastActionTime: number;
    lastActionType: string;
    consecutiveIgnored: number;  // 连续发了几条用户没回
    todayActionCount: number;
    todayDate: string;
}

export interface LLMDecision {
    action: 'none' | 'send' | 'call' | 'think';
    topic?: string;      // 副模型建议的话题方向
    reason?: string;     // 发送动机
    content?: string;    // legacy: 仅 fuzzy fallback 时可能有
}

// ═══════════════════════════════════════════════════════════════
//  Config — 用户可通过设置面板调整这些参数
// ═══════════════════════════════════════════════════════════════

const COOLDOWN_STORAGE_KEY = 'autonomous_cooldown_state';
const LLM_TIMEOUT_MS = 60000;            // 副模型超时 (1分钟，容忍429重试)
const PRIMARY_LLM_TIMEOUT_MS = 300000;   // 主模型超时 (5分钟，容忍长下文构建 + 429重试)
const DEBUG_INTERVAL_MS = 30 * 1000;     // 调试模式: 30 秒

export interface AgentConfig {
    minIntervalMin: number;       // 最短检查间隔（分钟）
    maxIntervalMin: number;       // 最长检查间隔（分钟）
    cooldownHours: number;        // 发消息后冷却时间（小时）
    maxDailyActions: number;      // 每日主动消息上限
    maxConsecutiveIgnored: number; // 连续未回复容忍次数
    baseProb: number;             // 基础触发概率 (0~1)
    notificationsEnabled: boolean; // 是否弹出系统通知
}

const AGENT_CONFIG_DEFAULTS: AgentConfig = {
    minIntervalMin: 15,
    maxIntervalMin: 40,
    cooldownHours: 2,
    maxDailyActions: 5,
    maxConsecutiveIgnored: 2,
    baseProb: 0.15,
    notificationsEnabled: true,
};

const AGENT_CONFIG_STORAGE_KEY = 'agent_config';

/** 读取用户配置，缺失项使用默认值 */
export function getAgentConfig(): AgentConfig {
    try {
        const raw = localStorage.getItem(AGENT_CONFIG_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            return { ...AGENT_CONFIG_DEFAULTS, ...parsed };
        }
    } catch { /* ignore */ }
    return { ...AGENT_CONFIG_DEFAULTS };
}

/** 保存用户配置 */
export function saveAgentConfig(config: Partial<AgentConfig>): void {
    try {
        const current = getAgentConfig();
        const merged = { ...current, ...config };
        localStorage.setItem(AGENT_CONFIG_STORAGE_KEY, JSON.stringify(merged));
    } catch { /* ignore */ }
}

// ═══════════════════════════════════════════════════════════════
//  1. CooldownManager — localStorage 持久化冷却状态
// ═══════════════════════════════════════════════════════════════

function loadCooldown(): CooldownState {
    try {
        const raw = localStorage.getItem(COOLDOWN_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            // 日期变了 → 重置每日计数
            const today = new Date().toISOString().split('T')[0];
            if (parsed.todayDate !== today) {
                parsed.todayActionCount = 0;
                parsed.todayDate = today;
            }
            return parsed;
        }
    } catch { /* ignore */ }
    return {
        lastActionTime: 0,
        lastActionType: 'none',
        consecutiveIgnored: 0,
        todayActionCount: 0,
        todayDate: new Date().toISOString().split('T')[0],
    };
}

function saveCooldown(state: CooldownState): void {
    try {
        localStorage.setItem(COOLDOWN_STORAGE_KEY, JSON.stringify(state));
    } catch { /* ignore */ }
}

function isInCooldown(): boolean {
    const cd = loadCooldown();
    const cfg = getAgentConfig();
    const now = Date.now();
    const hoursSinceLast = (now - cd.lastActionTime) / 3600000;

    // 冷却期未过
    if (cd.lastActionTime > 0 && hoursSinceLast < cfg.cooldownHours) return true;

    // 每日上限
    if (cd.todayActionCount >= cfg.maxDailyActions) return true;

    // 连续未回复
    if (cd.consecutiveIgnored >= cfg.maxConsecutiveIgnored) return true;

    return false;
}

function updateCooldownAfterAction(decision: LLMDecision): void {
    const cd = loadCooldown();
    // 只有真正发出消息/来电的行为才触发冷却。
    // think 是内心独白，不打扰用户，不应该触发冷却/计数。
    if (decision.action === 'send' || decision.action === 'call') {
        cd.lastActionTime = Date.now();
        cd.lastActionType = decision.action;
        cd.todayActionCount++;
        cd.consecutiveIgnored++;
    }
    saveCooldown(cd);
}

/** 当用户发了消息，重置 consecutiveIgnored 计数 */
function resetConsecutiveIgnored(): void {
    const cd = loadCooldown();
    if (cd.consecutiveIgnored > 0) {
        cd.consecutiveIgnored = 0;
        saveCooldown(cd);
    }
}

// ═══════════════════════════════════════════════════════════════
//  2. ContextCollector — 只读收集上下文
// ═══════════════════════════════════════════════════════════════

/**
 * 从记忆库中检索一条与当前情绪共振度最高的高权重记忆。
 * 用于注入副模型的决策 Prompt，让主动发起的话题更自然。
 */
async function getTopMemoryForDecision(
    charId: string,
    internalState: InternalState | null,
): Promise<string | null> {
    try {
        const headers = await DB.getVectorMemoryHeaders(charId);
        if (!headers || headers.length === 0) return null;

        const active = headers.filter(h => !h.deprecated);
        if (active.length === 0) return null;

        const now = Date.now();
        const DAY = 86400000;
        const currentSnapshot = internalState ? extractHormoneSnapshot(internalState) : null;

        // 对每条记忆计算综合分数 = importance * recency * resonance
        const scored = active.map(h => {
            const ageDays = (now - h.createdAt) / DAY;
            const recencyScore = 1 / (1 + ageDays * 0.05); // 缓慢衰减
            const importanceScore = (h.importance || 5) / 10;

            // 如果有荷尔蒙快照，计算情绪共振度
            let resonanceScore = 0.5; // 默认中性
            if (currentSnapshot && (h as any).hormoneSnapshot) {
                resonanceScore = hormoneResonance(currentSnapshot, (h as any).hormoneSnapshot);
            }

            const finalScore = importanceScore * 0.4 + recencyScore * 0.3 + resonanceScore * 0.3;
            return { header: h, score: finalScore };
        });

        scored.sort((a, b) => b.score - a.score);
        const top = scored[0];
        if (!top) return null;

        const title = top.header.title || '';
        const content = (top.header.content || '').slice(0, 80);
        return `${title}：${content}`;
    } catch {
        return null;
    }
}

async function collectContext(charId: string, char: CharacterProfile): Promise<TriggerContext> {
    const now = Date.now();
    const recentMsgs = await DB.getRecentMessagesByCharId(charId, 10);

    // 计算沉默时长
    let hoursSinceLastUserMsg = 999;
    let hoursSinceLastAIMsg = 999;
    let lastMsgWasFromAI = false;

    for (let i = recentMsgs.length - 1; i >= 0; i--) {
        const m = recentMsgs[i];
        if (m.role === 'user' && hoursSinceLastUserMsg === 999) {
            hoursSinceLastUserMsg = (now - m.timestamp) / 3600000;
        }
        if (m.role === 'assistant' && hoursSinceLastAIMsg === 999) {
            hoursSinceLastAIMsg = (now - m.timestamp) / 3600000;
        }
    }

    if (recentMsgs.length > 0) {
        lastMsgWasFromAI = recentMsgs[recentMsgs.length - 1].role === 'assistant';
    }

    // 注意：resetConsecutiveIgnored 已移至 tick() 冷却检查之前，这里不再重复调用

    // 过期事件
    const pendingEvents = getPendingEvents(charId);
    const expiredEvents = pendingEvents.filter(e => e.dueAt <= now);

    // 最近消息摘要（最多 50 字）
    let recentSummary = '';
    const lastFew = recentMsgs.slice(-4);
    for (const m of lastFew) {
        const sender = m.role === 'user' ? '用户' : char.name;
        const excerpt = m.content.slice(0, 15).replace(/\n/g, ' ');
        recentSummary += `${sender}:${excerpt}; `;
    }
    recentSummary = recentSummary.slice(0, 50);

    // 获取用户名
    let userName = '用户';
    try {
        const userProfile = await DB.getUserProfile();
        if (userProfile?.name) userName = userProfile.name;
    } catch { /* ignore */ }

    // ═══ 新增：解析完整的激素内部状态 ═══
    const internalState = resolveInternalState(char.moodState as any) || null;
    const moodIntensity = internalState ? computeActivationLevel(internalState) : 3;
    const salience = internalState ? computeSalience(internalState) : 0;
    const charMood = internalState?.surfaceEmotion || (char.moodState as any)?.mood || '平静';

    // ═══ 新增：检索精选高权重记忆（用于决策 Prompt） ═══
    const topMemory = await getTopMemoryForDecision(charId, internalState);

    return {
        hoursSinceLastUserMsg,
        hoursSinceLastAIMsg,
        lastMsgWasFromAI,
        hasExpiredEvents: expiredEvents.length > 0,
        expiredEvents,
        currentHour: new Date().getHours(),
        moodIntensity,
        charMood,
        recentSummary,
        userName,
        internalState,
        salience,
        topMemory,
    };
}

// ═══════════════════════════════════════════════════════════════
//  3. ProbabilityGate — 概率门控（纯数学）
// ═══════════════════════════════════════════════════════════════

function probabilityGate(ctx: TriggerContext): boolean {
    const cfg = getAgentConfig();
    let prob = cfg.baseProb;
    const isDebug = localStorage.getItem('autonomous_debug') === 'true';
    const contributions: string[] = [];  // Debug: 记录各因素贡献

    // ═══ 基础情境因素 ═══

    // 用户沉默越久 → 越可能主动
    if (ctx.hoursSinceLastUserMsg > 8) {
        prob *= 2.0;
        contributions.push('userSilent>8h:×2.0');
    } else if (ctx.hoursSinceLastUserMsg > 3) {
        prob *= 1.5;
        contributions.push('userSilent>3h:×1.5');
    }

    // 有到期事件 → 几乎必触发
    if (ctx.hasExpiredEvents) {
        prob = Math.max(prob, 0.80);
        contributions.push('expiredEvent:≥0.80');
    }

    // 防骚扰：区分「AI 回复用户后用户离开」vs「AI 主动发消息用户没回」
    // 用时间差判断：如果 AI 的最后消息和用户的最后消息时间差很小，说明是正常对话流程
    if (ctx.lastMsgWasFromAI) {
        const gap = ctx.hoursSinceLastUserMsg - ctx.hoursSinceLastAIMsg; // 正值 = AI 在用户之后说话
        if (gap > 0.5) {
            // AI 消息比用户消息晚 30+ 分钟 → 大概率是自主发的，用户没回 → 强惩罚
            prob *= 0.08;
            contributions.push(`autoIgnored(gap=${gap.toFixed(2)}h):×0.08`);
        } else if (gap > 0.1) {
            // 6~30 分钟差 → 可能是主动发的但时间不长 → 轻惩罚
            prob *= 0.4;
            contributions.push(`maybeAuto(gap=${gap.toFixed(2)}h):×0.4`);
        }
        // gap <= 0.1h (< 6 分钟) → 正常对话尾声，AI 只是回复了用户 → 不惩罚
        else {
            contributions.push(`normalReply(gap=${gap.toFixed(2)}h):×1.0`);
        }
    }

    // 角色刚发过消息 (< 30 分钟) → 不要紧接着再发
    if (ctx.hoursSinceLastAIMsg < 0.5) {
        prob *= 0.05;
        contributions.push('charRecent<30m:×0.05');
    }

    // 深夜 (1:00-7:00) → 角色也要睡觉
    if (ctx.currentHour >= 1 && ctx.currentHour < 7) {
        prob *= 0.05;
        contributions.push('lateNight:×0.05');
    }

    // ═══ 新增：基于荷尔蒙的概率调整 ═══
    if (ctx.internalState) {
        const s = ctx.internalState;

        // 皮质醇高 → 焦虑驱动主动联系（想找人倾诉）
        if (s.cortisol > 0.65) {
            const boost = 1 + (s.cortisol - 0.65) * 3;  // 0.65→×1, 0.95→×1.9
            prob *= boost;
            contributions.push(`cortisol(${s.cortisol.toFixed(2)}):×${boost.toFixed(2)}`);
        }

        // 多巴胺高 → 兴奋驱动主动分享
        if (s.dopamine > 0.65) {
            const boost = 1 + (s.dopamine - 0.65) * 2.5;  // 0.65→×1, 0.95→×1.75
            prob *= boost;
            contributions.push(`dopamine(${s.dopamine.toFixed(2)}):×${boost.toFixed(2)}`);
        }

        // 血清素高 → 平静稳定，不急着找人
        if (s.serotonin > 0.6) {
            const dampening = 1 - (s.serotonin - 0.6) * 0.5;  // 0.6→×1, 0.95→×0.825
            prob *= dampening;
            contributions.push(`serotonin(${s.serotonin.toFixed(2)}):×${dampening.toFixed(2)}`);
        }

        // 能量低 → 疲惫，懒得说话
        if (s.energy < 0.3) {
            const dampening = Math.max(0.1, s.energy / 0.3);  // 0.3→×1, 0.05→×0.17
            prob *= dampening;
            contributions.push(`energy(${s.energy.toFixed(2)}):×${dampening.toFixed(2)}`);
        }

        // 催产素高 → 亲密感强，更想联系
        if (s.oxytocin > 0.65) {
            const boost = 1 + (s.oxytocin - 0.65) * 1.5;  // 0.65→×1, 0.95→×1.45
            prob *= boost;
            contributions.push(`oxytocin(${s.oxytocin.toFixed(2)}):×${boost.toFixed(2)}`);
        }

        // 情绪冲量高 → 强烈想找人
        if (ctx.salience > 3.0) {
            const boost = 1 + (ctx.salience - 3.0) * 0.3;  // 3.0→×1, 7.0→×2.2
            prob *= boost;
            contributions.push(`salience(${ctx.salience.toFixed(1)}):×${boost.toFixed(2)}`);
        }
    } else {
        // Fallback: 无激素数据时使用旧逻辑
        if (ctx.moodIntensity >= 7) {
            prob *= 1.3;
            contributions.push('moodIntensity≥7:×1.3(legacy)');
        }
    }

    // Clamp
    prob = Math.max(0, Math.min(0.95, prob));

    const roll = Math.random();
    const passed = roll <= prob;

    if (isDebug) {
        console.log(`🤖 [Agent] ProbabilityGate: prob=${prob.toFixed(3)}, roll=${roll.toFixed(3)}, passed=${passed}`);
        console.log(`   📊 因素: ${contributions.join(' | ')}`);
        console.log(`   ⏱ userSilent=${ctx.hoursSinceLastUserMsg.toFixed(2)}h, charSilent=${ctx.hoursSinceLastAIMsg.toFixed(2)}h, salience=${ctx.salience.toFixed(1)}`);
    }

    return passed;
}

// ═══════════════════════════════════════════════════════════════
//  4. DecisionMaker — LLM 判断（极简 Prompt）
// ═══════════════════════════════════════════════════════════════

function buildDecisionPrompt(charName: string, char: CharacterProfile, ctx: TriggerContext): string {
    const personalitySummary = (char.systemPrompt || char.description || '').slice(0, 200);
    const now = new Date();
    const timeStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    let eventLine = '';
    if (ctx.expiredEvents.length > 0) {
        const evt = ctx.expiredEvents[0];
        const overdueMin = Math.round((Date.now() - evt.dueAt) / 60000);
        eventLine = `\n- ⚠ 待跟进：${evt.event}（已过期${overdueMin}分钟）`;
    }

    // 读取荷尔蒙引擎的完整内部状态
    let emotionBlock = `- 你的情绪：${ctx.charMood}（强度${ctx.moodIntensity}/10）`;
    const state = char.moodState as any;
    if (state && typeof state.cortisol === 'number') {
        const fmt = (v: number) => (v * 100).toFixed(0) + '%';
        emotionBlock = `- 【内部状态】多巴胺${fmt(state.dopamine)} 血清素${fmt(state.serotonin)} 皮质醇${fmt(state.cortisol)} 催产素${fmt(state.oxytocin)} 精力${fmt(state.energy)}
- 外显情绪：${state.surfaceEmotion || ctx.charMood}`;
        if (state.innerVoice) {
            emotionBlock += `\n- 你此刻的心声：${state.innerVoice.slice(0, 80)}`;
        }
    }

    const silenceDesc = ctx.hoursSinceLastUserMsg < 1
        ? Math.round(ctx.hoursSinceLastUserMsg * 60) + '分钟前'
        : Math.round(ctx.hoursSinceLastUserMsg) + '小时前';

    // ═══ 新增：注入精选记忆 ═══
    let memoryLine = '';
    if (ctx.topMemory) {
        memoryLine = `\n- 你最近想起的一件事：${ctx.topMemory}`;
    }

    // 副模型 prompt：只做决策，不生成消息内容
    return `你是${charName}。你已经有一阵子没和${ctx.userName}说话了。
【你的状态】
- 现在时间：${timeStr}
- ${ctx.userName}上次说话：${silenceDesc}
- 最后聊的内容：${ctx.recentSummary || '（无）'}
${emotionBlock}${memoryLine}
- 你的性格要点：${personalitySummary}${eventLine}
【判断】
你现在想不想主动联系${ctx.userName}？
可选行动：
A. 发消息 → 提供动机和话题方向（不写具体消息内容）
B. 自己默默想一想（不打扰ta，但记录你的心情）
C. 什么都不做

只输出JSON（三选一）：
{"action":"send","reason":"为什么想联系ta","topic":"想聊什么话题"}
{"action":"think","reason":"你在想什么","topic":"思考的内容"}
{"action":"none"}`;
}

function parseDecisionJSON(content: string): LLMDecision | null {
    // Strip <think>...</think> reasoning tags
    content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    content = content.replace(/<think>[\s\S]*/g, '').trim();

    // Strip markdown code fences
    content = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

    const VALID_ACTIONS = ['none', 'send', 'call', 'think'];

    // Try direct parse
    try {
        const parsed = JSON.parse(content);
        if (parsed.action && VALID_ACTIONS.includes(parsed.action)) {
            return {
                action: parsed.action,
                content: parsed.content ? String(parsed.content).slice(0, 500) : undefined,
                reason: parsed.reason ? String(parsed.reason).slice(0, 100) : undefined,
                topic: parsed.topic ? String(parsed.topic).slice(0, 100) : undefined,
            };
        }
    } catch { /* try regex fallback */ }

    // Regex fallback: find JSON in text
    const jsonMatch = content.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.action && VALID_ACTIONS.includes(parsed.action)) {
                return {
                    action: parsed.action,
                    content: parsed.content ? String(parsed.content).slice(0, 500) : undefined,
                    reason: parsed.reason ? String(parsed.reason).slice(0, 100) : undefined,
                    topic: parsed.topic ? String(parsed.topic).slice(0, 100) : undefined,
                };
            }
        } catch { /* try fuzzy fallback */ }
    }

    // Fuzzy fallback: handle truncated JSON or text answers
    const lower = content.toLowerCase();
    // Truncated {"action":"none...
    if (lower.includes('"action"') && lower.includes('"none"') || lower.includes('action":"none')) {
        return { action: 'none' };
    }
    // Text-based answers
    if (lower.includes('什么都不做') || lower.includes('选择c') || lower.match(/^\s*c[\.\s、]/)) {
        return { action: 'none' };
    }
    // Truncated send
    if (lower.includes('"send"') || lower.includes('action":"send')) {
        const topicMatch = content.match(/"topic"\s*:\s*"([^"]*)/);
        const reasonMatch = content.match(/"reason"\s*:\s*"([^"]*)/);
        return {
            action: 'send',
            topic: topicMatch ? topicMatch[1] : undefined,
            reason: reasonMatch ? reasonMatch[1] : 'fuzzy-parsed',
        };
    }
    // Truncated think
    if (lower.includes('"think"') || lower.includes('action":"think')) {
        const topicMatch = content.match(/"topic"\s*:\s*"([^"]*)/);
        const reasonMatch = content.match(/"reason"\s*:\s*"([^"]*)/);
        return {
            action: 'think',
            topic: topicMatch ? topicMatch[1] : undefined,
            reason: reasonMatch ? reasonMatch[1] : 'fuzzy-parsed',
        };
    }
    if (lower.includes('"call"') || lower.includes('action":"call')) {
        return { action: 'call', reason: 'fuzzy-parsed' };
    }

    return null;
}

async function askLLM(
    char: CharacterProfile,
    ctx: TriggerContext,
    apiConfig: SecondaryApiConfig,
): Promise<LLMDecision> {
    const prompt = buildDecisionPrompt(char.name, char, ctx);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

    try {
        const baseUrl = apiConfig.baseUrl.replace(/\/+$/, '');
        const resp = await fetchWithRetry(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiConfig.apiKey}`,
            },
            body: JSON.stringify({
                model: apiConfig.model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
                max_tokens: 1024,
            }),
            signal: controller.signal,
        });

        if (!resp.ok) {
            console.warn(`🤖 [Agent] LLM error ${resp.status}`);
            return { action: 'none' };
        }

        const data = await resp.json();
        let content = (data.choices?.[0]?.message?.content || '').trim();

        const decision = parseDecisionJSON(content);
        if (!decision) {
            console.warn('🤖 [Agent] Failed to parse LLM decision:', content.slice(0, 80));
            return { action: 'none' };
        }

        return decision;
    } catch (err: any) {
        if (err.name === 'AbortError') {
            console.warn(`🤖 [Agent] LLM timed out (${LLM_TIMEOUT_MS}ms)`);
        } else {
            console.error('🤖 [Agent] LLM error:', err.message);
        }
        return { action: 'none' };
    } finally {
        clearTimeout(timer);
    }
}

// ═══════════════════════════════════════════════════════════════
//  5. Primary Model — 用主 API + 完整人设生成消息
// ═══════════════════════════════════════════════════════════════

/** 剔除 [[...]] 功能指令标签，只保留纯文字 */
function stripActionTags(text: string): string {
    return text
        .replace(/\[\[.*?\]\]/g, '')       // [[SEND_EMOJI: xxx]] etc
        .replace(/\[schedule_message[^\]]*\]/g, '')  // [schedule_message | ...]
        .replace(/\n{3,}/g, '\n\n')         // 清理多余空行
        .trim();
}

/** 从 localStorage 读取主 API 配置 */
function getPrimaryApiConfig(): { baseUrl: string; apiKey: string; model: string; apiConfig: APIConfig } | null {
    try {
        const raw = localStorage.getItem('os_api_config');
        if (!raw) return null;
        const cfg: APIConfig = JSON.parse(raw);
        if (!cfg.apiKey || !cfg.baseUrl || !cfg.model) return null;
        return {
            baseUrl: cfg.baseUrl.replace(/\/+$/, ''),
            apiKey: cfg.apiKey,
            model: cfg.model,
            apiConfig: cfg,
        };
    } catch { return null; }
}

/** 从 localStorage 读取实时配置 */
function getRealtimeConfig() {
    try {
        const raw = localStorage.getItem('os_realtime_config');
        return raw ? JSON.parse(raw) : undefined;
    } catch { return undefined; }
}

/**
 * 用主模型 + 完整 ChatPrompts 管线生成消息内容。
 * 完全独立的 fetch 调用，不碰 useChatAI。
 */
async function generateWithPrimaryModel(
    charId: string,
    char: CharacterProfile,
    reason: string,
    topic: string | undefined,
    recentMsgs: Message[],
): Promise<string | null> {
    const primary = getPrimaryApiConfig();
    if (!primary) {
        console.warn('🤖 [Agent] No primary API config, cannot generate message');
        return null;
    }

    const isDebug = localStorage.getItem('autonomous_debug') === 'true';
    if (isDebug) console.log('🤖 [Agent] Generating message with primary model...');

    try {
        // 1. 收集 buildSystemPrompt 所需的全部数据
        const [userProfile, groups, emojis, emojiCategories] = await Promise.all([
            DB.getUserProfile(),
            DB.getGroups(),
            DB.getEmojis(),
            DB.getEmojiCategories(),
        ]);

        if (!userProfile) {
            console.warn('🤖 [Agent] No user profile found');
            return null;
        }

        const realtimeConfig = getRealtimeConfig();
        const embeddingApiKey = localStorage.getItem('embedding_api_key') || undefined;

        // 2. 构建完整 system prompt（人设 + 世界书 + 记忆 + 向量检索 + ... ）
        const systemPrompt = await ChatPrompts.buildSystemPrompt(
            char,
            userProfile,
            groups,
            emojis,
            emojiCategories,
            recentMsgs,
            realtimeConfig,
            primary.apiConfig,
            embeddingApiKey,
        );

        // 3. 构建消息历史
        const contextLimit = char.contextLimit || 30;
        const { apiMessages } = ChatPrompts.buildMessageHistory(
            recentMsgs,
            contextLimit,
            char,
            userProfile,
            emojis,
        );

        // 4. 追加触发消息（仅存在于 API 请求中，不写入 DB）
        const userName = userProfile.name || '用户';
        const topicHint = topic ? `话题方向：${topic}。` : '';
        const triggerMsg = {
            role: 'user' as const,
            content: `[系统提示：你现在想主动给${userName}发消息。${topicHint}动机：${reason}。请直接输出你想说的话，用换行分成几条短消息，像真人发消息一样自然。不要回复这条系统消息本身。]`,
        };

        const messages = [
            { role: 'system' as const, content: systemPrompt },
            ...apiMessages,
            triggerMsg,
        ];

        // 5. 调用主 API
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), PRIMARY_LLM_TIMEOUT_MS);

        try {
            const resp = await fetchWithRetry(`${primary.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${primary.apiKey}`,
                },
                body: JSON.stringify({
                    model: primary.model,
                    messages,
                    temperature: 0.85,
                    max_tokens: 4096,
                }),
                signal: controller.signal,
            });

            if (!resp.ok) {
                console.warn(`🤖 [Agent] Primary LLM error ${resp.status}`);
                return null;
            }

            const data = await resp.json();
            let content = (data.choices?.[0]?.message?.content || '').trim();

            // Strip <think> tags
            content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
            content = content.replace(/<think>[\s\S]*/g, '').trim();

            // Strip action tags
            content = stripActionTags(content);

            if (!content || content.length < 2) {
                console.warn('🤖 [Agent] Primary LLM returned empty content');
                return null;
            }

            if (isDebug) console.log(`🤖 [Agent] Primary model generated: "${content.slice(0, 60)}..."`);
            return content;
        } finally {
            clearTimeout(timer);
        }
    } catch (err: any) {
        if (err.name === 'AbortError') {
            console.warn(`🤖 [Agent] Primary LLM timed out (${PRIMARY_LLM_TIMEOUT_MS}ms)`);
        } else {
            console.error('🤖 [Agent] Primary model error:', err.message);
        }
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════
//  6. ActionExecutor — 主模型生成 + 气泡拆分 + 预制消息管道
// ═══════════════════════════════════════════════════════════════

async function executeAction(
    charId: string,
    char: CharacterProfile,
    decision: LLMDecision,
    recentMsgs: Message[],
): Promise<boolean> {
    if (decision.action === 'none') return false;

    // ═══ 新增：think 行为 — 内心独白，不打扰用户 ═══
    if (decision.action === 'think') {
        const isDebug = localStorage.getItem('autonomous_debug') === 'true';
        if (isDebug) {
            console.log(`🤖 [Agent] 💭 内心独白: reason="${decision.reason || ''}", topic="${decision.topic || ''}"`);
        }
        // think 行为不生成消息，不弹通知，不更新冷却计数
        return false;
    }

    if (decision.action === 'send') {
        // 用主模型生成消息内容
        const generatedContent = await generateWithPrimaryModel(
            charId,
            char,
            decision.reason || '想找你聊聊',
            decision.topic,
            recentMsgs,
        );

        if (!generatedContent) {
            console.warn('🤖 [Agent] Primary model failed, skipping send. Will NOT enter cooldown.');
            return false;
        }

        // 按换行拆分为多条气泡
        const bubbles = generatedContent
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        if (bubbles.length === 0) return false;

        const now = Date.now();
        const BUBBLE_INTERVAL_MS = 3000; // 每条间隔 3 秒

        for (let i = 0; i < bubbles.length; i++) {
            await DB.saveScheduledMessage({
                id: `auto-${now}-${i}-${Math.random().toString(36).slice(2, 6)}`,
                charId,
                content: bubbles[i],
                dueAt: now + i * BUBBLE_INTERVAL_MS,
                createdAt: now,
            });
        }

        const firstBubble = bubbles[0];
        console.log(`🤖 [Agent] Scheduled ${bubbles.length} bubble(s): "${firstBubble.slice(0, 30)}..." (reason: ${decision.reason || 'N/A'})`);

        // 系统原生通知
        const cfg = getAgentConfig();
        if (cfg.notificationsEnabled) {
            try {
                const perm = await LocalNotifications.checkPermissions();
                if (perm.display === 'granted') {
                    await LocalNotifications.schedule({
                        notifications: [{
                            title: char.name,
                            body: firstBubble.slice(0, 200),
                            id: Math.floor(Math.random() * 100000),
                            smallIcon: 'ic_stat_icon_config_sample',
                        }],
                    });
                }
            } catch { /* web 环境无原生通知 */ }
        }
        return true;
    }

    if (decision.action === 'call') {
        window.dispatchEvent(new CustomEvent('autonomous-call', {
            detail: { charId, reason: decision.reason || '想你了' },
        }));
        console.log(`🤖 [Agent] Dispatched autonomous call event (reason: ${decision.reason || 'N/A'})`);
        return true;
    }
    return false;
}

// ═══════════════════════════════════════════════════════════════
//  7. Main Tick & AutonomousAgent Class
// ═══════════════════════════════════════════════════════════════

async function tick(
    charId: string,
    char: CharacterProfile,
    apiConfig: SecondaryApiConfig,
): Promise<void> {
    const isDebug = localStorage.getItem('autonomous_debug') === 'true';

    // 0. 先检查用户是否已回复 → 重置 consecutiveIgnored（必须在冷却检查之前！）
    //    修复死锁：之前 reset 在 collectContext 里，但 collectContext 在冷却检查之后，
    //    导致 consecutiveIgnored 一旦达到上限就永远无法被重置。
    try {
        const checkMsgs = await DB.getRecentMessagesByCharId(charId, 5);
        if (checkMsgs.length > 0 && checkMsgs[checkMsgs.length - 1].role === 'user') {
            resetConsecutiveIgnored();
        }
    } catch { /* ignore */ }

    // 1. 冷却检查
    if (isInCooldown()) {
        if (isDebug) console.log('🤖 [Agent] tick: skipped (in cooldown)');
        return;
    }

    // 2. 收集上下文（刷新角色数据，取最新情绪）
    let freshChar = char;
    try {
        const allChars = await DB.getAllCharacters();
        const found = allChars.find(c => c.id === charId);
        if (found) freshChar = found;
    } catch { /* use stale char */ }

    const ctx = await collectContext(charId, freshChar);

    // 3. 概率门控
    if (!probabilityGate(ctx)) {
        if (isDebug) console.log(`🤖 [Agent] tick: skipped (probability gate) | userSilent=${ctx.hoursSinceLastUserMsg.toFixed(2)}h, charSilent=${ctx.hoursSinceLastAIMsg.toFixed(2)}h`);
        return;
    }

    // 4. 副模型判断：要不要发 + 动机/话题
    console.log('🤖 [Agent] tick: passed probability gate, asking secondary LLM for decision...');
    const decision = await askLLM(freshChar, ctx, apiConfig);

    if (isDebug) {
        console.log(`🤖 [Agent] Decision: action=${decision.action}, reason=${decision.reason || 'N/A'}, topic=${decision.topic || 'N/A'}`);
    }

    // 5. 获取最近消息（给主模型用）
    const recentMsgs = await DB.getRecentMessagesByCharId(charId, 30);

    // 6. 执行动作（主模型生成 + 气泡拆分）
    const actionSuccess = await executeAction(charId, freshChar, decision, recentMsgs);

    // 7. 更新冷却状态（仅 send/call 真正发出消息/来电时才触发冷却）
    if (actionSuccess) {
        updateCooldownAfterAction(decision);
    }

    // 日志
    const hormoneLog = ctx.internalState
        ? ` | dopa=${ctx.internalState.dopamine.toFixed(2)} cort=${ctx.internalState.cortisol.toFixed(2)} sero=${ctx.internalState.serotonin.toFixed(2)} ener=${ctx.internalState.energy.toFixed(2)} sal=${ctx.salience.toFixed(1)}`
        : '';
    console.log(`🤖 [Agent] tick: action=${decision.action} | silent=${ctx.hoursSinceLastUserMsg.toFixed(1)}h | mood=${ctx.charMood}(${ctx.moodIntensity})${hormoneLog} | events=${ctx.expiredEvents.length}${ctx.topMemory ? ` | mem="${ctx.topMemory.slice(0, 30)}..."` : ''}`);
}

export class AutonomousAgent {
    private timerId: ReturnType<typeof setTimeout> | null = null;
    private stopped = false;

    /**
     * 启动自主决策循环。
     * @returns cleanup 函数，调用后停止循环。
     */
    start(charId: string, char: CharacterProfile, apiConfig: SecondaryApiConfig): () => void {
        this.stopped = false;

        const isDebug = localStorage.getItem('autonomous_debug') === 'true';
        const cfg = getAgentConfig();
        console.log(`🤖 [Agent] Started for ${char.name} (interval: ${isDebug ? '30s debug' : `${cfg.minIntervalMin}-${cfg.maxIntervalMin}min`})`);

        const scheduleNext = () => {
            if (this.stopped) return;

            const isDbg = localStorage.getItem('autonomous_debug') === 'true';
            const cfg = getAgentConfig();
            const minMs = cfg.minIntervalMin * 60 * 1000;
            const maxMs = cfg.maxIntervalMin * 60 * 1000;
            const interval = isDbg
                ? DEBUG_INTERVAL_MS
                : minMs + Math.random() * (maxMs - minMs);

            this.timerId = setTimeout(async () => {
                if (this.stopped) return;
                try {
                    await tick(charId, char, apiConfig);
                } catch (err) {
                    console.error('🤖 [Agent] tick error (silenced):', err);
                }
                scheduleNext();
            }, interval);
        };

        // 首次 tick 延迟 2-5 分钟（避免刚打开就触发）
        const firstDelay = localStorage.getItem('autonomous_debug') === 'true'
            ? 5000
            : 2 * 60 * 1000 + Math.random() * 3 * 60 * 1000;

        this.timerId = setTimeout(async () => {
            if (this.stopped) return;
            try {
                await tick(charId, char, apiConfig);
            } catch (err) {
                console.error('🤖 [Agent] first tick error (silenced):', err);
            }
            scheduleNext();
        }, firstDelay);

        return () => this.stop();
    }

    stop(): void {
        this.stopped = true;
        if (this.timerId !== null) {
            clearTimeout(this.timerId);
            this.timerId = null;
        }
        console.log('🤖 [Agent] Stopped');
    }
}

/**
 * 后端决策执行入口 — 供 OSContext SSE 监听器调用。
 * 当后端 Agent 决策 action='send' 时，前端调用此函数用主模型生成消息。
 */
export async function executeBackendDecision(
    charId: string,
    char: CharacterProfile,
    decision: LLMDecision,
): Promise<void> {
    const recentMsgs = await DB.getRecentMessagesByCharId(charId, 30);
    const success = await executeAction(charId, char, decision, recentMsgs);
    if (success) {
        console.log(`🤖 [Agent] Backend decision executed: action=${decision.action}`);
    }
}

