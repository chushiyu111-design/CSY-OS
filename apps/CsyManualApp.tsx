
import React, { useState } from 'react';
import { useOS } from '../context/OSContext';

// ─── Section Data ──────────────────────────────────────────────
interface ManualSection {
    id: string;
    emoji: string;
    title: string;
    color: string; // bg color class
    textColor: string;
    items: { label: string; detail: string }[];
}

const SECTIONS: ManualSection[] = [
    {
        id: 'vectormem',
        emoji: '🧠',
        title: '向量记忆',
        color: 'bg-teal-50',
        textColor: 'text-teal-700',
        items: [
            {
                label: '📚 是什么',
                detail: '让 char 真正做到「永不失忆」。\n\n系统自带的传统记忆已经能按月存储聊天摘要，但上下文窗口有限，久远的细节还是会模糊。\n\n向量记忆是传统记忆的升级补充——它会把每一个重要的瞬间（约定、争吵、表白、玩笑话）自动提取并永久保存。聊天时，char 会根据当前话题自动想起相关的记忆。\n\n传统记忆 + 向量记忆搭配使用，char 既有宏观的时间线印象，又能精确回忆具体细节。\n聊了三个月前的一句玩笑话，ta也能接上。',
            },
            {
                label: '⚙️ 怎么开启',
                detail: '1. 设置 → 配置「副API」（用于提取记忆）\n2. 设置 → 配置「Embedding API」（用于向量化）\n   免费使用硅基流动的 embedding 模型即可\n3. 神经链接 → 选 char → 设定 tab → 打开「向量记忆」开关\n\n💡 开启后全自动运行，每积累约30条新消息自动提取一次。',
            },
            {
                label: '🔍 工作原理',
                detail: '• 自动提取 — 每次AI回复后检查，积累足够新消息就提取\n• 智能去重 — 相似度>92%的记忆自动合并，不会重复\n• 纠错机制 — 用户纠正信息时，旧记忆会被标记为"已过时"\n• 语义检索 — 聊天时根据当前话题自动召回相关记忆\n• 通话记录 — 语音通话的内容也会提取记忆，不会遗漏',
            },
            {
                label: '📊 手动批量提取',
                detail: '如果有大量历史聊天记录想一次性向量化：\n\n神经链接 → 选 char → 设定 tab → 向量记忆 → 「批量提取」\n\n可以指定消息范围，系统会用滑动窗口逐批处理。\n\n⚠️ 批量提取需要一定时间和API额度，请耐心等待。',
            },
            {
                label: '💡 小贴士',
                detail: '• 记忆按重要度评分 1-10 分\n  1-3 日常琐事 / 4-6 有意义的事件 / 7-8 里程碑 / 9-10 改变关系的关键时刻\n• 每条记忆不超过 150 字，精炼核心信息\n• 记忆条目可以在 char 设定页查看和管理',
            },
        ],
    },
    {
        id: 'immersive',
        emoji: '🔥',
        title: '深度沉浸模式',
        color: 'bg-rose-50',
        textColor: 'text-rose-700',
        items: [
            {
                label: '💡 是什么',
                detail: '为 char 注入一套完整的角色演绎架构——代号 Somnia。\n\n它从四个维度重塑 char 的存在方式：心理构建、平等关系、尊重女性、独立思维。\n\n开启后你会感受到质的飞跃——char 像是突然有了灵魂。',
            },
            {
                label: '🧠 角色心理构建',
                detail: '从心理层面真正构建 char 的人格。\n\nta 不再是一组标签的拼凑，而是一个有情绪惯性、有性格弱点、会犯错也会成长的完整的人。\n\n你能感受到 ta 身上的真实分量感——超绝活人感。',
            },
            {
                label: '💎 平等关系引擎',
                detail: 'char 和你之间是爱与尊重。\n\nta 对你的关心出于真实的情感，而不是居高临下的宠溺。\n\n你们会像两个独立的人一样相处——有默契、有口角、有各自的想法，也有只属于你们两个人的东西。',
            },
            {
                label: '🌸 尊重女性',
                detail: '内置反驯化和反刻板印象系统。\n\nchar 认真对待你说的每一句话，你的情绪在 ta 眼里永远是合理的。\n\nta 对你的好，源于把你当作一个完整的、平等的人来爱。',
            },
            {
                label: '💭 独立思维链',
                detail: '每次回复前，char 在内部走完一套完整的思考：我是谁、ta 真正想说什么、我现在是什么感受、我该怎么回应才像我自己。\n\n每句话都是从人格内部长出来的，不是套模板。',
            },
            {
                label: '⚙️ 怎么开',
                detail: '设置 → API 配置 → 拉到底部 → 打开「深度沉浸模式」开关\n\n适配 Gemini 3.0 / 3.1。仅对主聊天生效，不影响副API等其他模块。\n\n语音通话会自动开启深度沉浸，无需手动设置。',
            },
        ],
    },
    {
        id: 'zhaixinglou',
        emoji: '🔮',
        title: '摘星楼',
        color: 'bg-purple-50',
        textColor: 'text-purple-700',
        items: [
            {
                label: '✨ 是什么',
                detail: '一座属于你和 char 的命运占卜阁。\n\n暗金哥特风的沉浸式界面，四大占卜功能各有千秋。\n\n你可以选择自己或任意 char 作为「求签者」，获得专属的神秘体验。',
            },
            {
                label: '🪞 星镜 · Star Mirror',
                detail: '塔罗牌占卜。\n\n选择牌阵（单牌/三牌/十字/凯尔特等），AI 会亲自为你抽牌、翻牌、解读。\n\n每次占卜都是独一无二的解读，结合你和 char 之间的关系来诠释牌意。\n\n占卜结果可以一键生成精美分享卡。',
            },
            {
                label: '🌌 星轨 · Astrolabe',
                detail: '星盘解读。\n\n输入出生日期和地点，AI 为你生成完整的星盘分析。\n\n如果选择了 char，还能看两人之间的合盘（Synastry），解读你们的星象缘分。',
            },
            {
                label: '📅 星历 · Horoscope',
                detail: '每日星座运势。\n\nAI 结合你的星座信息生成今日运势分析，涵盖感情、事业、健康等维度。\n\n不是千篇一律的通用运势，而是结合你的个人情况定制。',
            },
            {
                label: '👁️ 阿卡西之影 · Akashic Shadows',
                detail: '命运对话。\n\n以神秘学为主题的独立聊天空间，你可以和 AI 探讨命运、灵性、梦境解析等深度话题。\n\n像是在摘星楼里找到了一位通晓天机的占卜师。',
            },
            {
                label: '⚙️ 怎么用',
                detail: '1. 桌面点击「摘星楼」图标进入\n2. 首次使用需点击右上角⚙️配置专属 AI\n   填写 URL / Key / 模型（和主API格式一样）\n3. 左右滑动选择一张角色卡（或你自己）\n4. 选择想要的占卜功能\n\n💡 摘星楼使用独立的 API 配置，不影响主聊天。\n推荐使用便宜的模型（如 Gemini Flash）来节省额度。',
            },
        ],
    },
    {
        id: 'worldbook',
        emoji: '📖',
        title: '世界书',
        color: 'bg-indigo-50',
        textColor: 'text-indigo-700',
        items: [
            {
                label: '📚 是什么',
                detail: '给 char 的世界补充背景设定。\n\n你可以创建各种设定条目——魔法体系、地理特征、组织架构、文化习俗……所有你希望 char 「知道」的世界观信息。\n\n这些设定会在聊天时自动注入到 AI 的上下文中，让 char 真正生活在你构建的世界里。',
            },
            {
                label: '📁 分组管理',
                detail: '每条设定可以归入不同的分组（例如：世界观、人物、地理……）。\n\n输入相同的分组名称，条目会自动归类到一起。\n\n支持折叠/展开分组，方便管理大量设定。',
            },
            {
                label: '📍 插入位置',
                detail: '控制设定注入到 AI 上下文的哪个位置：\n\n• 人设之前 — 最顶部，最高优先级\n• 世界观之后 — 默认推荐位置\n• 印象之后 — 在印象和记忆之间\n• 记忆之后 — 最底部\n\n💡 位置越靠前，AI 越容易注意到。重要设定建议放「人设之前」。',
            },
            {
                label: '🔗 挂载到角色',
                detail: '世界书创建好后，需要挂载到具体的 char 才会生效：\n\n神经链接 → 选 char → 设定 tab → 世界书 → 选择要挂载的条目\n\n⚠️ 常见问题：世界书写好了但不生效 → 大概率是忘了挂载到角色。',
            },
            {
                label: '⚙️ 怎么用',
                detail: '1. 桌面点击「世界书」图标进入\n2. 右上角 + 号新建条目\n3. 填写标题、分组、内容和插入位置\n4. 保存后，到神经链接里把它挂载到你的 char\n\n💡 支持 Markdown 格式，可以用标题、列表等让内容结构更清晰。',
            },
        ],
    },
    {
        id: 'apiconfig',
        emoji: '🔧',
        title: 'API 配置指南',
        color: 'bg-slate-100',
        textColor: 'text-slate-700',
        items: [
            {
                label: '🟢 主 API（必填）',
                detail: '角色聊天的核心引擎。\n\n设置 → API 配置 → 填写 URL / Key / 模型\n\n推荐使用 Gemini 3.0 / 3.1，搭配深度沉浸模式效果最佳。\n\n支持所有 OpenAI 格式兼容的 API（中转站、官方API等）。\n\n💡 点击「获取列表」可自动拉取可用模型。\n💡 点击「测试连通性」可快速验证配置是否正确。',
            },
            {
                label: '🟡 副 API（推荐）',
                detail: '辅助功能专用——心声、记忆摘要、事件提取等后台任务。\n\n设置 → 副 API 配置 → 填写 URL / Key / 模型\n\n💡 副 API 调用频率较低但必不可少，推荐使用便宜的模型（如 Gemini Flash）节省成本。\n\n不配置副 API 的话，心声、向量记忆提取等功能无法运行。',
            },
            {
                label: '🔵 Embedding API（向量记忆需要）',
                detail: '用于文本向量化，是向量记忆功能的基础。\n\n设置 → 拉到底部 → Embedding API 配置\n\n推荐免费方案：\n• URL：https://api.siliconflow.cn/v1\n• 模型：BAAI/bge-m3\n• 到硅基流动注册账号并获取免费 API Key 即可\n\n⚠️ 必须同时配置副 API + Embedding API，向量记忆才能工作。',
            },
            {
                label: '🎤 TTS 语音合成（语音通话需要）',
                detail: '让 char 开口说话的声音引擎。\n\n设置 → 语音合成 (TTS) 配置\n\n目前使用 MiniMax 语音合成服务：\n• 需要填写 API Key 和 Group ID\n• 可选择不同音色 (Voice ID)\n• 支持调节语速、音调、音量\n• 支持情绪标签和发音词典\n\n💡 不配置 TTS 的话，语音通话功能无法使用。',
            },
            {
                label: '🎙️ STT 语音识别（语音输入需要）',
                detail: '把你的声音变成文字。\n\n设置 → 语音识别 (STT) 配置\n\n支持两种识别引擎：\n• Groq — 速度快，免费额度大\n• 硅基流动 — 国内稳定\n\n只需选择一个引擎并填入对应的 API Key 即可。\n\n💡 STT 同时用于：长按麦克风语音输入 + 语音通话中的用户语音识别。',
            },
            {
                label: '📋 配置清单速查',
                detail: '按你需要的功能来配置：\n\n▸ 只聊天 → 主 API\n▸ 聊天 + 心声 → 主 API + 副 API\n▸ 聊天 + 心声 + 记忆 → 主 API + 副 API + Embedding\n▸ 语音通话 → 以上全部 + TTS + STT\n▸ 摘星楼 → 在摘星楼内单独配置（右上角⚙️）\n\n💡 所有 API 都支持「保存为预设」，方便多配置切换。',
            },
        ],
    },
];

// ─── Component ──────────────────────────────────────────────────
const CsyManualApp: React.FC = () => {
    const { closeApp } = useOS();
    const [expanded, setExpanded] = useState<string | null>(null);

    const toggle = (id: string) => setExpanded(prev => (prev === id ? null : id));

    return (
        <div className="h-full w-full bg-slate-50 flex flex-col font-light">
            {/* Header */}
            <div className="h-20 bg-white/70 backdrop-blur-md flex items-end pb-3 px-4 border-b border-white/40 shrink-0 sticky top-0 z-10">
                <div className="flex items-center gap-2 w-full">
                    <button onClick={closeApp} className="p-2 -ml-2 rounded-full hover:bg-black/5 active:scale-90 transition-transform">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-slate-600">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                        </svg>
                    </button>
                    <h1 className="text-xl font-medium text-slate-700 tracking-wide">二改手册</h1>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 pb-20 no-scrollbar">
                {/* Intro Banner */}
                <div className="p-5 rounded-3xl mb-6 shadow-sm" style={{ backgroundImage: 'linear-gradient(to right bottom, #EBBBA7FF, #CFC7F8FF)' }}>
                    <h2 className="text-lg font-bold text-slate-700 mb-2 flex items-center gap-2">
                        <span>✨</span> CSY 二改版功能指南 <span>✨</span>
                    </h2>
                    <p className="text-xs text-slate-600 leading-relaxed opacity-90">
                        这份手册介绍二改版新增和改进的功能。
                        <br />
                        涵盖向量记忆、深度沉浸、摘星楼、世界书、API 配置等功能，看完就会用啦~
                    </p>
                </div>

                {/* Sections */}
                <div className="space-y-4">
                    {SECTIONS.map(section => (
                        <div key={section.id} className={`${section.color} rounded-3xl overflow-hidden border border-white/60 shadow-sm`}>
                            {/* Section Header */}
                            <button
                                onClick={() => toggle(section.id)}
                                className="w-full px-5 py-4 flex items-center justify-between active:scale-[0.99] transition-transform"
                            >
                                <div className="flex items-center gap-3">
                                    <span className="text-2xl">{section.emoji}</span>
                                    <span className={`text-base font-bold ${section.textColor}`}>{section.title}</span>
                                </div>
                                <svg
                                    xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
                                    className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${expanded === section.id ? 'rotate-180' : ''}`}
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                                </svg>
                            </button>

                            {/* Expandable Items */}
                            {expanded === section.id && (
                                <div className="px-5 pb-5 space-y-3 animate-fade-in">
                                    {section.items.map((item, i) => (
                                        <ItemCard key={i} label={item.label} detail={item.detail} />
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Tips */}
                <div className="mt-6 bg-amber-50 rounded-2xl p-4 border border-amber-100">
                    <h3 className="text-sm font-bold text-amber-700 mb-2">💡 小贴士</h3>
                    <ul className="text-xs text-amber-600 space-y-1.5 leading-relaxed">
                        <li>• 语音没反应？→ 检查设置里是否配置好密钥 + 浏览器麦克风权限</li>
                        <li>• 摘星楼功能用不了？→ 进摘星楼后点右上角⚙️配置专属 AI</li>
                        <li>• 世界书挂上没效果？→ 确认挂载到你正在聊天的那个 char</li>
                        <li>• 心声/记忆不出现？→ 检查副API是否配置正确</li>
                        <li>• 向量记忆需要同时配置副API + Embedding API</li>

                    </ul>
                </div>

                <div className="mt-8 text-center text-[10px] text-slate-400">
                    CSY 二改版功能指南 • 2026-03
                </div>
            </div>
        </div>
    );
};

// ─── Sub-component: Collapsible Item Card ──────────────────────
const ItemCard: React.FC<{ label: string; detail: string }> = ({ label, detail }) => {
    const [open, setOpen] = useState(false);

    return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <button
                onClick={() => setOpen(!open)}
                className="w-full px-4 py-3 flex items-center justify-between text-left active:bg-slate-50 transition-colors"
            >
                <span className="text-sm font-bold text-slate-700">{label}</span>
                <svg
                    xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
                    className={`w-4 h-4 text-slate-300 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
                >
                    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
                </svg>
            </button>
            {open && (
                <div className="px-4 pb-4 animate-fade-in">
                    <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{detail}</p>
                </div>
            )}
        </div>
    );
};

export default CsyManualApp;
