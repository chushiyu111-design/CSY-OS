/**
 * Status Card Types — 创意状态栏类型定义
 *
 * 三种模式：
 *   1. classic  — 经典心声（明信片卡片）
 *   2. creative — AI 创意卡片（基于对话语境选骨架 + 生成样式）
 *   3. custom   — 用户自定义模板
 */

/** AI 输出的统一卡片数据结构 */
export interface StatusCardData {
    cardType: string;               // 骨架名: 'postcard' | 'phone_screen' | 'sticky_note' | ...
    title?: string;                 // 标题文字
    body: string;                   // 主体内容文字
    footer?: string;                // 底部文字（日期、签名等）
    icon?: string;                  // emoji 图标
    meta?: Record<string, any>;     // 骨架特有数据 (天气的 temp、音乐的 artist 等)
    style: StatusCardStyle;
}

/** 卡片样式参数（由 AI 生成，骨架组件消费） */
export interface StatusCardStyle {
    bgGradient?: [string, string];  // 背景渐变 [起始色, 结束色]
    textColor?: string;             // 主文字颜色
    accent?: string;                // 强调色（边框、装饰等）
    fontStyle?: 'serif' | 'sans' | 'handwrite' | 'mono';
    mood?: string;                  // 情绪词（供装饰逻辑参考）
    decoration?: string;            // 装饰元素名
}

/** 用户自定义模板 */
export interface CustomStatusTemplate {
    id: string;
    name: string;                   // 模板名称（如 "赛博日记"）
    systemPrompt: string;           // 用户自定义的 system prompt（告诉副模型输出什么格式）
    extractRegex: string;           // 用户自定义的提取正则（从 AI 输出中提取渲染内容）
    htmlTemplate?: string;          // 用户自定义的 HTML 模板（支持 $1, $2 等正则捕获组替换）
    renderMode: 'html' | 'text';    // 渲染方式：html=iframe沙箱，text=纯文本卡片
}

/** 状态栏模式类型 */
export type StatusBarMode = 'off' | 'classic' | 'creative' | 'custom' | 'freeform';

/** 可用的骨架类型 ID 列表 */
export const SKELETON_TYPES = [
    'postcard',
    'phone_screen',
    'sticky_note',
    'receipt',
    'diary',
    'music_player',
    'polaroid',
    'social_post',
] as const;

export type SkeletonType = typeof SKELETON_TYPES[number];

/** 骨架注册表条目 */
export interface SkeletonRegistryEntry {
    id: SkeletonType;
    name: string;           // 中文显示名
    description: string;    // 简短描述
    keywords: string[];     // 触发关键词（供 AI 参考）
}

/** 骨架元数据注册表 */
export const SKELETON_REGISTRY: SkeletonRegistryEntry[] = [
    { id: 'postcard',      name: '明信片',     description: '复古纸质明信片',       keywords: ['心情', '思念', '旅行', '散步', '风景'] },
    { id: 'phone_screen',  name: '手机截图',   description: '模拟App界面截图',       keywords: ['天气', '外卖', '通知', '消息', '提醒'] },
    { id: 'sticky_note',   name: '便签',       description: '彩色便利贴',           keywords: ['备忘', '待办', '灵感', '随手记'] },
    { id: 'receipt',       name: '小票',       description: '热敏纸收据',           keywords: ['购物', '吃饭', '花钱', '消费', '买'] },
    { id: 'diary',         name: '日记页',     description: '手写日记本页',         keywords: ['日记', '记录', '回忆', '今天', '日常'] },
    { id: 'music_player',  name: '音乐播放器', description: '深色音乐播放界面',     keywords: ['音乐', '听歌', '歌', '旋律', '哼'] },
    { id: 'polaroid',      name: '拍立得',     description: '宝丽来即时照片',       keywords: ['照片', '拍照', '看到', '好看', '风景'] },
    { id: 'social_post',   name: '社交动态',   description: '朋友圈/微博风格卡片',  keywords: ['朋友圈', '分享', '发布', '吐槽', '评论'] },
];
