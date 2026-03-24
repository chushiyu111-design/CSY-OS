



import React, { useState, useEffect, useRef, useCallback, Component, ErrorInfo, Suspense } from 'react';
import { useOS } from '../context/OSContext';
import { useVirtualTime } from '../context/VirtualTimeContext';
import StatusBar from './os/StatusBar';
import AppSplashScreen from './os/AppSplashScreen';
import Launcher from '../apps/Launcher';
import { AppID } from '../types';
import { App as CapApp } from '@capacitor/app';
import { StatusBar as CapStatusBar, Style as StatusBarStyle } from '@capacitor/status-bar';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

// --- Lazy-loaded Apps (only downloaded when user opens them) ---
const Settings = React.lazy(() => import('../apps/Settings'));
const Character = React.lazy(() => import('../apps/Character'));
const Chat = React.lazy(() => import('../apps/Chat'));
const GroupChat = React.lazy(() => import('../apps/GroupChat'));
const ThemeMaker = React.lazy(() => import('../apps/ThemeMaker'));
const Appearance = React.lazy(() => import('../apps/Appearance'));
const Gallery = React.lazy(() => import('../apps/Gallery'));
const DateApp = React.lazy(() => import('../apps/DateApp'));
const UserApp = React.lazy(() => import('../apps/UserApp'));
const JournalApp = React.lazy(() => import('../apps/JournalApp'));
const ScheduleApp = React.lazy(() => import('../apps/ScheduleApp'));
const RoomApp = React.lazy(() => import('../apps/RoomApp'));
const CheckPhone = React.lazy(() => import('../apps/CheckPhone'));
const SocialApp = React.lazy(() => import('../apps/SocialApp'));
const StudyApp = React.lazy(() => import('../apps/StudyApp'));
const FAQApp = React.lazy(() => import('../apps/FAQApp'));
const GameApp = React.lazy(() => import('../apps/GameApp'));
const WorldbookApp = React.lazy(() => import('../apps/WorldbookApp'));
const NovelApp = React.lazy(() => import('../apps/NovelApp'));
const BankApp = React.lazy(() => import('../apps/BankApp'));
const XhsStockApp = React.lazy(() => import('../apps/XhsStockApp'));
const XhsFreeRoamApp = React.lazy(() => import('../apps/XhsFreeRoamApp'));
const BrowserApp = React.lazy(() => import('../apps/BrowserApp'));
const VoiceCallApp = React.lazy(() => import('../apps/VoiceCallApp'));
const ZhaixinglouApp = React.lazy(() => import('../apps/zhaixinglou/ZhaixinglouApp'));
const CsyManualApp = React.lazy(() => import('../apps/CsyManualApp'));

const LazyValentineEvent = React.lazy(() => import('./ValentineEvent').then(m => ({
  default: m.SpecialMomentsApp
})));
const LazyValentineController = React.lazy(() => import('./ValentineEvent').then(m => ({
  default: m.ValentineController
})));

// shouldShowValentinePopup is a pure function, import it statically
import { shouldShowValentinePopup } from './ValentineEvent';
import { haptic } from '../utils/haptics';
import UpdatePopup from './os/UpdatePopup';

// Internal Error Boundary Component
class AppErrorBoundary extends Component<{ children: React.ReactNode, onCloseApp: () => void }, { hasError: boolean, error: Error | null }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("App Crash:", error, errorInfo);
  }

  // Reset error state when children change (e.g. app switch)
  componentDidUpdate(prevProps: any) {
    if (prevProps.children !== this.props.children) {
      this.setState({ hasError: false, error: null });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-white p-6 text-center space-y-4">
          <div className="text-4xl">😵</div>
          <h2 className="text-lg font-bold">应用运行错误</h2>
          <p className="text-xs text-slate-400 font-mono bg-black/30 p-3 rounded max-w-full overflow-auto max-h-40 select-text break-all whitespace-pre-wrap">
            {this.state.error?.message || 'Unknown Error'}
          </p>
          <button
            onClick={() => {
              const errText = this.state.error?.message || 'Unknown Error';
              navigator.clipboard?.writeText(errText).then(() => { }).catch(() => { });
            }}
            className="px-4 py-2 bg-slate-700 rounded-full text-xs active:scale-95 transition-transform"
          >
            复制错误信息
          </button>
          <button
            onClick={() => { this.setState({ hasError: false }); this.props.onCloseApp(); }}
            className="px-6 py-3 bg-red-600 rounded-full font-bold text-sm shadow-lg active:scale-95 transition-transform"
          >
            返回桌面
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const DISCLAIMER_KEY = 'sullyos_disclaimer_accepted';

const DisclaimerPopup: React.FC<{ onAccept: () => void }> = ({ onAccept }) => (
  <div className="fixed inset-0 z-[9999] flex items-center justify-center p-5 animate-fade-in">
    <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />
    <div className="relative w-full max-w-sm bg-white/95 backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/30 overflow-hidden animate-slide-up">
      {/* Header */}
      <div className="pt-7 pb-3 px-6 text-center">
        <div className="text-3xl mb-2">📢</div>
        <h2 className="text-lg font-extrabold text-slate-800">免责声明</h2>
        <p className="text-[11px] text-slate-400 mt-1">Disclaimer · 手抓糯米机 (SullyOS)</p>
      </div>

      {/* Content */}
      <div className="px-6 pb-4 max-h-[55vh] overflow-y-auto no-scrollbar space-y-3">
        <p className="text-[13px] text-slate-600 leading-relaxed">
          本项目「手抓糯米机 (SullyOS)」是一个<strong className="text-slate-800">完全开源、免费</strong>的软件，仅供个人学习、研究与技术交流使用。
        </p>
        <ul className="text-[12px] text-slate-500 leading-relaxed space-y-1.5 list-none">
          <li className="flex gap-2"><span className="shrink-0">•</span><span>本软件不提供任何明示或暗示的担保，作者不对使用本软件产生的任何后果承担责任。</span></li>
          <li className="flex gap-2"><span className="shrink-0">•</span><span>用户应自行承担使用本软件的一切风险，包括但不限于数据丢失、设备损坏等。</span></li>
          <li className="flex gap-2"><span className="shrink-0">•</span><span>本软件生成的任何 AI 内容均不代表作者立场，用户需自行判断内容的准确性与合规性。</span></li>
          <li className="flex gap-2"><span className="shrink-0">•</span><span>禁止将本软件用于任何违反当地法律法规的用途。</span></li>
        </ul>

        {/* Highlighted warning */}
        <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 mt-3">
          <p className="text-[13px] font-bold text-red-600 text-center leading-relaxed">
            ⚠️ 本程序完全免费！<br />
            如果您是通过<span className="underline decoration-2 decoration-red-400">付费购买</span>获得此程序的，说明您已被倒卖欺骗。<br />
            请向售卖者维权追责！
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 pb-7 pt-2">
        <button
          onClick={onAccept}
          className="w-full py-3.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-bold rounded-2xl shadow-lg shadow-indigo-200 active:scale-95 transition-transform text-sm"
        >
          我已知悉，继续使用
        </button>
      </div>
    </div>
  </div>
);

const PhoneShell: React.FC = () => {
  const { theme, isLocked, unlock, activeApp, closeApp, isDataLoaded, toasts, unreadMessages, characters, handleBack } = useOS();
  const virtualTime = useVirtualTime();

  // Use a ref so that the popstate / backButton handlers always see the latest values
  // without needing to be re-registered every time state changes.
  const isLockedRef = React.useRef(isLocked);
  React.useEffect(() => { isLockedRef.current = isLocked; }, [isLocked]);

  const handleBackRef = React.useRef(handleBack);
  React.useEffect(() => { handleBackRef.current = handleBack; }, [handleBack]);

  // Disclaimer popup for first-time users
  const [showDisclaimer, setShowDisclaimer] = useState(() => {
    try {
      return !localStorage.getItem(DISCLAIMER_KEY);
    } catch {
      return true;
    }
  });

  const handleAcceptDisclaimer = () => {
    try {
      localStorage.setItem(DISCLAIMER_KEY, Date.now().toString());
    } catch { /* ignore */ }
    setShowDisclaimer(false);
  };

  // Valentine's Day popup (only on 2026-02-14, first visit)
  const [showValentine, setShowValentine] = useState(() => {
    try {
      // Only show after disclaimer is accepted
      return !!(localStorage.getItem(DISCLAIMER_KEY)) && shouldShowValentinePopup();
    } catch { return false; }
  });

  // Re-check valentine popup after disclaimer is accepted
  useEffect(() => {
    if (!showDisclaimer && !showValentine) {
      if (shouldShowValentinePopup()) {
        setShowValentine(true);
      }
    }
  }, [showDisclaimer]);

  // ── Capacitor: Native Status Bar + Permissions ──────────────────────────────
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const init = async () => {
      try {
        await CapStatusBar.setOverlaysWebView({ overlay: true });
        await CapStatusBar.hide();
        await CapStatusBar.setStyle({ style: StatusBarStyle.Dark });
        const permStatus = await LocalNotifications.checkPermissions();
        if (permStatus.display !== 'granted') await LocalNotifications.requestPermissions();
      } catch (e) { console.error('Native init failed', e); }
    };
    init();
  }, []);

  // ── Capacitor: Android Hardware Back Button ───────────────────────────────────
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const setup = async () => {
      try {
        await CapApp.removeAllListeners();
        CapApp.addListener('backButton', () => {
          if (isLockedRef.current) {
            // On lock screen, back button exits the app (standard Android behaviour)
            CapApp.exitApp();
            return;
          }
          const handled = handleBackRef.current();
          if (!handled) {
            // Already at the Launcher root — exit the app
            CapApp.exitApp();
          }
        });
      } catch (e) { console.log('Back button listener setup failed'); }
    };
    setup();
    return () => { CapApp.removeAllListeners().catch(() => { }); };
  }, []); // Stable: always reads latest values via refs

  // ── Web / PWA: History API Trap ──────────────────────────────────────────────
  // Injects a dummy history entry so that the browser's back gesture fires
  // a popstate event instead of navigating away from the page.
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return; // Only for web/PWA

    // Push the initial dummy state so we're always one step ahead
    history.pushState({ sullyos: true }, '');

    let handling = false; // Simple re-entry guard

    const onPopState = () => {
      if (handling) return;
      handling = true;

      if (isLockedRef.current) {
        // Lock screen: allow normal browser back (don't re-push)
        handling = false;
        return;
      }

      const handled = handleBackRef.current();

      if (handled) {
        // Action was taken (app closed / sub-view closed) — stay in the trap
        requestAnimationFrame(() => {
          history.pushState({ sullyos: true }, '');
          handling = false;
        });
      } else {
        // Already at root — release the trap, next back exits normally
        handling = false;
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, []); // Stable: always reads latest values via refs

  // Force scroll to top when app changes to prevent "push up" glitches on iOS
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeApp]);

  // ── Idle Prefetch: Preload Zhaixinglou chunk + critical assets after unlock ──
  // This runs once when the user enters the Launcher, so the chunk is already
  // in browser cache by the time they tap the Zhaixinglou icon.
  // NOTE: Safari/iOS does NOT support requestIdleCallback — use setTimeout fallback.
  useEffect(() => {
    if (isLocked) return;
    const rIC = window.requestIdleCallback || ((cb: () => void) => window.setTimeout(cb, 1));
    const cIC = window.cancelIdleCallback || window.clearTimeout;
    const id = rIC(() => {
      // Prefetch the ZhaixinglouApp JS chunk (download only, no mount)
      import('../apps/zhaixinglou/ZhaixinglouApp');
      // Prefetch critical first-screen assets (card back image + fonts)
      import('../apps/zhaixinglou/AssetPreloader').then(m => m.prefetchZhaixinglouAssets());
    }, { timeout: 4000 });
    return () => cIC(id);
  }, [isLocked]);

  if (!isDataLoaded) {
    return <div className="w-full h-full bg-black flex items-center justify-center"><div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin"></div></div>;
  }

  const getBgStyle = (wp: string) => {
    const isUrl = wp.startsWith('http') || wp.startsWith('data:') || wp.startsWith('blob:');
    return isUrl ? `url(${wp})` : wp;
  };

  const bgImageValue = getBgStyle(theme.wallpaper);
  const contentColor = theme.contentColor || '#ffffff';

  if (isLocked) {
    const unreadCount = Object.values(unreadMessages).reduce((a, b) => a + b, 0);
    const unreadCharId = Object.keys(unreadMessages)[0];
    const unreadChar = unreadCharId ? characters.find(c => c.id === unreadCharId) : null;

    return (
      <div
        onClick={() => {
          if ('Notification' in window && Notification.permission !== 'granted') {
            Notification.requestPermission();
          }
          haptic.light();
          unlock();
        }}
        className="relative w-full h-full bg-cover bg-center cursor-pointer overflow-hidden group font-light select-none overscroll-none"
        style={{ backgroundImage: bgImageValue, color: contentColor }}
      >
        <div className="absolute inset-0 bg-black/5 backdrop-blur-sm transition-all group-hover:backdrop-blur-none group-hover:bg-transparent duration-700" />

        <div className="absolute top-24 w-full text-center drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
          <div className="text-8xl tracking-tighter opacity-95 font-bold">
            {virtualTime.hours.toString().padStart(2, '0')}<span className="animate-pulse">:</span>{virtualTime.minutes.toString().padStart(2, '0')}
          </div>
          <div className="text-lg tracking-widest opacity-90 mt-2 uppercase text-xs font-bold">SullyOS Simulation</div>
        </div>

        {unreadCount > 0 && (
          <div className="absolute top-[40%] left-4 right-4 animate-slide-up">
            <div className="bg-white/20 backdrop-blur-md rounded-2xl p-4 shadow-lg border border-white/10 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-green-500 flex items-center justify-center text-white shrink-0 shadow-sm">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path fillRule="evenodd" d="M4.804 21.644A6.707 6.707 0 0 0 6 21.75a6.721 6.721 0 0 0 3.583-1.029c.774.182 1.584.279 2.417.279 5.322 0 9.75-3.97 9.75-9 0-5.03-4.428-9-9.75-9s-9.75 3.97-9.75 9c0 2.409 1.025 4.587 2.674 6.192.232.226.277.428.254.543a3.73 3.73 0 0 1-.814 1.686.75.75 0 0 0 .44 1.223ZM8.25 10.875a1.125 1.125 0 1 0 0 2.25 1.125 1.125 0 0 0 0-2.25ZM10.875 12a1.125 1.125 0 1 1 2.25 0 1.125 1.125 0 0 1-2.25 0Zm4.875-1.125a1.125 1.125 0 1 0 0 2.25 1.125 1.125 0 0 0 0-2.25Z" clipRule="evenodd" /></svg>
              </div>
              <div className="flex-1 min-w-0 text-white text-left">
                <div className="font-bold text-sm flex justify-between">
                  <span>{unreadChar ? unreadChar.name : 'Message'}</span>
                  <span className="text-[10px] opacity-70">刚刚</span>
                </div>
                <div className="text-xs opacity-90 truncate">
                  {unreadCount > 1 ? `收到 ${unreadCount} 条新消息` : '发来了一条新消息'}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="absolute bottom-12 w-full flex flex-col items-center gap-3 animate-pulse opacity-80 drop-shadow-md">
          <div className="w-1 h-8 rounded-full bg-gradient-to-b from-transparent to-current"></div>
          <span className="text-[10px] tracking-widest uppercase font-semibold">Tap to Unlock</span>
        </div>
      </div>
    );
  }

  const renderApp = () => {
    switch (activeApp) {
      case AppID.Settings: return <Settings />;
      case AppID.Character: return <Character />;
      case AppID.Chat: return <Chat />;
      case AppID.GroupChat: return <GroupChat />;
      case AppID.ThemeMaker: return <ThemeMaker />;
      case AppID.Appearance: return <Appearance />;
      case AppID.Gallery: return <Gallery />;
      case AppID.Date: return <DateApp />;
      case AppID.User: return <UserApp />;
      case AppID.Journal: return <JournalApp />;
      case AppID.Schedule: return <ScheduleApp />;
      case AppID.Room: return <RoomApp />;
      case AppID.CheckPhone: return <CheckPhone />;
      case AppID.Social: return <SocialApp />;
      case AppID.Study: return <StudyApp />;
      case AppID.FAQ: return <FAQApp />;
      case AppID.Game: return <GameApp />;
      case AppID.Worldbook: return <WorldbookApp />;
      case AppID.Novel: return <NovelApp />;
      case AppID.Bank: return <BankApp />;
      case AppID.XhsStock: return <XhsStockApp />;
      case AppID.XhsFreeRoam: return <XhsFreeRoamApp />;
      case AppID.Browser: return <BrowserApp />;
      case AppID.VoiceCall: return <VoiceCallApp />;
      case AppID.SpecialMoments: return <LazyValentineEvent />;
      case AppID.Zhaixinglou: return <ZhaixinglouApp />;
      case AppID.CsyManual: return <CsyManualApp />;

      case AppID.Launcher:
      default: return <Launcher />;
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-gradient-to-br from-pink-200 via-purple-200 to-indigo-200 text-slate-900 font-sans select-none overscroll-none">
      {/* Optimized Background Layer */}
      <div
        className="absolute inset-0 bg-cover bg-center transition-all duration-700 ease-[cubic-bezier(0.25,0.1,0.25,1)]"
        style={{
          backgroundImage: bgImageValue,
          transform: activeApp !== AppID.Launcher ? 'scale(1.1)' : 'scale(1)',
          filter: activeApp !== AppID.Launcher ? 'blur(10px)' : 'none',
          opacity: activeApp !== AppID.Launcher ? 0.6 : 1,
          backfaceVisibility: 'hidden',
          contain: 'strict'
        }}
      />

      <div className={`absolute inset-0 transition-all duration-500 ${activeApp === AppID.Launcher ? 'bg-transparent' : 'bg-white/50 backdrop-blur-3xl'}`} />

      {/* 
          CRITICAL FIX: 
          Using 'absolute inset-0' prevents layout collapse.
          REMOVED 'flex flex-col' to fix layout issues in CheckPhone (gap) and SocialApp (jumping).
          Now it acts as a pure container for full-screen apps.
       */}
      <div
        className="absolute inset-0 z-10 w-full h-full overflow-hidden bg-transparent overscroll-none flex flex-col"
        style={{
          paddingTop: activeApp !== AppID.Launcher ? 'env(safe-area-inset-top)' : 0,
          paddingBottom: activeApp !== AppID.Launcher ? 'env(safe-area-inset-bottom)' : 0
        }}
      >
        {/* App Container */}
        <div className="flex-1 relative overflow-hidden" style={{ contain: 'layout style paint' }}>
          <AppErrorBoundary onCloseApp={closeApp}>
            <Suspense fallback={<AppSplashScreen appId={activeApp} />}>
              {renderApp()}
            </Suspense>
          </AppErrorBoundary>
        </div>

        {/* Overlays: Status Bar (Top) */}
        {!theme.hideStatusBar && <StatusBar />}

        {/* Overlays: iOS-Style Banner Notifications */}
        <div className="absolute top-0 left-0 w-full flex flex-col items-center gap-2 pointer-events-none z-[60]" style={{ paddingTop: 'max(12px, calc(env(safe-area-inset-top) + 4px))' }}>
          {toasts.map(toast => (
            <div key={toast.id} className="animate-notif-in w-[92%] max-w-md bg-white/90 backdrop-blur-2xl rounded-[20px] shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-white/40 overflow-hidden pointer-events-auto">
              <div className="px-4 py-3 flex items-start gap-3">
                {/* App Icon indicator */}
                <div className={`w-8 h-8 rounded-[8px] shrink-0 flex items-center justify-center shadow-sm mt-0.5 ${toast.type === 'success' ? 'bg-gradient-to-br from-green-400 to-green-500' :
                  toast.type === 'error' ? 'bg-gradient-to-br from-red-400 to-red-500' :
                    'bg-gradient-to-br from-indigo-400 to-purple-500'
                  }`}>
                  <span className="text-white text-sm font-bold">S</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">SullyOS</span>
                    <span className="text-[10px] text-slate-400">now</span>
                  </div>
                  <p className="text-[13px] font-semibold text-slate-800 leading-snug line-clamp-2">{toast.message}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* First-time disclaimer popup */}
      {showDisclaimer && <DisclaimerPopup onAccept={handleAcceptDisclaimer} />}

      {/* Valentine's Day popup (2026-02-14) */}
      {!showDisclaimer && showValentine && <Suspense fallback={null}><LazyValentineController onClose={() => setShowValentine(false)} /></Suspense>}

      {/* Update Changelog Popup */}
      <UpdatePopup canShow={!showDisclaimer && !showValentine} />
    </div>
  );
};

export default PhoneShell;
