
import React, { useState } from 'react';

export const BackendPassCard: React.FC = () => {
    const [backendUrl, setBackendUrlInput] = useState(() => localStorage.getItem('csyos_backend_url') || 'http://43.134.141.80:6677');
    const [token, setToken] = useState(() => localStorage.getItem('csyos_backend_token') || '');
    const [status, setStatus] = useState('');

    const handleSave = () => {
        const trimmed = token.trim();
        const trimmedUrl = backendUrl.replace(/\/+$/, '').trim();
        if (trimmedUrl) {
            localStorage.setItem('csyos_backend_url', trimmedUrl);
        } else {
            localStorage.removeItem('csyos_backend_url');
        }
        
        if (trimmed) {
            localStorage.setItem('csyos_backend_token', trimmed);
            localStorage.removeItem('csyos_backend_alive'); // invalidate cache
            setStatus('✅ 已保存，后端引擎已启用');
        } else {
            localStorage.removeItem('csyos_backend_token');
            localStorage.removeItem('csyos_backend_alive');
            setStatus('已关闭后端引擎，使用本地模式');
        }
    };

    const handleTest = async () => {
        if (!token.trim()) { setStatus('请先填写通行证密码'); return; }
        setStatus('连接中...');
        const currentUrl = backendUrl.replace(/\/+$/, '').trim() || 'http://43.134.141.80:6677';
        try {
            const resp = await fetch(`${currentUrl}/health`, {
                headers: { 'Authorization': `Bearer ${token.trim()}` },
                signal: AbortSignal.timeout(5000),
            });
            if (resp.ok) {
                const data = await resp.json();
                setStatus(`✅ 已连接 · ${data.memoryCount || 0} 条记忆 · 延迟 ${Date.now() - data.timestamp > 0 ? '<1s' : '正常'}`);
            } else {
                setStatus(`❌ 连接失败: ${resp.status}`);
            }
        } catch (e: any) {
            setStatus('❌ 网络错误或后端未启动');
        }
    };

    return (
        <section className="bg-gradient-to-br from-[#f8fafc]/90 to-[#f1f5f9]/90 backdrop-blur-sm rounded-3xl p-6 shadow-sm border border-[#e2e8f0]/80 mt-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
            
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 bg-white shadow-sm rounded-2xl text-blue-500 border border-blue-100">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
                    </svg>
                </div>
                <div>
                    <h2 className="text-sm font-bold text-slate-700 tracking-wide">CSY OS Backend</h2>
                    <p className="text-[10px] text-slate-500 font-medium">高级记忆与激素动态集群引擎</p>
                </div>
            </div>

            <div className="space-y-4">
                <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 block pl-1">Server URL</label>
                    <input 
                        type="text" 
                        value={backendUrl} 
                        onChange={e => setBackendUrlInput(e.target.value)}
                        placeholder="http://43.134.141.80:6677"
                        className="w-full bg-white/80 border border-slate-200/60 rounded-xl px-4 py-2.5 text-xs font-mono focus:bg-white focus:border-blue-300 transition-all shadow-sm"
                    />
                </div>
                <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 block pl-1">Access Token</label>
                    <input 
                        type="password" 
                        value={token} 
                        onChange={e => setToken(e.target.value)}
                        placeholder="在这里粘贴通行证密码..."
                        className="w-full bg-white/80 border border-slate-200/60 rounded-xl px-4 py-2.5 text-xs font-mono focus:bg-white focus:border-blue-300 transition-all shadow-sm"
                    />
                </div>

                <div className="flex gap-2 pt-1">
                    <button onClick={handleSave} className="flex-1 py-3 rounded-xl font-bold text-white shadow-md shadow-blue-500/20 bg-blue-500 hover:bg-blue-600 active:scale-95 transition-all text-xs">
                        保存并应用
                    </button>
                    <button onClick={handleTest} className="px-5 py-3 rounded-xl font-bold bg-white border border-slate-200 text-slate-600 shadow-sm hover:bg-slate-50 active:scale-95 transition-all text-xs">
                        测试连接
                    </button>
                </div>

                {status && (
                    <div className={`mt-2 p-3 rounded-xl text-[11px] font-medium text-center border ${
                        status.includes('✅') 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                            : status.includes('❌') 
                                ? 'bg-red-50 text-red-600 border-red-100' 
                                : 'bg-slate-50 text-slate-600 border-slate-100'
                    }`}>
                        {status}
                    </div>
                )}
            </div>
        </section>
    );
};
