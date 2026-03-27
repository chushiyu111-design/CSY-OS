
import React from 'react';
import type { TtsFormState } from './useTtsForm';

interface Props {
    baseUrl: string;
    apiKey: string;
    groupId: string;
    model: string;
    set: <K extends keyof TtsFormState>(field: K, value: TtsFormState[K]) => void;
}

const TtsApiSection: React.FC<Props> = ({ baseUrl, apiKey, groupId, model, set }) => (
    <div className="bg-[#f3eef8]/60 backdrop-blur-sm p-5 rounded-3xl space-y-3 border border-[#e5ddf0]/40">
        <div className="flex items-center gap-2 mb-3"><span className="text-sm font-bold text-[#9b7e8f]">API 连接</span></div>
        <div><label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">API Base URL (代理直连)</label>
            <input type="text" value={baseUrl} onChange={e => set('baseUrl', e.target.value)} className="w-full bg-white/60 backdrop-blur-sm border border-[#e5ddf0]/50 rounded-xl px-3 py-2.5 text-sm font-mono focus:bg-white/80 transition-all" placeholder="默认 /minimax-api" />
            <p className="text-[10px] text-[#b8aaa0]/80 mt-1">默认值 <span className="font-mono bg-white/50 inline-block px-1 rounded text-[#9b7e8f]">/minimax-api</span> 即可，无需修改。</p></div>
        <div><label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">MiniMax API Key</label>
            <input type="password" value={apiKey} onChange={e => set('apiKey', e.target.value)} className="w-full bg-white/60 backdrop-blur-sm border border-[#e5ddf0]/50 rounded-xl px-3 py-2.5 text-sm font-mono focus:bg-white/80 transition-all" placeholder="Bearer Token" /></div>
        <div><label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">Group ID <span className="text-[#c4929f]">（必填）</span></label>
            <input type="text" value={groupId} onChange={e => set('groupId', e.target.value)} className="w-full bg-white/60 backdrop-blur-sm border border-[#e5ddf0]/50 rounded-xl px-3 py-2.5 text-sm font-mono focus:bg-white/80 transition-all" placeholder="在 MiniMax 平台 → 账号 → 组织信息 中获取" /></div>
        <div><label className="text-[10px] font-bold text-[#b8aaa0] uppercase block mb-1">模型</label>
            <select value={model} onChange={e => set('model', e.target.value)} className="w-full bg-white/60 backdrop-blur-sm border border-[#e5ddf0]/50 rounded-xl px-3 py-2.5 text-sm focus:bg-white/80 transition-all">
                <option value="speech-2.8-hd">speech-2.8-hd (最新旗舰)</option><option value="speech-2.8-turbo">speech-2.8-turbo (最新快速)</option>
                <option value="speech-2.6-hd">speech-2.6-hd</option><option value="speech-2.6-turbo">speech-2.6-turbo</option>
                <option value="speech-02-hd">speech-02-hd</option><option value="speech-02-turbo">speech-02-turbo</option>
                <option value="speech-01-hd">speech-01-hd</option><option value="speech-01-turbo">speech-01-turbo</option>
            </select></div>
    </div>
);

export default React.memo(TtsApiSection);
