import React, { useState } from 'react';
import { Message } from '../../../types';
import { formatDuration } from '../../../apps/voicecall/utils';
import { MODE_LABELS } from '../../../apps/voicecall/voiceCallTypes';
import type { VoiceCallMode } from '../../../apps/voicecall/voiceCallTypes';

/**
 * VoiceCallSummaryCard — 通话记录可展开卡片
 * 
 * 折叠态: 📞 + 模式标签 + 通话时长
 * 展开态: 完整对话列表（按角色渲染）
 */

interface VoiceCallSummaryCardProps {
    message: Message;
}

const VoiceCallSummaryCard: React.FC<VoiceCallSummaryCardProps> = ({ message }) => {
    const [expanded, setExpanded] = useState(false);

    const duration = message.metadata?.duration ?? 0;
    const mode = message.metadata?.mode as string | undefined;
    const conversation = message.metadata?.conversation as { role: string; content: string }[] | undefined;

    const modeText = mode ? (MODE_LABELS[mode as VoiceCallMode] || mode) : '';
    const durationText = formatDuration(duration);
    const turnCount = conversation?.length ?? 0;

    return (
        <div
            className="w-full max-w-[280px] bg-white/90 backdrop-blur-sm rounded-2xl overflow-hidden shadow-sm border border-slate-100 cursor-pointer active:scale-[0.98] transition-transform select-none"
            onClick={() => setExpanded(!expanded)}
        >
            {/* 折叠态头部 */}
            <div className="px-4 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-lg shrink-0 shadow-sm">
                    📞
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-[13px] text-slate-700 font-medium">语音通话</span>
                        {modeText && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-emerald-50 text-emerald-600 rounded-full font-medium">
                                {modeText}
                            </span>
                        )}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                        {durationText} · {turnCount} 条消息
                    </div>
                </div>
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className={`w-4 h-4 text-slate-300 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                >
                    <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                </svg>
            </div>

            {/* 展开态：对话列表 */}
            {expanded && conversation && conversation.length > 0 && (
                <div className="border-t border-slate-100 px-3 py-2 max-h-[300px] overflow-y-auto space-y-1.5">
                    {conversation.map((msg, i) => (
                        <div
                            key={i}
                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div
                                className={`text-[11px] leading-relaxed px-2.5 py-1.5 rounded-xl max-w-[85%] ${
                                    msg.role === 'user'
                                        ? 'bg-emerald-50 text-emerald-800'
                                        : 'bg-slate-50 text-slate-700'
                                }`}
                            >
                                {msg.content}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default VoiceCallSummaryCard;
