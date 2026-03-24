
import React, { useState } from 'react';
import { getAgentConfig, saveAgentConfig, type AgentConfig } from '../../utils/autonomousAgent';
import { haptic } from '../../utils/haptics';

/**
 * AgentSettings — 自律代理频率 / 推送通知设置面板
 * 用户可调节自律代理的主动消息频率、冷却策略等参数
 */
const AgentSettings: React.FC = () => {
    const [config, setConfig] = useState<AgentConfig>(getAgentConfig);
    const [saved, setSaved] = useState(false);

    const update = (patch: Partial<AgentConfig>) => {
        const next = { ...config, ...patch };
        setConfig(next);
        saveAgentConfig(next);
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
        window.dispatchEvent(new Event('agent-config-changed'));
    };

    return (
        <div className="space-y-5">

            {/* 概览卡片 */}
            <section className="relative overflow-hidden bg-[#fef5e7]/70 backdrop-blur-sm rounded-3xl p-6 shadow-sm border border-[#f0e4d7]/60">
                <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-gradient-to-br from-[#f5d5c8]/30 to-[#fce4b0]/30 blur-2xl pointer-events-none" />
                <div className="absolute -bottom-6 -left-6 w-20 h-20 rounded-full bg-gradient-to-tr from-[#f5e6c8]/25 to-[#f5d5c8]/25 blur-xl pointer-events-none" />

                <div className="relative flex items-center gap-3 mb-4">
                    <div className="p-2.5 bg-gradient-to-br from-[#f5d5c8]/60 to-[#fce4b0]/60 backdrop-blur-sm rounded-2xl text-[#c49a6c]">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" /></svg>
                    </div>
                    <h2 className="text-sm font-semibold text-[#8b7e74] tracking-wider">自律代理</h2>
                </div>

                <p className="relative text-xs text-[#a89b91] leading-relaxed">
                    调节角色主动找你的频率和行为策略。参数越激进，角色越活跃、越像真人主动发消息。
                </p>

                {saved && (
                    <div className="absolute top-4 right-4 text-[10px] font-bold text-[#7faa95] bg-[#e6f5ee]/80 backdrop-blur-sm px-3 py-1 rounded-full animate-fade-in">
                        ✓ 已保存
                    </div>
                )}
            </section>

            {/* 检查间隔 */}
            <section className="bg-[#fef5e7]/50 backdrop-blur-sm p-5 rounded-3xl space-y-4 border border-[#f0e4d7]/40">
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-bold text-[#c49a6c]">⏱ 检查频率</span>
                </div>

                <SliderRow
                    label="最短检查间隔"
                    desc="角色多久至少检查一次是否该找你。越短越积极"
                    value={config.minIntervalMin}
                    min={3} max={60} step={1} unit="分钟"
                    onChange={v => {
                        haptic.light();
                        update({ minIntervalMin: v, maxIntervalMin: Math.max(v + 5, config.maxIntervalMin) });
                    }}
                />

                <SliderRow
                    label="最长检查间隔"
                    desc="检查间隔的随机上限。越大间隔越随机、越像真人"
                    value={config.maxIntervalMin}
                    min={config.minIntervalMin + 5} max={120} step={1} unit="分钟"
                    onChange={v => { haptic.light(); update({ maxIntervalMin: v }); }}
                />
            </section>

            {/* 冷却策略 */}
            <section className="bg-[#fce4ec]/40 backdrop-blur-sm p-5 rounded-3xl space-y-4 border border-[#f5d5da]/40">
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-bold text-[#c4929f]">🧊 冷却策略</span>
                </div>

                <SliderRow
                    label="冷却时间"
                    desc="角色发一条消息后，至少等多久才能再发下一条。防止刷屏"
                    value={config.cooldownHours}
                    min={0.5} max={8} step={0.5} unit="小时"
                    onChange={v => { haptic.light(); update({ cooldownHours: v }); }}
                />

                <NumberRow
                    label="每日上限"
                    desc="角色每天最多主动找你几次"
                    value={config.maxDailyActions}
                    min={1} max={20}
                    onChange={v => { haptic.light(); update({ maxDailyActions: v }); }}
                />

                <NumberRow
                    label="连续未回复容忍"
                    desc="你没回复几条后角色会暂时停止打扰，给你空间"
                    value={config.maxConsecutiveIgnored}
                    min={1} max={10}
                    onChange={v => { haptic.light(); update({ maxConsecutiveIgnored: v }); }}
                />
            </section>

            {/* 触发概率 */}
            <section className="bg-[#f3eef8]/60 backdrop-blur-sm p-5 rounded-3xl space-y-4 border border-[#e5ddf0]/40">
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-bold text-[#9b7e8f]">🎲 触发概率</span>
                </div>

                <SliderRow
                    label="基础概率"
                    desc="每次检查时发消息的基础概率。越高角色越话多。实际概率会根据你的沉默时长、角色情绪等动态调整"
                    value={Math.round(config.baseProb * 100)}
                    min={5} max={80} step={5} unit="%"
                    onChange={v => { haptic.light(); update({ baseProb: v / 100 }); }}
                />
                <div className="bg-white/40 backdrop-blur-sm rounded-2xl p-3 border border-white/30">
                    <p className="text-[10px] text-[#a89b91] leading-relaxed">
                        💡 <strong>实际触发概率</strong>会根据以下因素动态调整：
                    </p>
                    <ul className="text-[10px] text-[#a89b91] mt-1.5 space-y-0.5 pl-4">
                        <li>• 你沉默越久 → 概率越高（想你了）</li>
                        <li>• 上条是角色发的你没回 → 概率大幅降低（不想打扰）</li>
                        <li>• 刚聊完 30 分钟内 → 几乎不会触发</li>
                        <li>• 深夜 1:00-7:00 → 角色也在休息</li>
                        <li>• 角色情绪激动 → 更想找你</li>
                    </ul>
                </div>
            </section>

            {/* 系统通知 */}
            <section className="bg-[#e6f5ee]/50 backdrop-blur-sm p-5 rounded-3xl border border-[#d0e8da]/40">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-bold text-[#7faa95]">🔔 系统通知</span>
                        </div>
                        <p className="text-[10px] text-[#a89b91] leading-relaxed max-w-[240px]">
                            角色主动发消息时弹出手机原生通知。需要 Android APK 打包后才能使用
                        </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input
                            type="checkbox"
                            checked={config.notificationsEnabled}
                            onChange={e => { haptic.medium(); update({ notificationsEnabled: e.target.checked }); }}
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#7faa95]"></div>
                    </label>
                </div>
            </section>

            {/* 调试模式 */}
            <section className="bg-white/40 backdrop-blur-sm p-5 rounded-3xl border border-white/30">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-bold text-[#b8aaa0]">🐛 调试模式</span>
                        </div>
                        <p className="text-[10px] text-[#b8aaa0] leading-relaxed max-w-[240px]">
                            开启后检查间隔缩短到 30 秒，方便测试。控制台会输出详细日志
                        </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input
                            type="checkbox"
                            checked={localStorage.getItem('autonomous_debug') === 'true'}
                            onChange={e => {
                                haptic.medium();
                                localStorage.setItem('autonomous_debug', String(e.target.checked));
                                setConfig({ ...config }); // force re-render
                                window.dispatchEvent(new Event('agent-config-changed'));
                            }}
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#b8aaa0]"></div>
                    </label>
                </div>
            </section>
        </div>
    );
};

/* ──── 内部子组件 ──── */

interface SliderRowProps {
    label: string;
    desc: string;
    value: number;
    min: number;
    max: number;
    step: number;
    unit: string;
    onChange: (v: number) => void;
}

const SliderRow: React.FC<SliderRowProps> = ({ label, desc, value, min, max, step, unit, onChange }) => (
    <div>
        <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] font-bold text-[#8b7e74]">{label}</label>
            <span className="text-[11px] font-mono font-bold text-[#c49a6c] bg-white/50 px-2 py-0.5 rounded-lg">
                {Number.isInteger(value) ? value : value.toFixed(1)} {unit}
            </span>
        </div>
        <input
            type="range"
            min={min} max={max} step={step}
            value={value}
            onChange={e => onChange(Number(e.target.value))}
            className="w-full h-1.5 bg-[#f0e4d7]/80 rounded-full appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-gradient-to-br
                [&::-webkit-slider-thumb]:from-[#f5d5c8] [&::-webkit-slider-thumb]:to-[#c49a6c]
                [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white/60
                [&::-webkit-slider-thumb]:active:scale-110 [&::-webkit-slider-thumb]:transition-transform"
        />
        <p className="text-[10px] text-[#b8aaa0] mt-1 leading-relaxed">{desc}</p>
    </div>
);

interface NumberRowProps {
    label: string;
    desc: string;
    value: number;
    min: number;
    max: number;
    onChange: (v: number) => void;
}

const NumberRow: React.FC<NumberRowProps> = ({ label, desc, value, min, max, onChange }) => (
    <div>
        <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] font-bold text-[#8b7e74]">{label}</label>
            <div className="flex items-center gap-1.5">
                <button
                    onClick={() => onChange(Math.max(min, value - 1))}
                    className="w-7 h-7 rounded-lg bg-white/60 border border-[#f5d5da]/50 text-[#c4929f] font-bold text-sm active:scale-90 transition-transform"
                >−</button>
                <span className="text-[11px] font-mono font-bold text-[#c4929f] bg-white/50 px-2 py-0.5 rounded-lg min-w-[28px] text-center">
                    {value}
                </span>
                <button
                    onClick={() => onChange(Math.min(max, value + 1))}
                    className="w-7 h-7 rounded-lg bg-white/60 border border-[#f5d5da]/50 text-[#c4929f] font-bold text-sm active:scale-90 transition-transform"
                >+</button>
            </div>
        </div>
        <p className="text-[10px] text-[#b8aaa0] mt-1 leading-relaxed">{desc}</p>
    </div>
);

export default AgentSettings;
