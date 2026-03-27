
import React, { useState } from 'react';
import { useOS } from '../../../context/OSContext';
import Modal from '../../../components/os/Modal';
import { WeatherSection, NewsSection, NotionSection, FeishuSection, XhsMcpSection } from './sections';

const RealtimeSettings: React.FC = () => {
    const { realtimeConfig, updateRealtimeConfig, addToast } = useOS();

    const [rt, setRt] = useState(() => ({
        weatherEnabled: realtimeConfig.weatherEnabled,
        weatherApiKey: realtimeConfig.weatherApiKey,
        weatherCity: realtimeConfig.weatherCity,
        newsEnabled: realtimeConfig.newsEnabled,
        newsApiKey: realtimeConfig.newsApiKey || '',
        notionEnabled: realtimeConfig.notionEnabled,
        notionApiKey: realtimeConfig.notionApiKey,
        notionDbId: realtimeConfig.notionDatabaseId,
        notionNotesDbId: realtimeConfig.notionNotesDatabaseId || '',
        feishuEnabled: realtimeConfig.feishuEnabled,
        feishuAppId: realtimeConfig.feishuAppId,
        feishuAppSecret: realtimeConfig.feishuAppSecret,
        feishuBaseId: realtimeConfig.feishuBaseId,
        feishuTableId: realtimeConfig.feishuTableId,
        xhsEnabled: realtimeConfig.xhsEnabled,
        xhsMcpEnabled: realtimeConfig.xhsMcpConfig?.enabled ?? false,
        xhsMcpUrl: realtimeConfig.xhsMcpConfig?.serverUrl || '',
        xhsNickname: realtimeConfig.xhsMcpConfig?.loggedInNickname || '',
        xhsUserId: realtimeConfig.xhsMcpConfig?.loggedInUserId || '',
    }));

    const [testStatus, setTestStatus] = useState('');
    const [showModal, setShowModal] = useState(false);

    const set = (field: string, value: any) => setRt(prev => ({ ...prev, [field]: value }));

    const handleSave = () => {
        updateRealtimeConfig({
            weatherEnabled: rt.weatherEnabled, weatherApiKey: rt.weatherApiKey, weatherCity: rt.weatherCity,
            newsEnabled: rt.newsEnabled, newsApiKey: rt.newsApiKey,
            notionEnabled: rt.notionEnabled, notionApiKey: rt.notionApiKey, notionDatabaseId: rt.notionDbId,
            notionNotesDatabaseId: rt.notionNotesDbId || undefined,
            feishuEnabled: rt.feishuEnabled, feishuAppId: rt.feishuAppId, feishuAppSecret: rt.feishuAppSecret,
            feishuBaseId: rt.feishuBaseId, feishuTableId: rt.feishuTableId,
            xhsEnabled: rt.xhsEnabled,
            xhsMcpConfig: { enabled: rt.xhsMcpEnabled, serverUrl: rt.xhsMcpUrl, loggedInNickname: rt.xhsNickname || undefined, loggedInUserId: rt.xhsUserId || undefined },
        });
        addToast('实时感知配置已保存', 'success');
        setShowModal(false);
    };

    return (
        <>
            {/* 概览卡片 */}
            <section className="bg-white/60 backdrop-blur-sm rounded-3xl p-5 shadow-sm border border-white/50">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-violet-100/50 rounded-xl text-violet-600">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" /></svg>
                        </div>
                        <h2 className="text-sm font-semibold text-slate-600 tracking-wider">实时感知</h2>
                    </div>
                    <button onClick={() => setShowModal(true)} className="text-[10px] bg-violet-100 text-violet-600 px-3 py-1.5 rounded-full font-bold shadow-sm active:scale-95 transition-transform">配置</button>
                </div>

                <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                    让AI角色感知真实世界：天气、新闻热点、当前时间。角色可以根据天气关心你、聊聊最近的热点话题。
                </p>

                <div className="grid grid-cols-5 gap-2 text-center">
                    <div className={`py-3 rounded-xl text-xs font-bold ${rt.weatherEnabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
                        <div className="text-lg mb-1">{rt.weatherEnabled ? '☀️' : '🌫️'}</div>天气</div>
                    <div className={`py-3 rounded-xl text-xs font-bold ${rt.newsEnabled ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-400'}`}>
                        <div className="text-lg mb-1">{rt.newsEnabled ? '📰' : '📄'}</div>新闻</div>
                    <div className={`py-3 rounded-xl text-xs font-bold ${rt.notionEnabled ? 'bg-orange-50 text-orange-600' : 'bg-slate-50 text-slate-400'}`}>
                        <div className="text-lg mb-1">{rt.notionEnabled ? '📝' : '📋'}</div>Notion</div>
                    <div className={`py-3 rounded-xl text-xs font-bold ${rt.feishuEnabled ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-400'}`}>
                        <div className="text-lg mb-1">{rt.feishuEnabled ? '📒' : '📋'}</div>飞书</div>
                    <div className={`py-3 rounded-xl text-xs font-bold ${rt.xhsEnabled ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-400'}`}>
                        <div className="text-lg mb-1">{rt.xhsEnabled ? '📕' : '📋'}</div>小红书</div>
                </div>
            </section>

            {/* 配置 Modal */}
            <Modal isOpen={showModal} title="实时感知配置" onClose={() => setShowModal(false)}
                footer={<button onClick={handleSave} className="w-full py-3 bg-violet-500 text-white font-bold rounded-2xl shadow-lg">保存配置</button>}>
                <div className="space-y-5 max-h-[60vh] overflow-y-auto no-scrollbar">
                    <WeatherSection enabled={rt.weatherEnabled} apiKey={rt.weatherApiKey} city={rt.weatherCity} set={set} onTestStatus={setTestStatus} />
                    <NewsSection enabled={rt.newsEnabled} apiKey={rt.newsApiKey} set={set} />
                    <NotionSection enabled={rt.notionEnabled} apiKey={rt.notionApiKey} dbId={rt.notionDbId} notesDbId={rt.notionNotesDbId} set={set} onTestStatus={setTestStatus} />
                    <FeishuSection enabled={rt.feishuEnabled} appId={rt.feishuAppId} appSecret={rt.feishuAppSecret} baseId={rt.feishuBaseId} tableId={rt.feishuTableId} set={set} onTestStatus={setTestStatus} />
                    <XhsMcpSection enabled={rt.xhsMcpEnabled} mcpUrl={rt.xhsMcpUrl} nickname={rt.xhsNickname} userId={rt.xhsUserId} set={set} onTestStatus={setTestStatus}
                        onUpdateConfig={(cfg) => updateRealtimeConfig({ xhsMcpConfig: cfg })} />
                    {testStatus && (
                        <div className={`p-3 rounded-xl text-xs font-medium text-center ${testStatus.includes('成功') ? 'bg-emerald-100 text-emerald-700' : testStatus.includes('失败') || testStatus.includes('错误') ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
                            {testStatus}
                        </div>
                    )}
                </div>
            </Modal>
        </>
    );
};

export default RealtimeSettings;
