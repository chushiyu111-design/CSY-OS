
import React, { useEffect } from 'react';
import { VirtualTimeProvider } from './context/VirtualTimeContext';
import { OSProvider } from './context/OSContext';
import PhoneShell from './components/PhoneShell';

/**
 * 检测是否运行在 PWA (已安装到桌面) 模式
 */
function isPwaMode(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    (navigator as any).standalone === true
  );
}

/**
 * 请求系统级全屏 (Fullscreen API)
 * 隐藏安卓状态栏 + 导航栏
 */
function requestSystemFullscreen() {
  const el = document.documentElement;
  const request =
    el.requestFullscreen ||
    (el as any).webkitRequestFullscreen ||
    (el as any).mozRequestFullScreen ||
    (el as any).msRequestFullscreen;
  if (request && !document.fullscreenElement) {
    request.call(el).catch(() => {
      // 静默失败 —— 某些浏览器/系统不支持
    });
  }
}

const App: React.FC = () => {
  useEffect(() => {
    if (!isPwaMode()) return;

    // Fullscreen API 需要用户手势触发，监听第一次触摸/点击
    const handler = () => {
      requestSystemFullscreen();
      // 触发一次后移除监听
      document.removeEventListener('touchstart', handler);
      document.removeEventListener('click', handler);
    };

    document.addEventListener('touchstart', handler, { once: true });
    document.addEventListener('click', handler, { once: true });

    return () => {
      document.removeEventListener('touchstart', handler);
      document.removeEventListener('click', handler);
    };
  }, []);

  return (
    <div className="h-screen w-full bg-black overflow-hidden">
      <div
        className="fixed inset-0 w-full h-full z-0 bg-black"
        style={{ transform: 'translateZ(0)' }}
      >
        <VirtualTimeProvider>
          <OSProvider>
            <PhoneShell />
          </OSProvider>
        </VirtualTimeProvider>
      </div>
    </div>
  );
};

export default App;
