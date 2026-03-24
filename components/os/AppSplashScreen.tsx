import React, { useState, useEffect } from 'react';
import { INSTALLED_APPS, Icons } from '../../constants';
import { AppID } from '../../types';

/**
 * 提取的各应用环境主色光晕
 * 用于在毛玻璃背景后方投射柔和的色彩光环境
 */
const COLOR_GLOW: Record<string, string> = {
    indigo: 'rgba(99, 102, 241, 0.45)', // Indigo
    green: 'rgba(34, 197, 94, 0.45)',  // Green
    violet: 'rgba(139, 92, 246, 0.45)', // Violet
    rose: 'rgba(244, 63, 94, 0.45)',  // Rose
    slate: 'rgba(100, 116, 139, 0.45)',// Slate
    red: 'rgba(239, 68, 68, 0.45)',  // Red
    blue: 'rgba(59, 130, 246, 0.45)', // Blue
    lime: 'rgba(132, 204, 22, 0.45)', // Lime
    cyan: 'rgba(6, 182, 212, 0.45)',  // Cyan
    amber: 'rgba(245, 158, 11, 0.45)', // Amber
    pink: 'rgba(236, 72, 153, 0.45)', // Pink
    emerald: 'rgba(16, 185, 129, 0.45)', // Emerald
    orange: 'rgba(249, 115, 22, 0.45)', // Orange
    purple: 'rgba(168, 85, 247, 0.45)', // Purple
};

const DEFAULT_GLOW = 'rgba(148, 163, 184, 0.45)';

interface AppSplashScreenProps {
    appId: AppID | null;
}

/**
 * Glassmorphism App Splash Screen
 * 1. 延迟 150ms 展示，避免快网速闪烁
 * 2. 具有深度毛玻璃背景（blur(40px)），完全透出下层桌面
 * 3. 根据 App 颜色在图标后方散发“氛围环境光晕”
 * 4. 图标容器采用半透明浮雕玻璃拟物化设计
 */
const AppSplashScreen: React.FC<AppSplashScreenProps> = ({ appId }) => {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setVisible(true), 150);
        return () => clearTimeout(timer);
    }, []);

    if (!visible) return null;

    // 获取 App 元数据
    const appConfig = appId ? INSTALLED_APPS.find(a => a.id === appId) : null;
    const appName = appConfig?.name ?? 'SullyOS';
    const iconKey = appConfig?.icon ?? '';
    const colorKey = appConfig?.color ?? '';
    const glowColor = COLOR_GLOW[colorKey] || DEFAULT_GLOW;
    const IconComponent = iconKey ? Icons[iconKey] : null;

    return (
        <div
            className="absolute inset-0 flex flex-col items-center justify-center select-none overflow-hidden z-[999]"
            style={{
                // 环境毛玻璃遮罩：半透明乳白光影 + 强模糊
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                backdropFilter: 'blur(35px) saturate(150%)',
                WebkitBackdropFilter: 'blur(35px) saturate(150%)',
                animation: 'glass-fade-in 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
            }}
        >
            {/* 背景动态氛围光晕：让颜色在毛玻璃后方隐约透出 */}
            <div
                className="absolute rounded-full pointer-events-none mix-blend-overlay"
                style={{
                    width: '180vw',
                    height: '180vw',
                    background: `radial-gradient(circle at 50% 50%, ${glowColor} 0%, transparent 60%)`,
                    animation: 'glass-glow-breathe 4s ease-in-out infinite alternate',
                    transform: 'translateY(-10%)',
                }}
            />

            {/* 玻璃拟物图标容器 */}
            <div
                className="relative flex items-center justify-center rounded-[2rem] shadow-2xl"
                style={{
                    width: 120,
                    height: 120,
                    // 容器背景：极度通透的白，加上极细的高光白边和内部微投影构建厚度感
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.05) 100%)',
                    border: '1px solid rgba(255, 255, 255, 0.6)',
                    boxShadow: `
            0 20px 40px rgba(0,0,0,0.1), 
            inset 0 2px 4px rgba(255,255,255,0.8),
            inset 0 -2px 4px rgba(0,0,0,0.04)
          `,
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    animation: 'glass-icon-drop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
                    opacity: 0,
                    transform: 'scale(1.1) translateY(-20px)',
                }}
            >
                {/* 核心 Icon */}
                <div style={{ color: 'rgba(0,0,0,0.7)', filter: 'drop-shadow(0px 2px 4px rgba(255,255,255,0.5))' }}>
                    {IconComponent ? (
                        <IconComponent className="w-16 h-16" />
                    ) : (
                        <span className="text-4xl font-extrabold">{appName.charAt(0)}</span>
                    )}
                </div>
            </div>

            {/* App 名称字体排印 */}
            <h2
                className="mt-6 text-sm font-bold tracking-[0.2em] uppercase text-black/60"
                style={{
                    opacity: 0,
                    animation: 'glass-text-slide 0.5s ease-out 0.2s forwards',
                    textShadow: '0 1px 2px rgba(255,255,255,0.8)'
                }}
            >
                {appName}
            </h2>

            {/* 极简质感加载条 */}
            <div
                className="mt-8 rounded-full overflow-hidden relative shadow-inner"
                style={{
                    width: 60,
                    height: 4,
                    background: 'rgba(0,0,0,0.08)',
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1), 0 1px 1px rgba(255,255,255,0.6)',
                    opacity: 0,
                    animation: 'glass-text-slide 0.5s ease-out 0.3s forwards',
                }}
            >
                <div
                    className="absolute top-0 bottom-0 left-0 rounded-full"
                    style={{
                        background: 'rgba(0,0,0,0.4)',
                        boxShadow: '0 0 4px rgba(0,0,0,0.2)',
                        animation: 'glass-loading-shimmer 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite',
                    }}
                />
            </div>

            {/* Scoped Keyframes for Glassmorphism Smooth Animations */}
            <style>{`
        @keyframes glass-fade-in {
          from { opacity: 0; backdrop-filter: blur(0px) saturate(100%); }
          to   { opacity: 1; backdrop-filter: blur(35px) saturate(150%); }
        }
        @keyframes glass-icon-drop {
          0%   { opacity: 0; transform: scale(1.1) translateY(-20px); filter: blur(5px); }
          100% { opacity: 1; transform: scale(1) translateY(0); filter: blur(0px); }
        }
        @keyframes glass-text-slide {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes glass-glow-breathe {
          0%   { opacity: 0.6; transform: scale(0.9) translateY(-5%); filter: blur(40px); }
          100% { opacity: 1; transform: scale(1.1) translateY(5%); filter: blur(60px); }
        }
        @keyframes glass-loading-shimmer {
          0%   { width: 0%; transform: translateX(-100%); }
          50%  { width: 40%; }
          100% { width: 0%; transform: translateX(300%); }
        }
      `}</style>
        </div>
    );
};

export default AppSplashScreen;
