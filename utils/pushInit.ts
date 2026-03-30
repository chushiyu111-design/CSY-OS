/**
 * Push Notification Auto-Init — 自动注册推送通知
 *
 * 在后端连接成功时自动调用，无需用户手动操作。
 * 浏览器的通知权限弹窗会自动触发（这个无法跳过，是浏览器安全策略）。
 *
 * 特点：
 *   - 只注册一次（通过 localStorage 标记）
 *   - Capacitor 原生环境下跳过
 *   - 静默失败，不影响主流程
 */

// 是否为 Capacitor 原生环境
function isCapacitorNative(): boolean {
    return typeof (window as any)?.Capacitor?.isNativePlatform === 'function'
        && (window as any).Capacitor.isNativePlatform();
}

// VAPID 公钥格式转换
function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

/**
 * 自动注册 Web Push 推送通知
 * 在后端 Agent 启动成功后调用一次即可
 */
export async function initPushNotifications(
    backendUrl: string,
    backendToken: string,
    userId: string,
): Promise<void> {
    // 前置检查
    if (isCapacitorNative()) {
        console.log('🔔 [Push] Capacitor native detected, skipping Web Push init');
        return;
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.log('🔔 [Push] Web Push not supported by browser, skipping');
        return;
    }

    console.log(`🔔 [Push] Auto-init starting... userId="${userId}"`);

    // 已注册过则跳过（避免每次 Agent 启动都重复注册）
    try {
        const reg = await navigator.serviceWorker.getRegistration('/push-sw.js');
        if (reg) {
            const existingSub = await reg.pushManager.getSubscription();
            if (existingSub) {
                console.log('🔔 [Push] Already subscribed, skipping auto-init');
                return;
            }
        }
    } catch { /* continue */ }

    try {
        // 1. 请求通知权限
        const permission = await Notification.requestPermission();
        console.log(`🔔 [Push] Notification permission: ${permission}`);
        if (permission !== 'granted') {
            console.log('🔔 [Push] Permission denied, skipping');
            return;
        }

        // 2. 注册 Service Worker
        const reg = await navigator.serviceWorker.register('/push-sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;

        // 3. 获取 VAPID 公钥
        const vapidResp = await fetch(`${backendUrl}/api/push/vapid-key`, {
            headers: { 'Authorization': `Bearer ${backendToken}` },
        });
        if (!vapidResp.ok) throw new Error(`VAPID key fetch failed: ${vapidResp.status}`);
        const { vapidPublicKey } = await vapidResp.json();

        // 4. 创建推送订阅
        const subscription = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });

        // 5. 发送订阅到后端
        const subResp = await fetch(`${backendUrl}/api/push/subscribe`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${backendToken}`,
            },
            body: JSON.stringify({
                userId,
                subscription: subscription.toJSON(),
            }),
        });

        if (subResp.ok) {
            console.log('🔔 [Push] Auto-init success — push notifications enabled');
        }
    } catch (err) {
        // 静默失败，推送不影响核心功能
        console.warn('🔔 [Push] Auto-init failed (non-critical):', (err as Error).message);
    }
}
