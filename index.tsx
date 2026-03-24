import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initSystemInterceptor } from './utils/systemInterceptor';
import { preloadLocalAssets, scheduleIdlePreload } from './utils/preloadResources';

// Initialize global interceptors BEFORE React mounts
initSystemInterceptor();

// 预加载本地关键图片（心声水墨画 + 邮戳装饰）
preloadLocalAssets();
// 空闲期后台预加载外部资源（朋友圈封面、通知音效等）
scheduleIdlePreload();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);