/**
 * stt.ts — 云端语音识别 (STT) 配置类型
 *
 * 支持两个供应商：
 * - Groq (Whisper large-v3-turbo) — 极速，完全免费
 * - SiliconFlow (SenseVoice) — 永久免费，国内直连，附带情绪识别
 */

// ─── 供应商 ──────────────────────────────────────────────────────────

export type SttProvider = 'groq' | 'siliconflow';

// ─── 配置 ────────────────────────────────────────────────────────────

export interface SttConfig {
    /** 当前使用的供应商 */
    provider: SttProvider;
    /** Groq API Key */
    groqApiKey: string;
    /** 硅基流动 API Key */
    siliconflowApiKey: string;
    /** 可选：覆盖默认 API 地址（用于代理） */
    baseUrl?: string;
    /** 可选：覆盖默认模型名 */
    model?: string;
    /** 语言偏好，不填则自动检测（推荐中英混合场景留空） */
    language?: string;
}

// ─── 识别结果 ────────────────────────────────────────────────────────

export interface SttResult {
    /** 转写文本 */
    text: string;
    /** 检测到的语言 */
    language?: string;
    /** 情绪标签（仅 SenseVoice 返回） */
    emotion?: string;
}

// ─── 供应商默认值 ────────────────────────────────────────────────────

export const STT_PROVIDER_DEFAULTS: Record<SttProvider, {
    baseUrl: string;
    model: string;
    label: string;
    registerUrl: string;
}> = {
    groq: {
        baseUrl: 'https://api.groq.com/openai/v1',
        model: 'whisper-large-v3-turbo',
        label: 'Groq (Whisper)',
        registerUrl: 'https://console.groq.com/keys',
    },
    siliconflow: {
        baseUrl: 'https://api.siliconflow.cn/v1',
        model: 'FunAudioLLM/SenseVoiceSmall',
        label: '硅基流动 (SenseVoice)',
        registerUrl: 'https://cloud.siliconflow.cn/account/ak',
    },
};

// ─── 默认配置 ────────────────────────────────────────────────────────

export const DEFAULT_STT_CONFIG: SttConfig = {
    provider: 'groq',
    groqApiKey: '',
    siliconflowApiKey: '',
};

// ─── 工具函数 ────────────────────────────────────────────────────────

/** 根据当前 provider 获取对应的 API Key */
export function getActiveApiKey(config: SttConfig): string {
    return config.provider === 'groq' ? config.groqApiKey : config.siliconflowApiKey;
}
