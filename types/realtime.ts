
import { XhsMcpConfig } from './xhs';

// 实时上下文配置 - 让AI角色感知真实世界
export interface RealtimeConfig {
    // 天气配置
    weatherEnabled: boolean;
    weatherApiKey: string;  // OpenWeatherMap API Key
    weatherCity: string;    // 城市名

    // 新闻配置
    newsEnabled: boolean;
    newsApiKey?: string;

    // Notion 配置
    notionEnabled: boolean;
    notionApiKey: string;   // Notion Integration Token
    notionDatabaseId: string; // 日记数据库ID
    notionNotesDatabaseId?: string; // 用户笔记数据库ID（可选，让角色读取用户的日常笔记）

    // 飞书配置 (中国区 Notion 替代)
    feishuEnabled: boolean;
    feishuAppId: string;      // 飞书应用 App ID
    feishuAppSecret: string;  // 飞书应用 App Secret
    feishuBaseId: string;     // 多维表格 App Token
    feishuTableId: string;    // 数据表 Table ID

    // 小红书配置 (MCP 浏览器自动化)
    xhsEnabled: boolean;
    xhsMcpConfig?: XhsMcpConfig;

    // 缓存配置
    cacheMinutes: number;
}
