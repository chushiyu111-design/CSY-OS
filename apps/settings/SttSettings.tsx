
import React, { useState } from 'react';
import { useOS } from '../../context/OSContext';
import { STT_PROVIDER_DEFAULTS } from '../../types/stt';
import type { SttProvider } from '../../types/stt';

/** 识别语言选项 */
const STT_LANGUAGE_OPTIONS: { value: string; label: string; hint?: string }[] = [
    { value: '', label: '自动探测', hint: '让模型自动判断语种' },
    { value: 'zh', label: '强制中文', hint: '推荐：彻底杜绝韩文幻觉' },
    { value: 'en', label: '强制英文' },
    { value: 'ja', label: '日本語' },
    { value: 'ko', label: '한국어' },
];

const SttSettings: React.FC = () => {
    const { sttConfig, updateSttConfig, addToast } = useOS();

    const [sttProvider, setSttProvider] = useState<SttProvider>(sttConfig.provider);
    const [sttGroqKey, setSttGroqKey] = useState(sttConfig.groqApiKey);
    const [sttSiliconKey, setSttSiliconKey] = useState(sttConfig.siliconflowApiKey);
    const [sttLanguage, setSttLanguage] = useState(sttConfig.language || '');

    return (
        <section className="relative overflow-hidden bg-[#eef4fb]/70 backdrop-blur-sm rounded-3xl p-6 shadow-sm border border-[#d4e4f7]/60">
            <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-gradient-to-br from-[#c8d5f5]/30 to-[#d4e4f7]/30 blur-2xl pointer-events-none" />
            <div className="absolute -bottom-6 -left-6 w-20 h-20 rounded-full bg-gradient-to-tr from-[#f5d5c8]/25 to-[#c8d5f5]/25 blur-xl pointer-events-none" />

            <div className="relative flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-gradient-to-br from-[#c8d5f5]/60 to-[#d4e4f7]/60 backdrop-blur-sm rounded-2xl text-[#7b8db8]">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" /></svg>
                    </div>
                    <h2 className="text-sm font-semibold text-[#6b7f99] tracking-wider">语音识别</h2>
                </div>
            </div>

            <p className="relative text-xs text-[#8b9bb1] mb-4 leading-relaxed">
                使用云端 API 识别语音消息。支持 Groq (Whisper) 和硅基流动 (SenseVoice)，均可免费注册使用。
            </p>

            <div className="relative space-y-4">
                {/* 供应商选择 */}
                <div>
                    <label className="text-[10px] font-bold text-[#8b9bb1] uppercase tracking-widest mb-1.5 block pl-1">当前供应商</label>
                    <div className="grid grid-cols-2 gap-2">
                        {(Object.keys(STT_PROVIDER_DEFAULTS) as SttProvider[]).map(p => (
                            <button
                                key={p}
                                onClick={() => setSttProvider(p)}
                                className={`py-3 rounded-xl text-xs font-bold transition-all ${sttProvider === p
                                    ? 'bg-[#7b8db8]/15 text-[#5a6f94] ring-1 ring-[#7b8db8]/30'
                                    : 'bg-white/50 text-[#8b9bb1] border border-[#d4e4f7]/60'
                                    }`}
                            >
                                {STT_PROVIDER_DEFAULTS[p].label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 识别语言选择 */}
                <div>
                    <label className="text-[10px] font-bold text-[#8b9bb1] uppercase tracking-widest mb-1.5 block pl-1">识别语言</label>
                    <div className="flex flex-wrap gap-1.5">
                        {STT_LANGUAGE_OPTIONS.map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => setSttLanguage(opt.value)}
                                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${sttLanguage === opt.value
                                    ? 'bg-[#7b8db8]/15 text-[#5a6f94] ring-1 ring-[#7b8db8]/30'
                                    : 'bg-white/50 text-[#8b9bb1] border border-[#d4e4f7]/60'
                                    }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                    {/* 提示文字 */}
                    {sttLanguage === '' && (
                        <p className="text-[10px] text-[#c4956a] mt-1.5 pl-1 leading-relaxed">
                            ⚠️ 自动探测模式下，静音或噪音可能被 Whisper 幻觉为韩文。建议选择「强制中文」。
                        </p>
                    )}
                    {sttLanguage === 'zh' && (
                        <p className="text-[10px] text-[#7faa95] mt-1.5 pl-1">
                            ✓ 已锁定中文识别，不会再出现韩文幻觉问题。
                        </p>
                    )}
                </div>

                {/* Groq API Key */}
                <div>
                    <label className="text-[10px] font-bold text-[#8b9bb1] uppercase tracking-widest mb-1.5 block pl-1">Groq API Key</label>
                    <input
                        type="password"
                        value={sttGroqKey}
                        onChange={e => setSttGroqKey(e.target.value)}
                        placeholder="gsk_..."
                        className="w-full bg-white/60 border border-[#d4e4f7]/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all"
                    />
                    <a href={STT_PROVIDER_DEFAULTS.groq.registerUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#7b8db8] hover:underline mt-1.5 inline-block pl-1">
                        → 免费获取 Groq Key
                    </a>
                </div>

                {/* 硅基流动 API Key */}
                <div>
                    <label className="text-[10px] font-bold text-[#8b9bb1] uppercase tracking-widest mb-1.5 block pl-1">硅基流动 API Key</label>
                    <input
                        type="password"
                        value={sttSiliconKey}
                        onChange={e => setSttSiliconKey(e.target.value)}
                        placeholder="sk-..."
                        className="w-full bg-white/60 border border-[#d4e4f7]/60 rounded-xl px-4 py-2.5 text-sm font-mono focus:bg-white transition-all"
                    />
                    <a href={STT_PROVIDER_DEFAULTS.siliconflow.registerUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#7b8db8] hover:underline mt-1.5 inline-block pl-1">
                        → 免费获取硅基流动 Key
                    </a>
                </div>

                {/* 保存按钮 */}
                <button
                    onClick={() => {
                        updateSttConfig({
                            provider: sttProvider,
                            groqApiKey: sttGroqKey,
                            siliconflowApiKey: sttSiliconKey,
                            language: sttLanguage || undefined,
                        });
                        addToast('语音识别配置已保存', 'success');
                    }}
                    className="w-full py-3 rounded-2xl font-bold text-white shadow-lg shadow-[#7b8db8]/20 bg-gradient-to-r from-[#7b8db8] to-[#8ba3c8] active:scale-95 transition-all"
                >
                    保存配置
                </button>
            </div>

            {/* 状态指示 */}
            <div className="relative grid grid-cols-3 gap-2 text-center mt-4">
                <div className={`py-3 rounded-2xl text-[10px] font-bold backdrop-blur-sm ${sttConfig.groqApiKey ? 'bg-[#e6f5ee]/60 text-[#7faa95] border border-[#d0e8da]/50' : 'bg-[#f0ebe5]/60 text-[#b8aaa0] border border-[#e5ddd4]/50'}`}>
                    <div className="text-xs mb-1 opacity-70">{sttConfig.groqApiKey ? '●' : '○'}</div>
                    Groq
                </div>
                <div className={`py-3 rounded-2xl text-[10px] font-bold backdrop-blur-sm ${sttConfig.siliconflowApiKey ? 'bg-[#e6f5ee]/60 text-[#7faa95] border border-[#d0e8da]/50' : 'bg-[#f0ebe5]/60 text-[#b8aaa0] border border-[#e5ddd4]/50'}`}>
                    <div className="text-xs mb-1 opacity-70">{sttConfig.siliconflowApiKey ? '●' : '○'}</div>
                    硅基流动
                </div>
                <div className="py-3 rounded-2xl text-[10px] font-bold bg-[#eef4fb]/60 backdrop-blur-sm text-[#7b8db8] border border-[#d4e4f7]/50">
                    <div className="text-[9px] mb-1 font-mono opacity-70">ACTIVE</div>
                    {STT_PROVIDER_DEFAULTS[sttConfig.provider]?.label?.split(' ')[0] || 'Unknown'}
                </div>
            </div>
        </section>
    );
};

export default SttSettings;
