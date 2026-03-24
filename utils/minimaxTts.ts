/**
 * MiniMax TTS (Text-to-Audio) API 服务层
 * 
 * 独立模块：封装 MiniMax 异步语音合成的完整流程
 * - createTask:    创建合成任务
 * - queryTask:     查询任务状态
 * - downloadAudio: 下载音频文件
 * - synthesize:    高级封装（创建 → 轮询 → 下载）
 * - preprocessText: AI 预处理文本（添加语气词标签）
 * 
 * 使用方式:
 *   import { MinimaxTts } from '../utils/minimaxTts';
 *   const result = await MinimaxTts.synthesize('你好世界', ttsConfig);
 *   // result.url → 可直接用于 <audio src={result.url}>
 */

import type {
    TtsConfig,
    TtsCreateTaskResponse,
    TtsQueryTaskResponse,
} from '../types/tts';

// ─── Constants ──────────────────────────────────────────────────────────

const DEFAULT_BASE_URL = 'https://api.minimaxi.com';
const POLL_INITIAL_INTERVAL = 2000;  // 首次轮询间隔 2s
const POLL_MAX_INTERVAL = 5000;      // 最大轮询间隔 5s
const POLL_TIMEOUT = 120000;         // 总超时 120s

// ─── 内部工具 ────────────────────────────────────────────────────────────

/** 统一解析 baseUrl，去除尾部斜杠，提供默认值 */
function resolveBaseUrl(url?: string): string {
    return (url || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

/** 构建请求头 */
function makeHeaders(apiKey: string, groupId: string): Record<string, string> {
    const headers: Record<string, string> = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
    };
    if (groupId) headers['Group-Id'] = groupId;
    return headers;
}

/** 构建只含 Authorization 的请求头 */
function makeAuthHeader(apiKey: string, groupId: string): Record<string, string> {
    const headers: Record<string, string> = { 'Authorization': `Bearer ${apiKey}` };
    if (groupId) headers['Group-Id'] = groupId;
    return headers;
}

/** 安全解析 JSON 响应 */
async function parseResponse<T>(response: Response): Promise<T> {
    const text = await response.text();

    const trimmed = text.trimStart();
    if (trimmed.startsWith('<')) {
        const titleMatch = trimmed.match(/<title>(.*?)<\/title>/i);
        const hint = titleMatch ? titleMatch[1] : trimmed.slice(0, 120);
        throw new Error(`MiniMax 返回了 HTML 而非 JSON (HTTP ${response.status}): ${hint}`);
    }

    if (!trimmed) {
        throw new Error(`MiniMax 返回了空响应 (HTTP ${response.status})`);
    }

    try {
        return JSON.parse(text) as T;
    } catch {
        throw new Error(`MiniMax 返回了无效 JSON (HTTP ${response.status}): ${text.slice(0, 200)}`);
    }
}

/** 检查 base_resp 状态码 */
function checkBaseResp(resp: { base_resp?: { status_code: number; status_msg: string } }, context: string): void {
    if (resp.base_resp && resp.base_resp.status_code !== 0) {
        const code = resp.base_resp.status_code;
        const msg = resp.base_resp.status_msg;
        throw new Error(`[TTS ${context}] 错误 ${code}: ${msg}`);
    }
}

// ─── 将 TtsConfig 转换为 API 请求体 ─────────────────────────────────────

function buildRequestBody(text: string, config: TtsConfig): Record<string, any> {
    const body: Record<string, any> = {
        model: config.model,
        text,
        voice_setting: {
            voice_id: config.voiceSetting.voice_id,
            speed: config.voiceSetting.speed,
            vol: config.voiceSetting.vol,
            pitch: config.voiceSetting.pitch,
        },
    };

    // 可选字段：emotion
    if (config.voiceSetting.emotion) {
        body.voice_setting.emotion = config.voiceSetting.emotion;
    }

    // 可选字段：english_normalization
    if (config.voiceSetting.english_normalization) {
        body.voice_setting.english_normalization = true;
    }

    // 音频设置
    if (config.audioSetting) {
        body.audio_setting = {
            audio_sample_rate: config.audioSetting.audio_sample_rate,
            bitrate: config.audioSetting.bitrate,
            format: config.audioSetting.format,
            channel: config.audioSetting.channel,
        };
    }

    // 声音效果器
    if (config.voiceModify) {
        const vm: Record<string, any> = {};
        if (config.voiceModify.pitch !== 0) vm.pitch = config.voiceModify.pitch;
        if (config.voiceModify.intensity !== 0) vm.intensity = config.voiceModify.intensity;
        if (config.voiceModify.timbre !== 0) vm.timbre = config.voiceModify.timbre;
        if (config.voiceModify.sound_effects) vm.sound_effects = config.voiceModify.sound_effects;
        if (Object.keys(vm).length > 0) body.voice_modify = vm;
    }

    // 发音词典
    if (config.pronunciationDict && config.pronunciationDict.tone.length > 0) {
        body.pronunciation_dict = { tone: config.pronunciationDict.tone };
    }

    // 语种增强
    if (config.languageBoost) {
        body.language_boost = config.languageBoost;
    }

    // AIGC 水印
    if (config.aigcWatermark) {
        body.aigc_watermark = true;
    }

    return body;
}

// ─── 公开 API ────────────────────────────────────────────────────────────

export type TtsSynthesisStatus = 'creating' | 'preprocessing' | 'processing' | 'downloading' | 'done' | 'error';

export interface TtsSynthesisResult {
    /** 音频 Blob */
    blob: Blob;
    /** ObjectURL，可直接用于 <audio src> */
    url: string;
    /** 计费字符数 */
    usageCharacters?: number;
}

export const MinimaxTts = {

    /**
     * 创建异步语音合成任务
     */
    async createTask(text: string, config: TtsConfig): Promise<TtsCreateTaskResponse> {
        if (!config.apiKey) throw new Error('请先配置 MiniMax API Key');
        if (!text.trim()) throw new Error('合成文本不能为空');

        const body = buildRequestBody(text, config);

        const baseUrl = resolveBaseUrl(config.baseUrl);
        const response = await fetch(`${baseUrl}/v1/t2a_async_v2`, {
            method: 'POST',
            headers: makeHeaders(config.apiKey, config.groupId || ''),
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errData = await parseResponse<any>(response).catch(() => null);
            const errMsg = errData?.base_resp?.status_msg || `HTTP ${response.status}`;
            throw new Error(`[TTS] 创建任务失败: ${errMsg}`);
        }

        const data = await parseResponse<TtsCreateTaskResponse>(response);
        checkBaseResp(data, '创建任务');
        return data;
    },

    /**
     * 查询异步任务状态
     */
    async queryTask(taskId: string, apiKey: string, groupId: string, baseUrlConfig: string): Promise<TtsQueryTaskResponse> {
        const baseUrl = resolveBaseUrl(baseUrlConfig);
        const url = `${baseUrl}/v1/query/t2a_async_query_v2?task_id=${taskId}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: makeAuthHeader(apiKey, groupId),
        });

        if (!response.ok) {
            throw new Error(`[TTS] 查询任务状态失败: HTTP ${response.status}`);
        }

        const data = await parseResponse<TtsQueryTaskResponse>(response);
        checkBaseResp(data, '查询状态');
        return data;
    },

    /**
     * 下载音频文件
     */
    async downloadAudio(fileId: number, apiKey: string, groupId: string, baseUrlConfig: string): Promise<Blob> {
        const baseUrl = resolveBaseUrl(baseUrlConfig);
        const url = `${baseUrl}/v1/files/retrieve_content?file_id=${fileId}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: makeAuthHeader(apiKey, groupId),
        });

        if (!response.ok) {
            throw new Error(`[TTS] 下载音频失败: HTTP ${response.status}`);
        }

        return await response.blob();
    },

    /**
     * 同步语音合成：直接调用 /v1/t2a_v2，一次请求返回完整音频。
     * 相比异步接口（createTask → queryTask → downloadAudio），延迟从几十秒降低到几秒。
     * 
     * @param text    - 待合成文本（最长 10,000 字符）
     * @param config  - TTS 配置
     * @param onStatus - 可选的状态回调
     * @param signal  - 可选的取消信号
     * @returns { blob, url, usageCharacters }
     */
    async synthesizeSync(
        text: string,
        config: TtsConfig,
        onStatus?: (status: TtsSynthesisStatus, message: string) => void,
        signal?: AbortSignal
    ): Promise<TtsSynthesisResult> {
        const notify = (s: TtsSynthesisStatus, m: string) => {
            onStatus?.(s, m);
            if (s === 'error') console.error(`[TTS Sync] ${m}`);
            else console.log(`[TTS Sync] ${m}`);
        };

        if (signal?.aborted) throw new DOMException('TTS synthesis aborted', 'AbortError');

        // 0. AI 预处理（可选）
        let textToSynthesize = text;
        const pre = config.preprocessConfig;
        if (pre?.enabled && pre.apiBase && pre.apiKey && pre.model) {
            notify('preprocessing', '正在用 AI 添加语气词...');
            try {
                textToSynthesize = await this.preprocessText(text, pre);
                console.log('[TTS Sync] 预处理完成，原文长度:', text.length, '→ 处理后:', textToSynthesize.length);
            } catch (e) {
                console.warn('[TTS Sync] 预处理失败，回退到原文:', e);
                textToSynthesize = text;
            }
        }

        if (signal?.aborted) throw new DOMException('TTS synthesis aborted', 'AbortError');

        // 1. 构建请求体（同步接口 + 非流式）
        const body = buildRequestBody(textToSynthesize, config);
        body.stream = false;
        // 使用 hex 格式返回音频数据（默认值，确保明确）
        body.output_format = 'hex';

        const baseUrl = resolveBaseUrl(config.baseUrl);
        notify('creating', '正在合成语音...');

        // 2. 发送同步请求
        const response = await fetch(`${baseUrl}/v1/t2a_v2`, {
            method: 'POST',
            headers: makeHeaders(config.apiKey, config.groupId || ''),
            body: JSON.stringify(body),
            signal,
        });

        if (!response.ok) {
            const errData = await parseResponse<any>(response).catch(() => null);
            const errMsg = errData?.base_resp?.status_msg || `HTTP ${response.status}`;
            notify('error', `语音合成失败: ${errMsg}`);
            throw new Error(`[TTS Sync] 合成失败: ${errMsg}`);
        }

        const data = await parseResponse<any>(response);
        checkBaseResp(data, '同步合成');

        // 3. 解码 hex 音频数据 → Blob
        if (!data.data?.audio) {
            notify('error', '合成结果为空');
            throw new Error('[TTS Sync] 合成结果无音频数据');
        }

        const hexStr: string = data.data.audio;
        const bytes = new Uint8Array(hexStr.length / 2);
        for (let i = 0; i < hexStr.length; i += 2) {
            bytes[i / 2] = parseInt(hexStr.substr(i, 2), 16);
        }

        const format = config.audioSetting?.format || 'mp3';
        const mimeMap: Record<string, string> = { mp3: 'audio/mpeg', pcm: 'audio/pcm', flac: 'audio/flac', wav: 'audio/wav' };
        const blob = new Blob([bytes], { type: mimeMap[format] || 'audio/mpeg' });
        const url = URL.createObjectURL(blob);

        const usageCharacters = data.extra_info?.usage_characters;
        notify('done', `语音合成完成 (${(blob.size / 1024).toFixed(1)} KB)`);

        return { blob, url, usageCharacters };
    },

    /**
     * @deprecated 使用 synthesizeSync() 代替。此方法使用异步轮询接口，延迟较高。
     * 高级封装：创建任务 → 轮询状态 → 下载音频
     * 
     * @param text    - 待合成文本
     * @param config  - TTS 配置
     * @param onStatus - 可选的状态回调
     * @returns { blob, url, usageCharacters }
     */
    async synthesize(
        text: string,
        config: TtsConfig,
        onStatus?: (status: TtsSynthesisStatus, message: string) => void,
        signal?: AbortSignal
    ): Promise<TtsSynthesisResult> {
        const notify = (s: TtsSynthesisStatus, m: string) => {
            onStatus?.(s, m);
            if (s === 'error') console.error(`[TTS] ${m}`);
            else console.log(`[TTS] ${m}`);
        };

        // 检查是否已取消
        if (signal?.aborted) throw new DOMException('TTS synthesis aborted', 'AbortError');

        // 0. AI 预处理（可选）— 在文本发给 MiniMax 之前插入语气词标签
        let textToSynthesize = text;
        const pre = config.preprocessConfig;
        if (pre?.enabled && pre.apiBase && pre.apiKey && pre.model) {
            notify('preprocessing', '正在用 AI 添加语气词...');
            try {
                textToSynthesize = await this.preprocessText(text, pre);
                console.log('[TTS] 预处理完成，原文长度:', text.length, '→ 处理后:', textToSynthesize.length);
            } catch (e) {
                console.warn('[TTS] 预处理失败，回退到原文:', e);
                textToSynthesize = text; // 静默降级
            }
        }

        // 1. 创建任务
        notify('creating', '正在创建语音合成任务...');
        const taskResult = await this.createTask(textToSynthesize, config);
        const { task_id, file_id } = taskResult;
        notify('processing', `任务已创建 (ID: ${task_id})，等待处理...`);

        // 2. 轮询任务状态
        const startTime = Date.now();
        let interval = POLL_INITIAL_INTERVAL;
        let finalFileId = file_id;
        let pollCount = 0;
        let lastStatus = '';

        while (true) {
            // 检查取消信号
            if (signal?.aborted) throw new DOMException('TTS synthesis aborted', 'AbortError');

            const elapsed = Math.round((Date.now() - startTime) / 1000);
            if (elapsed * 1000 > POLL_TIMEOUT) {
                notify('error', `语音合成超时（${elapsed}s, 最后状态: ${lastStatus || '未知'}）`);
                throw new Error('语音合成超时，请稍后重试');
            }

            await new Promise(resolve => setTimeout(resolve, interval));
            pollCount++;

            let queryResult;
            try {
                queryResult = await this.queryTask(task_id, config.apiKey, config.groupId || '', config.baseUrl);
                lastStatus = queryResult.status;
                notify('processing', `合成中... 第${pollCount}次查询 → ${queryResult.status} (${elapsed}s)`);
                console.log(`[TTS] Poll #${pollCount}: status=${queryResult.status}, file_id=${queryResult.file_id} (${elapsed}s)`);
            } catch (e: any) {
                lastStatus = `查询错误: ${e.message}`;
                notify('processing', `合成中... 第${pollCount}次查询失败: ${e.message.slice(0, 60)} (${elapsed}s)`);
                console.warn(`[TTS] Poll #${pollCount} error:`, e.message);
                interval = Math.min(interval * 1.5, POLL_MAX_INTERVAL);
                continue;
            }

            if (queryResult.status === 'Success') {
                finalFileId = queryResult.file_id;
                notify('downloading', '合成完成，正在下载音频...');
                break;
            }

            if (queryResult.status === 'Failed') {
                const msg = queryResult.base_resp?.status_msg || '未知原因';
                notify('error', `语音合成失败: ${msg}`);
                throw new Error(`MiniMax TTS 失败: ${msg}`);
            }

            // 指数退避
            interval = Math.min(interval * 1.5, POLL_MAX_INTERVAL);
        }

        // 3. 下载音频
        const blob = await this.downloadAudio(finalFileId, config.apiKey, config.groupId || '', config.baseUrl);
        const url = URL.createObjectURL(blob);
        notify('done', '语音合成完成');

        return {
            blob,
            url,
            usageCharacters: taskResult.usage_characters,
        };
    },

    /**
     * AI 预处理文本：用独立 AI 在文本中插入语气词标签
     * 
     * @param text   - 原始文本
     * @param config - 预处理配置（含 apiBase / apiKey / model / prompt）
     * @returns 处理后的文本
     */
    async preprocessText(
        text: string,
        config: { prompt: string; apiBase: string; apiKey: string; model: string }
    ): Promise<string> {
        if (!config.apiBase || !config.apiKey || !config.model) {
            console.warn('[TTS Preprocess] 预处理 API 未配置，使用原始文本');
            return text;
        }

        const baseUrl = config.apiBase.replace(/\/+$/, '');

        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: config.model,
                messages: [
                    { role: 'system', content: config.prompt },
                    { role: 'user', content: text },
                ],
                temperature: 0.3,
                max_tokens: Math.min(Math.max(Math.ceil(text.length * 1.5), 512), 4096),
            }),
        });

        if (!response.ok) {
            console.warn('[TTS Preprocess] AI 预处理失败，使用原始文本');
            return text;
        }

        try {
            const data = await response.json();
            const result = data?.choices?.[0]?.message?.content?.trim();
            return result || text;
        } catch {
            console.warn('[TTS Preprocess] 解析 AI 响应失败，使用原始文本');
            return text;
        }
    },

    /**
     * 释放 ObjectURL（防止内存泄漏）
     */
    revokeUrl(url: string): void {
        try {
            URL.revokeObjectURL(url);
        } catch { /* ignore */ }
    },
};
