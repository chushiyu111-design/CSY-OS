/**
 * Thinking Chain Extractor — 思考链提取器（前端版）
 *
 * 纯函数，零依赖。与后端 thinkingExtractor.ts 共用同一套正则逻辑。
 * 从 LLM 原始输出中提取 <think>/<thinking> 标签内的推理过程，
 * 返回清洗后的显示文本 + 可选的思考链内容。
 */

export interface ExtractionResult {
    /** 清洗后的显示文本（已去除所有思考标签） */
    content: string;
    /** 提取到的思考链文本（可能为 undefined） */
    thinking?: string;
}

/**
 * 从 LLM 原始输出中提取思考链并清洗内容。
 *
 * 支持的标签格式（按优先级）：
 * 1. `<think>...</think>` — DeepSeek-R1, Qwen3 等原生推理标签
 * 2. 未闭合 `<think>...` — 输出被截断的情况
 * 3. `<thinking>...</thinking>` — CoT 协议标签（本项目主用）
 * 4. 未闭合 `<thinking>...` — 输出被截断的情况
 */
export function extractThinking(raw: string): ExtractionResult {
    let thinking = '';

    // ── 1. 提取 <think> 原生标签 ──────────────────────────
    const nativeMatch = raw.match(/<think>([\s\S]*?)<\/think>/i);
    if (nativeMatch) {
        thinking = nativeMatch[1].trim();
    } else {
        const unclosed = raw.match(/<think>([\s\S]*)$/i);
        if (unclosed) {
            thinking = unclosed[1].replace(/<\/?think>/gi, '').trim();
        }
    }

    // ── 2. 提取 <thinking> CoT 协议标签 ─────────────────────
    const cotMatch = raw.match(/<thinking>([\s\S]*?)<\/thinking>/i);
    if (cotMatch) {
        thinking += (thinking ? '\n\n' : '') + cotMatch[1].trim();
    } else if (!thinking) {
        const unclosedCot = raw.match(/<thinking>([\s\S]*)$/i);
        if (unclosedCot) {
            thinking = unclosedCot[1].replace(/<\/?thinking>/gi, '').trim();
        }
    }

    // ── 3. 清洗：移除所有思考标签 ────────────────────────────
    let content = raw;
    content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    content = content.replace(/<think>[\s\S]*/gi, '').trim();
    content = content.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
    content = content.replace(/<thinking>[\s\S]*/gi, '').trim();

    // 安全回退
    if (!content) {
        content = raw.replace(/<\/?think(?:ing)?>/gi, '').trim();
    }

    return {
        content,
        thinking: thinking || undefined,
    };
}
