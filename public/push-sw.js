/**
 * Push Notification Service Worker
 *
 * 处理后端推送的 Web Push 通知：
 *   - push 事件 → 显示系统通知
 *   - notificationclick → 聚焦/打开 App
 */

// 监听推送事件
self.addEventListener('push', function (event) {
    if (!event.data) return;

    let payload;
    try {
        payload = event.data.json();
    } catch {
        payload = {
            title: '新消息',
            body: event.data.text(),
        };
    }

    const title = payload.title || '新消息';
    const options = {
        body: payload.body || '',
        icon: payload.icon || '/icons/icon-192.webp',
        badge: payload.badge || '/icons/icon-192.webp',
        tag: payload.data?.charId || 'default',  // 同一角色的通知会合并
        renotify: true,  // 即使 tag 相同也震动提醒
        data: payload.data || {},
        // Android 专属
        vibrate: [200, 100, 200],
        actions: [
            { action: 'open', title: '查看' },
            { action: 'dismiss', title: '稍后' },
        ],
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// 监听通知点击
self.addEventListener('notificationclick', function (event) {
    event.notification.close();

    if (event.action === 'dismiss') return;

    // 聚焦已打开的窗口，或打开新窗口
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            // 如果已有打开的窗口，聚焦它
            for (var i = 0; i < clientList.length; i++) {
                var client = clientList[i];
                if (client.url && 'focus' in client) {
                    return client.focus();
                }
            }
            // 否则打开新窗口
            if (self.clients.openWindow) {
                return self.clients.openWindow('/');
            }
        })
    );
});

// Service Worker 安装 — 立即激活
self.addEventListener('install', function (event) {
    self.skipWaiting();
});

self.addEventListener('activate', function (event) {
    event.waitUntil(self.clients.claim());
});
