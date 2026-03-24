
import React, { useState } from 'react';
import { useOS } from '../../context/OSContext';
import { MinimaxTts } from '../../utils/minimaxTts';
import { DEFAULT_TTS_PREPROCESS_PROMPT } from '../../types/tts';
import type { TtsConfig } from '../../types/tts';
import Modal from '../../components/os/Modal';

const TtsSettings: React.FC = () => {
    const { ttsConfig, updateTtsConfig, addToast } = useOS();

    const [showTtsModal, setShowTtsModal] = useState(false);

    // TTS 配置本地状态
    const [ttsBaseUrl, setTtsBaseUrl] = useState(ttsConfig.baseUrl || '/minimax-api');
    const [ttsApiKey, setTtsApiKey] = useState(ttsConfig.apiKey);
    const [ttsGroupId, setTtsGroupId] = useState((ttsConfig as any).groupId || '');
    const [ttsModel, setTtsModel] = useState(ttsConfig.model);
    const [ttsVoiceId, setTtsVoiceId] = useState(ttsConfig.voiceSetting.voice_id);
    const [ttsSpeed, setTtsSpeed] = useState(ttsConfig.voiceSetting.speed);
    const [ttsVol, setTtsVol] = useState(ttsConfig.voiceSetting.vol);
    const [ttsPitch, setTtsPitch] = useState(ttsConfig.voiceSetting.pitch);
    const [ttsEmotion, setTtsEmotion] = useState(ttsConfig.voiceSetting.emotion || '');
    const [ttsFormat, setTtsFormat] = useState(ttsConfig.audioSetting.format);
    const [ttsSampleRate, setTtsSampleRate] = useState(ttsConfig.audioSetting.audio_sample_rate);
    const [ttsBitrate, setTtsBitrate] = useState(ttsConfig.audioSetting.bitrate);
    const [ttsChannel, setTtsChannel] = useState(ttsConfig.audioSetting.channel);
    const [ttsModifyPitch, setTtsModifyPitch] = useState(ttsConfig.voiceModify?.pitch || 0);
    const [ttsModifyIntensity, setTtsModifyIntensity] = useState(ttsConfig.voiceModify?.intensity || 0);
    const [ttsModifyTimbre, setTtsModifyTimbre] = useState(ttsConfig.voiceModify?.timbre || 0);
    const [ttsSoundEffect, setTtsSoundEffect] = useState(ttsConfig.voiceModify?.sound_effects || '');
    const [ttsLangBoost, setTtsLangBoost] = useState(ttsConfig.languageBoost || '');
    const [ttsPronounceDict, setTtsPronounceDict] = useState((ttsConfig.pronunciationDict?.tone || []).join('\n'));
    const [ttsPreprocessEnabled, setTtsPreprocessEnabled] = useState(ttsConfig.preprocessConfig.enabled);
    const [ttsPreprocessPrompt, setTtsPreprocessPrompt] = useState(ttsConfig.preprocessConfig.prompt);
    const [ttsPreprocessApiBase, setTtsPreprocessApiBase] = useState(ttsConfig.preprocessConfig.apiBase || '');
    const [ttsPreprocessApiKey, setTtsPreprocessApiKey] = useState(ttsConfig.preprocessConfig.apiKey || '');
    const [ttsPreprocessModel, setTtsPreprocessModel] = useState(ttsConfig.preprocessConfig.model || '');
    const [ppModels, setPpModels] = useState<string[]>([]);
    const [ppLoading, setPpLoading] = useState(false);
    const [ppStatus, setPpStatus] = useState('');
    const [ttsPresets, setTtsPresets] = useState<Array<{ name: string; config: any }>>(() => {
        try { return JSON.parse(localStorage.getItem('os_tts_presets') || '[]'); } catch { return []; }
    });
    const [ttsPresetName, setTtsPresetName] = useState('');
    const [ttsTestText, setTtsTestText] = useState('你好，这是一段语音合成测试。');
    const [ttsTestStatus, setTtsTestStatus] = useState('');
    const [ttsTestAudioUrl, setTtsTestAudioUrl] = useState('');

    const handleSaveTts = () => {
        updateTtsConfig({
            baseUrl: ttsBaseUrl, apiKey: ttsApiKey, groupId: ttsGroupId, model: ttsModel,
            voiceSetting: { voice_id: ttsVoiceId, speed: ttsSpeed, vol: ttsVol, pitch: ttsPitch, emotion: ttsEmotion || undefined },
            audioSetting: { audio_sample_rate: ttsSampleRate, bitrate: ttsBitrate, format: ttsFormat as 'mp3' | 'pcm' | 'flac', channel: ttsChannel },
            voiceModify: (ttsModifyPitch || ttsModifyIntensity || ttsModifyTimbre || ttsSoundEffect) ? { pitch: ttsModifyPitch, intensity: ttsModifyIntensity, timbre: ttsModifyTimbre, sound_effects: ttsSoundEffect || undefined } : undefined,
            languageBoost: ttsLangBoost || undefined,
            pronunciationDict: ttsPronounceDict.trim() ? { tone: ttsPronounceDict.split('\n').filter(l => l.trim()) } : undefined,
            preprocessConfig: { enabled: ttsPreprocessEnabled, prompt: ttsPreprocessPrompt, apiBase: ttsPreprocessApiBase, apiKey: ttsPreprocessApiKey, model: ttsPreprocessModel },
        });
        addToast('语音合成配置已保存', 'success');
        setShowTtsModal(false);
    };

    return (
        <>
            {/* 语音合成概览卡片 */}
            <section className="relative overflow-hidden bg-[#fdf6f0]/70 backdrop-blur-sm rounded-3xl p-6 shadow-sm border border-[#f0e4d7]/60">
                <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-gradient-to-br from-[#f5d5c8]/30 to-[#e8cfe8]/30 blur-2xl pointer-events-none" />
                <div className="absolute -bottom-6 -left-6 w-20 h-20 rounded-full bg-gradient-to-tr from-[#d4e4f7]/25 to-[#f5d5c8]/25 blur-xl pointer-events-none" />

                <div className="relative flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-gradient-to-br from-[#f5d5c8]/60 to-[#e8cfe8]/60 backdrop-blur-sm rounded-2xl text-[#b8849b]">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" /></svg>
                        </div>
                        <h2 className="text-sm font-semibold text-[#8b7e74] tracking-wider">语音合成</h2>
                    </div>
                    <button onClick={() => setShowTtsModal(true)} className="text-[10px] bg-gradient-to-r from-[#e8cfe8]/70 to-[#f5d5c8]/70 backdrop-blur-sm text-[#9b7e8f] px-4 py-1.5 rounded-full font-bold shadow-sm active:scale-95 transition-transform border border-white/40">配置</button>
                </div>

                <p className="relative text-xs text-[#a89b91] mb-4 leading-relaxed">
                    使用 MiniMax 语音合成 API，让角色用声音说话。支持多种音色、情绪和声音效果。
                </p>

                <div className="relative grid grid-cols-3 gap-3 text-center">
                    <div className={`py-3.5 rounded-2xl text-xs font-bold backdrop-blur-sm ${ttsConfig.apiKey ? 'bg-[#e6f5ee]/60 text-[#7faa95] border border-[#d0e8da]/50' : 'bg-[#f0ebe5]/60 text-[#b8aaa0] border border-[#e5ddd4]/50'}`}>
                        <div className="text-sm mb-1.5 opacity-70">{ttsConfig.apiKey ? '●' : '○'}</div>
                        {ttsConfig.apiKey ? '已配置' : '未配置'}
                    </div>
                    <div className="py-3.5 rounded-2xl text-xs font-bold bg-[#fce4ec]/50 backdrop-blur-sm text-[#c4929f] border border-[#f5d5da]/50">
                        <div className="text-[10px] mb-1.5 font-mono opacity-70">MODEL</div>
                        {ttsConfig.model.replace('speech-', '')}
                    </div>
                    <div className="py-3.5 rounded-2xl text-xs font-bold bg-[#f0eaf7]/50 backdrop-blur-sm text-[#a18db8] border border-[#e5ddf0]/50">
                        <div className="text-[10px] mb-1.5 font-mono opacity-70">VOICE</div>
                        {ttsConfig.voiceSetting.voice_id.length > 10 ? ttsConfig.voiceSetting.voice_id.slice(0, 10) + '...' : ttsConfig.voiceSetting.voice_id}
                    </div>
                </div>
            </section>

            {/* TTS 配置 Modal */}
            <Modal isOpen={showTtsModal} title="语音合成配置" onClose={() => setShowTtsModal(false)}
                footer={<button onClick={handleSaveTts} className="w-full py-3 bg-gradient-to-r from-[#e8a0bf] to-[#c4b0d9] text-white font-bold rounded-2xl shadow-lg border border-white/30">保存配置</button>}>
                <div className="space-y-6 max-h-[60vh] overflow-y-auto no-scrollbar">

                    {/* 预设 */}
                    <div className="bg-[#fef0e7]/50 backdrop-blur-sm p-5 rounded-3xl space-y-3 border border-[#f0e4d7]/40">
                        <div className="flex items-center gap-2 mb-1"><span className="text-sm font-bold text-[#c4929f]">预设管理</span></div>
                        <div className="flex gap-2">
                            <input type="text" value={ttsPresetName} onChange={e => setTtsPresetName(e.target.value)} className="flex-1 bg-white/70 backdrop-blur-sm border border-[#f0e4d7]/60 rounded-xl px-3 py-2 text-[11px] focus:bg-white/90 transition-all" placeholder="输入预设名称..." />
                            <button onClick={() => {
                                if (!ttsPresetName.trim()) return;
                                const preset = {
                                    name: ttsPresetName.trim(),
                                    config: { voiceId: ttsVoiceId, speed: ttsSpeed, vol: ttsVol, pitch: ttsPitch, emotion: ttsEmotion, model: ttsModel, langBoost: ttsLangBoost, modifyPitch: ttsModifyPitch, modifyIntensity: ttsModifyIntensity, modifyTimbre: ttsModifyTimbre, soundEffect: ttsSoundEffect, format: ttsFormat, sampleRate: ttsSampleRate, bitrate: ttsBitrate, channel: ttsChannel }
                                };
                                const updated = [...ttsPresets.filter(p => p.name !== preset.name), preset];
                                setTtsPresets(updated);
                                localStorage.setItem('os_tts_presets', JSON.stringify(updated));
                                setTtsPresetName('');
                                addToast(`预设「${preset.name}」已保存`, 'success');
                            }} className="text-[10px] bg-gradient-to-r from-[#e8a0bf] to-[#c4b0d9] text-white px-3 py-2 rounded-xl font-bold whitespace-nowrap active:scale-95 transition-transform border border-white/30">保存预设</button>
                        </div>
                        {ttsPresets.length > 0 && (
                            <div className="space-y-1.5">
                                {ttsPresets.map((p, i) => (
                                    <div key={i} className="flex items-center gap-2 bg-white/60 backdrop-blur-sm rounded-xl px-3 py-2 border border-[#f0e4d7]/30">
                                        <span className="flex-1 text-[11px] font-medium text-[#8b7e74] truncate">{p.name}</span>
                                        <button onClick={() => {
                                            const c = p.config;
                                            setTtsVoiceId(c.voiceId || ''); setTtsSpeed(c.speed ?? 1); setTtsVol(c.vol ?? 1); setTtsPitch(c.pitch ?? 0); setTtsEmotion(c.emotion || '');
                                            setTtsModel(c.model || 'speech-2.8-hd'); setTtsLangBoost(c.langBoost || '');
                                            setTtsModifyPitch(c.modifyPitch ?? 0); setTtsModifyIntensity(c.modifyIntensity ?? 0); setTtsModifyTimbre(c.modifyTimbre ?? 0); setTtsSoundEffect(c.soundEffect || '');
                                            setTtsFormat(c.format || 'mp3'); setTtsSampleRate(c.sampleRate ?? 32000); setTtsBitrate(c.bitrate ?? 128000); setTtsChannel(c.channel ?? 1);
                                            addToast(`已加载预设「${p.name}」`, 'success');
                                        }} className="text-[9px] bg-[#e8cfe8]/50 text-[#9b7e8f] px-2 py-1 rounded-lg font-bold active:scale-95 transition-transform">加载</button>
                                        <button onClick={() => {
                                            const updated = ttsPresets.filter((_, j) => j !== i);
                                            setTtsPresets(updated);
                                            localStorage.setItem('os_tts_presets', JSON.stringify(updated));
                                        }} className="text-[9px] text-[#b8aaa0] px-1.5 py-1 rounded-lg hover:text-red-400 transition-colors">✕</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* API Key */}
                    <div className="bg-[#f3eef8]/60 backdrop-blur-sm p-5 rounded-3xl space-y-3 border border-[#e5ddf0]/40">
                        <div className="flex items-center gap-2 mb-3"><span className="text-sm font-bold text-[#9b7e8f]">API 连接</span></div>
                        <div><label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">API Base URL (代理直连)</label>
                            <input type="text" value={ttsBaseUrl} onChange={e => setTtsBaseUrl(e.target.value)} className="w-full bg-white/60 backdrop-blur-sm border border-[#e5ddf0]/50 rounded-xl px-3 py-2.5 text-sm font-mono focus:bg-white/80 transition-all" placeholder="默认 /minimax-api" />
                            <p className="text-[10px] text-[#b8aaa0]/80 mt-1">默认值 <span className="font-mono bg-white/50 inline-block px-1 rounded text-[#9b7e8f]">/minimax-api</span> 即可，无需修改。</p></div>
                        <div><label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">MiniMax API Key</label>
                            <input type="password" value={ttsApiKey} onChange={e => setTtsApiKey(e.target.value)} className="w-full bg-white/60 backdrop-blur-sm border border-[#e5ddf0]/50 rounded-xl px-3 py-2.5 text-sm font-mono focus:bg-white/80 transition-all" placeholder="Bearer Token" /></div>
                        <div><label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">Group ID <span className="text-[#c4929f]">（必填）</span></label>
                            <input type="text" value={ttsGroupId} onChange={e => setTtsGroupId(e.target.value)} className="w-full bg-white/60 backdrop-blur-sm border border-[#e5ddf0]/50 rounded-xl px-3 py-2.5 text-sm font-mono focus:bg-white/80 transition-all" placeholder="在 MiniMax 平台 → 账号 → 组织信息 中获取" /></div>
                        <div><label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">模型</label>
                            <select value={ttsModel} onChange={e => setTtsModel(e.target.value)} className="w-full bg-white/60 backdrop-blur-sm border border-[#e5ddf0]/50 rounded-xl px-3 py-2.5 text-sm focus:bg-white/80 transition-all">
                                <option value="speech-2.8-hd">speech-2.8-hd (最新旗舰)</option><option value="speech-2.8-turbo">speech-2.8-turbo (最新快速)</option>
                                <option value="speech-2.6-hd">speech-2.6-hd</option><option value="speech-2.6-turbo">speech-2.6-turbo</option>
                                <option value="speech-02-hd">speech-02-hd</option><option value="speech-02-turbo">speech-02-turbo</option>
                                <option value="speech-01-hd">speech-01-hd</option><option value="speech-01-turbo">speech-01-turbo</option>
                            </select></div>
                    </div>

                    {/* 音色设置 */}
                    <div className="bg-[#fce4ec]/40 backdrop-blur-sm p-5 rounded-3xl space-y-3 border border-[#f5d5da]/40">
                        <div className="flex items-center gap-2 mb-3"><span className="text-sm font-bold text-[#c4929f]">音色设置</span></div>
                        <div><label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">Voice ID</label>
                            <input type="text" value={ttsVoiceId} onChange={e => setTtsVoiceId(e.target.value)} className="w-full bg-white/60 backdrop-blur-sm border border-[#f5d5da]/50 rounded-xl px-3 py-2.5 text-[11px] font-mono focus:bg-white/80 transition-all" placeholder="音色编号" /></div>
                        <div className="flex gap-1.5 flex-wrap">
                            {['audiobook_male_1', 'Chinese (Mandarin)_Lyrical_Voice', 'English_Graceful_Lady', 'Japanese_Whisper_Belle'].map(v => (
                                <button key={v} onClick={() => setTtsVoiceId(v)} className={`text-[9px] px-2 py-1 rounded-lg font-medium transition-colors ${ttsVoiceId === v ? 'bg-[#c4929f] text-white' : 'bg-white/60 text-[#c4929f] border border-[#f5d5da]/50'}`}>{v.length > 18 ? v.slice(0, 18) + '...' : v}</button>
                            ))}
                        </div>
                        <div className="space-y-3">
                            {[{ label: '语速', value: ttsSpeed, set: setTtsSpeed, min: 0.5, max: 2, step: 0.1, fmt: (v: number) => v.toFixed(1) },
                            { label: '音量', value: ttsVol, set: setTtsVol, min: 0.1, max: 10, step: 0.1, fmt: (v: number) => v.toFixed(1) },
                            { label: '语调', value: ttsPitch, set: setTtsPitch, min: -12, max: 12, step: 1, fmt: (v: number) => String(v) },
                            ].map(s => (
                                <div key={s.label} className="flex items-center gap-2">
                                    <label className="text-[10px] font-bold text-[#b8aaa0] w-8">{s.label}</label>
                                    <button onClick={() => s.set(Math.max(s.min, +(s.value - s.step).toFixed(2)))} className="w-7 h-7 rounded-lg bg-white/60 border border-[#f5d5da]/50 text-[#c4929f] font-bold text-sm active:scale-90 transition-transform">−</button>
                                    <input type="number" value={s.fmt(s.value)} onChange={e => { const v = Number(e.target.value); if (!isNaN(v)) s.set(Math.max(s.min, Math.min(s.max, v))); }} className="w-16 text-center bg-white/60 border border-[#f5d5da]/50 rounded-lg px-1 py-1 text-[11px] font-mono font-bold text-[#c4929f]" step={s.step} min={s.min} max={s.max} />
                                    <button onClick={() => s.set(Math.min(s.max, +(s.value + s.step).toFixed(2)))} className="w-7 h-7 rounded-lg bg-white/60 border border-[#f5d5da]/50 text-[#c4929f] font-bold text-sm active:scale-90 transition-transform">+</button>
                                    <span className="text-[9px] text-[#b8aaa0]">{s.min}~{s.max}</span>
                                </div>
                            ))}
                        </div>
                        <div><label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">情绪</label>
                            <div className="flex gap-1.5 flex-wrap">
                                {[{ v: '', l: '自动' }, { v: 'happy', l: '开心' }, { v: 'sad', l: '悲伤' }, { v: 'angry', l: '愤怒' }, { v: 'calm', l: '平静' }, { v: 'surprised', l: '惊讶' }, { v: 'fearful', l: '恐惧' }, { v: 'disgusted', l: '厌恶' }, { v: 'fluent', l: '生动' }].map(e => (
                                    <button key={e.v} onClick={() => setTtsEmotion(e.v)} className={`text-[9px] px-2.5 py-1.5 rounded-lg font-medium transition-colors ${ttsEmotion === e.v ? 'bg-[#c4929f] text-white' : 'bg-white/60 text-[#c4929f] border border-[#f5d5da]/50'}`}>{e.l}</button>
                                ))}
                            </div>
                        </div>
                        <div><label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">语种增强</label>
                            <select value={ttsLangBoost} onChange={e => setTtsLangBoost(e.target.value)} className="w-full bg-white/60 backdrop-blur-sm border border-[#f5d5da]/50 rounded-xl px-3 py-2.5 text-sm focus:bg-white/80 transition-all">
                                <option value="">不启用</option><option value="auto">自动判断</option><option value="Chinese">中文</option><option value="Chinese,Yue">粤语</option>
                                <option value="English">英语</option><option value="Japanese">日语</option><option value="Korean">韩语</option>
                                <option value="French">法语</option><option value="German">德语</option><option value="Spanish">西班牙语</option><option value="Russian">俄语</option>
                            </select>
                        </div>
                    </div>

                    {/* 声音效果器 */}
                    <div className="bg-[#e8f0fe]/50 backdrop-blur-sm p-5 rounded-3xl space-y-3 border border-[#d4e4f7]/40">
                        <div className="flex items-center gap-2 mb-3"><span className="text-sm font-bold text-[#8ba4c4]">声音效果器</span></div>
                        <div className="space-y-3">
                            {[{ label: '音高', desc: '低沉↔明亮', value: ttsModifyPitch, set: setTtsModifyPitch },
                            { label: '强度', desc: '刚劲↔轻柔', value: ttsModifyIntensity, set: setTtsModifyIntensity },
                            { label: '音色', desc: '浑厚↔清脆', value: ttsModifyTimbre, set: setTtsModifyTimbre },
                            ].map(s => (
                                <div key={s.label} className="flex items-center gap-2">
                                    <label className="text-[10px] font-bold text-[#b8aaa0] w-14 leading-tight">{s.label}<br /><span className="text-[8px] font-normal">{s.desc}</span></label>
                                    <button onClick={() => s.set(Math.max(-100, s.value - 10))} className="w-7 h-7 rounded-lg bg-white/60 border border-[#d4e4f7]/50 text-[#8ba4c4] font-bold text-sm active:scale-90 transition-transform">−</button>
                                    <input type="number" value={s.value} onChange={e => { const v = Number(e.target.value); if (!isNaN(v)) s.set(Math.max(-100, Math.min(100, v))); }} className="w-16 text-center bg-white/60 border border-[#d4e4f7]/50 rounded-lg px-1 py-1 text-[11px] font-mono font-bold text-[#8ba4c4]" step={10} min={-100} max={100} />
                                    <button onClick={() => s.set(Math.min(100, s.value + 10))} className="w-7 h-7 rounded-lg bg-white/60 border border-[#d4e4f7]/50 text-[#8ba4c4] font-bold text-sm active:scale-90 transition-transform">+</button>
                                    <span className="text-[9px] text-[#b8aaa0]">-100~100</span>
                                </div>
                            ))}
                        </div>
                        <div><label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">音效</label>
                            <div className="flex gap-1.5 flex-wrap">
                                {[{ v: '', l: '无' }, { v: 'spacious_echo', l: '空旷回音' }, { v: 'auditorium_echo', l: '礼堂广播' }, { v: 'lofi_telephone', l: '电话失真' }, { v: 'robotic', l: '电音' }].map(e => (
                                    <button key={e.v} onClick={() => setTtsSoundEffect(e.v)} className={`text-[9px] px-2.5 py-1.5 rounded-lg font-medium transition-colors ${ttsSoundEffect === e.v ? 'bg-[#8ba4c4] text-white' : 'bg-white/60 text-[#8ba4c4] border border-[#d4e4f7]/50'}`}>{e.l}</button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* 音频格式 */}
                    <div className="bg-[#e6f5ee]/50 backdrop-blur-sm p-5 rounded-3xl space-y-3 border border-[#d0e8da]/40">
                        <div className="flex items-center gap-2 mb-3"><span className="text-sm font-bold text-[#7faa95]">音频格式</span></div>
                        <div className="grid grid-cols-2 gap-3">
                            <div><label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">格式</label>
                                <select value={ttsFormat} onChange={e => setTtsFormat(e.target.value as any)} className="w-full bg-white/60 backdrop-blur-sm border border-[#d0e8da]/50 rounded-xl px-3 py-2.5 text-sm focus:bg-white/80 transition-all">
                                    <option value="mp3">MP3</option><option value="pcm">PCM</option><option value="flac">FLAC</option></select></div>
                            <div><label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">采样率</label>
                                <select value={ttsSampleRate} onChange={e => setTtsSampleRate(Number(e.target.value))} className="w-full bg-white/60 backdrop-blur-sm border border-[#d0e8da]/50 rounded-xl px-3 py-2.5 text-sm focus:bg-white/80 transition-all">
                                    {[8000, 16000, 22050, 24000, 32000, 44100].map(r => <option key={r} value={r}>{r} Hz</option>)}</select></div>
                            <div><label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">比特率</label>
                                <select value={ttsBitrate} onChange={e => setTtsBitrate(Number(e.target.value))} className="w-full bg-white/60 backdrop-blur-sm border border-[#d0e8da]/50 rounded-xl px-3 py-2.5 text-sm focus:bg-white/80 transition-all">
                                    {[32000, 64000, 128000, 256000].map(b => <option key={b} value={b}>{b / 1000} kbps</option>)}</select></div>
                            <div><label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">声道</label>
                                <select value={ttsChannel} onChange={e => setTtsChannel(Number(e.target.value))} className="w-full bg-white/60 backdrop-blur-sm border border-[#d0e8da]/50 rounded-xl px-3 py-2.5 text-sm focus:bg-white/80 transition-all">
                                    <option value={1}>单声道</option><option value={2}>双声道</option></select></div>
                        </div>
                    </div>

                    {/* 发音词典 */}
                    <div className="bg-[#fef5e7]/50 backdrop-blur-sm p-5 rounded-3xl space-y-3 border border-[#f0e4d7]/40">
                        <div className="flex items-center gap-2 mb-3"><span className="text-sm font-bold text-[#c4a86c]">发音词典</span></div>
                        <textarea value={ttsPronounceDict} onChange={e => setTtsPronounceDict(e.target.value)} rows={3} className="w-full bg-white/60 backdrop-blur-sm border border-[#f0e4d7]/50 rounded-xl px-3 py-2.5 text-[11px] font-mono resize-none focus:bg-white/80 transition-all" placeholder={`每行一条规则，例如：\n燕少飞/(yan4)(shao3)(fei1)\nomg/oh my god`} />
                        {/[（）]/.test(ttsPronounceDict) && (
                            <p className="text-[10px] text-amber-600 bg-amber-50/80 px-3 py-1.5 rounded-lg font-medium">⚠️ 检测到中文括号（），请替换为英文半角括号 ()，否则注音不会生效</p>
                        )}
                        <p className="text-[10px] text-[#c4a86c]/70">每行一条注音规则。中文声调: 1=一声 2=二声 3=三声 4=四声 5=轻声。注意使用英文半角括号 ()</p>
                    </div>

                    {/* AI 预处理 */}
                    <div className="bg-[#f0eaf7]/50 backdrop-blur-sm p-5 rounded-3xl space-y-3 border border-[#e5ddf0]/40">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2"><span className="text-sm font-bold text-[#a18db8]">AI 语气预处理</span></div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={ttsPreprocessEnabled} onChange={e => setTtsPreprocessEnabled(e.target.checked)} className="sr-only peer" />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#c4b0d9]"></div>
                            </label>
                        </div>
                        <p className="text-[10px] text-[#a18db8]/70">开启后，发送到 TTS 之前先用独立 AI 为文本添加语气词标签 (laughs)(sighs) 等，让朗读更自然。</p>
                        {ttsPreprocessEnabled && (
                            <div className="space-y-2">
                                <div><label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">API Base URL</label>
                                    <input type="text" value={ttsPreprocessApiBase} onChange={e => setTtsPreprocessApiBase(e.target.value)} className="w-full bg-white/60 backdrop-blur-sm border border-[#e5ddf0]/50 rounded-xl px-3 py-2.5 text-[11px] font-mono focus:bg-white/80 transition-all" placeholder="https://api.openai.com/v1 或其他兼容接口" /></div>
                                <div><label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">API Key</label>
                                    <input type="password" value={ttsPreprocessApiKey} onChange={e => setTtsPreprocessApiKey(e.target.value)} className="w-full bg-white/60 backdrop-blur-sm border border-[#e5ddf0]/50 rounded-xl px-3 py-2.5 text-[11px] font-mono focus:bg-white/80 transition-all" placeholder="sk-..." /></div>
                                <div><label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">模型 <span className="text-[#a18db8] font-normal normal-case">推荐 flash/turbo</span></label>
                                    <div className="flex gap-2">
                                        <input type="text" value={ttsPreprocessModel} onChange={e => setTtsPreprocessModel(e.target.value)} className="flex-1 bg-white/60 backdrop-blur-sm border border-[#e5ddf0]/50 rounded-xl px-3 py-2.5 text-[11px] font-mono focus:bg-white/80 transition-all" placeholder="gemini-2.0-flash / gpt-4o-mini ..." />
                                        <button onClick={async () => {
                                            if (!ttsPreprocessApiBase) { setPpStatus('❌ 请先填写 URL'); return; }
                                            setPpLoading(true); setPpStatus('⏳ 拉取中...');
                                            try {
                                                const base = ttsPreprocessApiBase.replace(/\/+$/, '');
                                                const res = await fetch(`${base}/models`, { headers: { 'Authorization': `Bearer ${ttsPreprocessApiKey}`, 'Content-Type': 'application/json' } });
                                                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                                                const data = await res.json();
                                                const list = (data.data || data.models || []).map((m: any) => m.id || m).filter(Boolean);
                                                setPpModels(list);
                                                if (list.length > 0 && !ttsPreprocessModel) setTtsPreprocessModel(list[0]);
                                                setPpStatus(`✅ 获取到 ${list.length} 个模型`);
                                            } catch (e: any) { setPpStatus(`❌ ${e.message}`); }
                                            finally { setPpLoading(false); }
                                        }} disabled={ppLoading} className="text-[10px] bg-[#e8cfe8]/50 text-[#a18db8] px-3 py-2 rounded-xl font-bold whitespace-nowrap active:scale-95 transition-transform disabled:opacity-50">{ppLoading ? '拉取中...' : '拉取模型'}</button>
                                    </div>
                                    {ppModels.length > 0 && (
                                        <div className="mt-1.5 max-h-24 overflow-y-auto bg-white/60 backdrop-blur-sm border border-[#e5ddf0]/50 rounded-xl">
                                            {ppModels.map(m => (<button key={m} onClick={() => setTtsPreprocessModel(m)} className={`block w-full text-left px-3 py-1.5 text-[10px] font-mono truncate transition-colors ${ttsPreprocessModel === m ? 'bg-[#e8cfe8]/50 text-[#9b7e8f] font-bold' : 'text-[#8b7e74] hover:bg-[#f0eaf7]/50'}`}>{m}</button>))}
                                        </div>
                                    )}
                                </div>
                                <button onClick={async () => {
                                    if (!ttsPreprocessApiBase || !ttsPreprocessApiKey || !ttsPreprocessModel) { setPpStatus('❌ 请先填写完整配置'); return; }
                                    setPpStatus('⏳ 测试连接中...');
                                    try {
                                        const base = ttsPreprocessApiBase.replace(/\/+$/, '');
                                        const res = await fetch(`${base}/chat/completions`, { method: 'POST', headers: { 'Authorization': `Bearer ${ttsPreprocessApiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: ttsPreprocessModel, messages: [{ role: 'user', content: 'hello' }], max_tokens: 1 }) });
                                        if (res.ok) setPpStatus('✅ 连接成功！模型可用');
                                        else if (res.status === 401) setPpStatus('❌ API Key 无效');
                                        else if (res.status === 404) setPpStatus('❌ 模型不存在或 URL 错误');
                                        else setPpStatus(`❌ HTTP ${res.status}`);
                                    } catch (e: any) { setPpStatus(`❌ 网络错误: ${e.message}`); }
                                }} className="w-full py-2 bg-[#e8cfe8]/40 text-[#a18db8] text-xs font-bold rounded-xl active:scale-95 transition-transform">测试连接</button>
                                {ppStatus && <p className={`text-[10px] text-center font-medium ${ppStatus.startsWith('✅') ? 'text-[#7faa95]' : ppStatus.startsWith('⏳') ? 'text-[#b8aaa0]' : 'text-red-400'}`}>{ppStatus}</p>}
                                <div className="border-t border-[#e5ddf0]/50 pt-2">
                                    <label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">预处理提示词</label>
                                    <textarea value={ttsPreprocessPrompt} onChange={e => setTtsPreprocessPrompt(e.target.value)} rows={4} className="w-full bg-white/60 backdrop-blur-sm border border-[#e5ddf0]/50 rounded-xl px-3 py-2.5 text-[11px] resize-none focus:bg-white/80 transition-all" />
                                    <button onClick={() => setTtsPreprocessPrompt(DEFAULT_TTS_PREPROCESS_PROMPT)} className="text-[10px] text-[#a18db8] underline">重置为默认提示词</button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 测试合成 */}
                    <div className="bg-[#f9f3ee]/50 backdrop-blur-sm p-5 rounded-3xl space-y-3 border border-[#f0e4d7]/40">
                        <div className="flex items-center gap-2 mb-3"><span className="text-sm font-bold text-[#8b7e74]">测试合成</span></div>
                        <textarea value={ttsTestText} onChange={e => setTtsTestText(e.target.value)} rows={2} className="w-full bg-white/60 backdrop-blur-sm border border-[#f0e4d7]/50 rounded-xl px-3 py-2.5 text-sm resize-none focus:bg-white/80 transition-all" placeholder="输入测试文本..." />
                        <button
                            onClick={async () => {
                                if (!ttsApiKey) { setTtsTestStatus('❌ 请先填写 API Key'); return; }
                                setTtsTestStatus('⏳ 正在合成...');
                                if (ttsTestAudioUrl) { MinimaxTts.revokeUrl(ttsTestAudioUrl); setTtsTestAudioUrl(''); }
                                try {
                                    const testConfig: TtsConfig = {
                                        baseUrl: ttsBaseUrl, apiKey: ttsApiKey, groupId: ttsGroupId, model: ttsModel,
                                        voiceSetting: { voice_id: ttsVoiceId, speed: ttsSpeed, vol: ttsVol, pitch: ttsPitch, emotion: ttsEmotion || undefined },
                                        audioSetting: { audio_sample_rate: ttsSampleRate, bitrate: ttsBitrate, format: ttsFormat as any, channel: ttsChannel },
                                        voiceModify: (ttsModifyPitch || ttsModifyIntensity || ttsModifyTimbre || ttsSoundEffect) ? { pitch: ttsModifyPitch, intensity: ttsModifyIntensity, timbre: ttsModifyTimbre, sound_effects: ttsSoundEffect || undefined } : undefined,
                                        languageBoost: ttsLangBoost || undefined,
                                        preprocessConfig: { enabled: false, prompt: '', apiBase: '', apiKey: '', model: '' },
                                    };
                                    const result = await MinimaxTts.synthesizeSync(ttsTestText, testConfig, (_s, msg) => setTtsTestStatus(`⏳ ${msg}`));
                                    setTtsTestAudioUrl(result.url);
                                    setTtsTestStatus(`✅ 合成成功！字符数: ${result.usageCharacters || '?'}`);
                                } catch (e: any) { setTtsTestStatus(`❌ ${e.message}`); }
                            }}
                            disabled={ttsTestStatus.startsWith('⏳')}
                            className="w-full py-2.5 bg-gradient-to-r from-[#e8a0bf]/60 to-[#c4b0d9]/60 backdrop-blur-sm text-[#8b7e74] text-xs font-bold rounded-xl active:scale-95 transition-transform disabled:opacity-50 border border-white/30">
                            {ttsTestStatus.startsWith('⏳') ? ttsTestStatus : '测试合成'}
                        </button>
                        {ttsTestAudioUrl && (<audio controls src={ttsTestAudioUrl} className="w-full mt-2" style={{ height: 36 }} />)}
                        {ttsTestStatus && !ttsTestStatus.startsWith('⏳') && (
                            <p className={`text-xs text-center font-medium ${ttsTestStatus.startsWith('✅') ? 'text-[#7faa95]' : 'text-red-400'}`}>{ttsTestStatus}</p>
                        )}
                    </div>
                </div>
            </Modal>
        </>
    );
};

export default TtsSettings;
