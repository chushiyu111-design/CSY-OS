/**
 * SecondaryApiSettingsModal — 副API设置面板
 * 
 * Replicates the main Settings API functionality for the divination module.
 */
import React, { useState } from 'react';
import { SecondaryAPIConfig, SecondaryApiPreset } from './zhaixinglouStore';
import { fetchSecondaryModels, testSecondaryConnection } from './zhaixinglouApi';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    config: SecondaryAPIConfig;
    presets: SecondaryApiPreset[];
    availableModels: string[];
    onUpdateConfig: (updates: Partial<SecondaryAPIConfig>) => void;
    onAddPreset: (preset: SecondaryApiPreset) => void;
    onRemovePreset: (id: string) => void;
    onSetModels: (models: string[]) => void;
}

const SecondaryApiSettingsModal: React.FC<Props> = ({
    isOpen, onClose, config, presets, availableModels,
    onUpdateConfig, onAddPreset, onRemovePreset, onSetModels,
}) => {
    const [localBaseUrl, setLocalBaseUrl] = useState(config.baseUrl);
    const [localApiKey, setLocalApiKey] = useState(config.apiKey);
    const [localModel, setLocalModel] = useState(config.model);
    const [testResult, setTestResult] = useState('');
    const [isTesting, setIsTesting] = useState(false);
    const [isFetchingModels, setIsFetchingModels] = useState(false);
    const [presetName, setPresetName] = useState('');

    // Sync local state when modal opens
    React.useEffect(() => {
        if (isOpen) {
            setLocalBaseUrl(config.baseUrl);
            setLocalApiKey(config.apiKey);
            setLocalModel(config.model);
            setTestResult('');
        }
    }, [isOpen, config]);

    if (!isOpen) return null;

    const handleSave = () => {
        onUpdateConfig({ baseUrl: localBaseUrl, apiKey: localApiKey, model: localModel });
        setTestResult('✅ 已保存');
    };

    const handleFetchModels = async () => {
        setIsFetchingModels(true);
        setTestResult('');
        try {
            const models = await fetchSecondaryModels({ baseUrl: localBaseUrl, apiKey: localApiKey, model: localModel });
            onSetModels(models);
            setTestResult(`✅ 获取到 ${models.length} 个模型`);
        } catch (err: any) {
            setTestResult(`❌ ${err.message}`);
        } finally {
            setIsFetchingModels(false);
        }
    };

    const handleTest = async () => {
        setIsTesting(true);
        setTestResult('');
        try {
            const result = await testSecondaryConnection({ baseUrl: localBaseUrl, apiKey: localApiKey, model: localModel });
            setTestResult(`✅ ${result}`);
        } catch (err: any) {
            setTestResult(`❌ ${err.message}`);
        } finally {
            setIsTesting(false);
        }
    };

    const handleSavePreset = () => {
        if (!presetName.trim()) return;
        onAddPreset({
            id: Date.now().toString(),
            name: presetName.trim(),
            config: { baseUrl: localBaseUrl, apiKey: localApiKey, model: localModel },
        });
        setPresetName('');
        setTestResult('✅ 预设已保存');
    };

    const handleLoadPreset = (preset: SecondaryApiPreset) => {
        setLocalBaseUrl(preset.config.baseUrl);
        setLocalApiKey(preset.config.apiKey);
        setLocalModel(preset.config.model);
        setTestResult(`已加载预设: ${preset.name}（点击保存以生效）`);
    };

    return (
        <div className="fixed inset-0 z-[500] flex items-end justify-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative w-full max-h-[85vh] bg-white/10 backdrop-blur-2xl rounded-t-[2rem] border-t border-white/20 overflow-hidden flex flex-col animate-slide-up shadow-[0_-10px_50px_rgba(0,0,0,0.5)]">
                {/* Handle */}
                <div className="flex justify-center pt-3 pb-1">
                    <div className="w-10 h-1 bg-white/25 rounded-full"></div>
                </div>

                {/* Header */}
                <div className="px-6 py-3 flex items-center justify-between border-b border-white/10">
                    <h2 className="text-white/90 font-bold text-base tracking-wider">副API设置</h2>
                    <button onClick={() => { handleSave(); onClose(); }} className="text-white/70 text-sm font-bold active:scale-95 transition-transform hover:text-white">完成</button>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto no-scrollbar px-6 py-4 space-y-5">
                    {/* API Base URL */}
                    <div>
                        <label className="text-[10px] text-white/40 tracking-widest uppercase block mb-1.5">API 地址 (Base URL)</label>
                        <input
                            value={localBaseUrl}
                            onChange={e => setLocalBaseUrl(e.target.value)}
                            placeholder="https://api.openai.com/v1"
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white/90 text-sm placeholder-white/20 focus:outline-none focus:border-white/30 focus:bg-white/8 transition-colors"
                        />
                    </div>

                    {/* API Key */}
                    <div>
                        <label className="text-[10px] text-white/40 tracking-widest uppercase block mb-1.5">API 密钥 (Key)</label>
                        <input
                            type="password"
                            value={localApiKey}
                            onChange={e => setLocalApiKey(e.target.value)}
                            placeholder="sk-..."
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white/90 text-sm placeholder-white/20 focus:outline-none focus:border-white/30 focus:bg-white/8 transition-colors"
                        />
                    </div>

                    {/* Model Selection */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="text-[10px] text-white/40 tracking-widest uppercase">模型 (Model)</label>
                            <button onClick={handleFetchModels} disabled={isFetchingModels} className="text-[10px] text-white/60 font-bold active:scale-95 transition-transform disabled:opacity-40 hover:text-white/80">
                                {isFetchingModels ? '获取中...' : '获取模型列表'}
                            </button>
                        </div>
                        <input
                            value={localModel}
                            onChange={e => setLocalModel(e.target.value)}
                            placeholder="手动输入模型名称..."
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white/90 text-sm placeholder-white/20 focus:outline-none focus:border-white/30 focus:bg-white/8 transition-colors"
                        />
                        {availableModels.length > 0 && (
                            <div className="mt-2 max-h-32 overflow-y-auto no-scrollbar bg-white/5 border border-white/10 rounded-xl">
                                {availableModels.map(m => (
                                    <button
                                        key={m}
                                        onClick={() => setLocalModel(m)}
                                        className={`w-full text-left px-4 py-2 text-xs transition-colors truncate ${m === localModel ? 'bg-white/15 text-white font-bold' : 'text-white/60 hover:bg-white/8 hover:text-white/80'}`}
                                    >
                                        {m}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                        <button onClick={handleSave} className="flex-1 py-3 bg-white/10 border border-white/15 rounded-xl text-white/80 text-sm font-bold active:scale-95 transition-all hover:bg-white/15">
                            保存
                        </button>
                        <button onClick={handleTest} disabled={isTesting} className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl text-white/60 text-sm font-bold active:scale-95 transition-all disabled:opacity-40 hover:bg-white/10 hover:text-white/80">
                            {isTesting ? '测试中...' : '测试连通性'}
                        </button>
                    </div>

                    {/* Test Result */}
                    {testResult && (
                        <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                            <p className="text-xs text-white/70 break-all">{testResult}</p>
                        </div>
                    )}

                    {/* Preset Save */}
                    <div className="border-t border-white/10 pt-4">
                        <label className="text-[10px] text-white/40 tracking-widest uppercase block mb-1.5">保存为预设</label>
                        <div className="flex gap-2">
                            <input
                                value={presetName}
                                onChange={e => setPresetName(e.target.value)}
                                placeholder="预设名称"
                                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white/90 text-sm placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors"
                            />
                            <button onClick={handleSavePreset} disabled={!presetName.trim()} className="px-4 py-2.5 bg-white/10 border border-white/15 rounded-xl text-white/70 text-sm font-bold active:scale-95 transition-all disabled:opacity-30 hover:bg-white/15">
                                保存
                            </button>
                        </div>
                    </div>

                    {/* Preset List */}
                    {presets.length > 0 && (
                        <div>
                            <label className="text-[10px] text-white/40 tracking-widest uppercase block mb-2">已保存的预设</label>
                            <div className="space-y-2">
                                {presets.map(p => (
                                    <div key={p.id} className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3 border border-white/8 hover:bg-white/8 transition-colors">
                                        <button onClick={() => handleLoadPreset(p)} className="flex-1 text-left">
                                            <div className="text-white/80 text-sm font-bold">{p.name}</div>
                                            <div className="text-white/30 text-[10px] truncate">{p.config.model} · {p.config.baseUrl}</div>
                                        </button>
                                        <button onClick={() => onRemovePreset(p.id)} className="text-white/20 hover:text-red-400/80 text-sm px-2 shrink-0 transition-colors">×</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SecondaryApiSettingsModal;
