/**
 * usePushNotifications — Web Push 推送订阅管理
 *
 * 功能：
 *   - 检测浏览器支持
 *   - 请求通知权限
 *   - 注册 Service Worker → 创建推送订阅 → 发送给后端
 *   - 提供 enable/disable 接口
 *
 * Capacitor 兼容：
 *   - 在 Capacitor 原生环境下不注册 Web Push（使用已有的 @capacitor/local-notifications）
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ─── 检测运行环境 ─────────────────────────────────────

function isCapacitorNative(): boolean {
    return typeof (window as any)?.Capacitor?.isNativePlatform === 'function'
        && (window as any).Capacitor.isNativePlatform();
}

function isPushSupported(): boolean {
    return 'serviceWorker' in navigator
        && 'PushManager' in window
        && 'Notification' in window
        && !isCapacitorNative();
}

// ─── VAPID 公钥转换（Web Push 标准要求 Uint8Array）────

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

// ─── Hook ────────────────────────────────────────────

interface PushNotificationState {
    /** 是否支持 Web Push */
    supported: boolean;
    /** 当前通知权限状态 */
    permission: NotificationPermission | 'unsupported';
    /** 是否已订阅 */
    subscribed: boolean;
    /** 正在处理中 */
    loading: boolean;
    /** 错误信息 */
    error: string | null;
    /** 启用推送（请求权限 + 注册订阅） */
    enable: () => Promise<void>;
    /** 禁用推送（取消订阅） */
    disable: () => Promise<void>;
}

export function usePushNotifications(
    backendUrl: string,
    apiSecret: string,
    userId: string,
): PushNotificationState {
    const [supported] = useState(() => isPushSupported());
    const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
        () => isPushSupported() ? Notification.permission : 'unsupported'
    );
    const [subscribed, setSubscribed] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

    // 检查现有订阅状态（页面加载时）
    useEffect(() => {
        if (!supported) return;

        (async () => {
            try {
                const reg = await navigator.serviceWorker.getRegistration('/push-sw.js');
                if (reg) {
                    registrationRef.current = reg;
                    const existingSub = await reg.pushManager.getSubscription();
                    setSubscribed(!!existingSub);
                }
            } catch {
                // 静默处理
            }
        })();
    }, [supported]);

    // 启用推送
    const enable = useCallback(async () => {
        if (!supported) {
            setError('当前浏览器不支持推送通知');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // 1. 请求通知权限
            const perm = await Notification.requestPermission();
            setPermission(perm);

            if (perm !== 'granted') {
                setError('通知权限被拒绝，请在浏览器设置中手动开启');
                return;
            }

            // 2. 注册 Service Worker
            let reg = registrationRef.current;
            if (!reg) {
                reg = await navigator.serviceWorker.register('/push-sw.js', { scope: '/' });
                await navigator.serviceWorker.ready;
                registrationRef.current = reg;
            }

            // 3. 获取后端 VAPID 公钥
            const vapidResp = await fetch(`${backendUrl}/api/push/vapid-key`, {
                headers: { 'Authorization': `Bearer ${apiSecret}` },
            });
            if (!vapidResp.ok) throw new Error('获取 VAPID 公钥失败');
            const { vapidPublicKey } = await vapidResp.json();

            // 4. 创建推送订阅
            const subscription = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
            });

            // 5. 发送订阅信息给后端
            const subResp = await fetch(`${backendUrl}/api/push/subscribe`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiSecret}`,
                },
                body: JSON.stringify({
                    userId,
                    subscription: subscription.toJSON(),
                }),
            });

            if (!subResp.ok) throw new Error('注册推送订阅失败');

            setSubscribed(true);
            console.log('🔔 [Push] 推送通知已启用');
        } catch (err: any) {
            console.error('🔔 [Push] 启用失败:', err);
            setError(err.message || '启用推送通知失败');
        } finally {
            setLoading(false);
        }
    }, [supported, backendUrl, apiSecret, userId]);

    // 禁用推送
    const disable = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const reg = registrationRef.current || await navigator.serviceWorker.getRegistration('/push-sw.js');
            if (reg) {
                const sub = await reg.pushManager.getSubscription();
                if (sub) {
                    // 通知后端删除订阅
                    await fetch(`${backendUrl}/api/push/unsubscribe`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${apiSecret}`,
                        },
                        body: JSON.stringify({ endpoint: sub.endpoint }),
                    }).catch(() => {}); // 后端删除失败不影响前端

                    await sub.unsubscribe();
                }
            }

            setSubscribed(false);
            console.log('🔔 [Push] 推送通知已禁用');
        } catch (err: any) {
            console.error('🔔 [Push] 禁用失败:', err);
            setError(err.message || '禁用推送通知失败');
        } finally {
            setLoading(false);
        }
    }, [backendUrl, apiSecret]);

    return {
        supported,
        permission,
        subscribed,
        loading,
        error,
        enable,
        disable,
    };
}
