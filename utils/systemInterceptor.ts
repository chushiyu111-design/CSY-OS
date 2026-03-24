/**
 * systemInterceptor.ts
 * 
 * Global fetch/console.error interceptor.
 * Initialized ONCE before React mounts (in index.tsx).
 * Communicates captured logs to React via an EventTarget-based emitter.
 */

import { SystemLog } from '../types';

// --- Event-based communication channel ---
type LogListener = (log: SystemLog) => void;

let _listener: LogListener | null = null;
let _initialized = false;

/**
 * Register a callback from React to receive intercepted logs.
 * Call this inside a useEffect in OSContext.
 * Returns an unsubscribe function.
 */
export function onSystemLog(listener: LogListener): () => void {
    _listener = listener;
    return () => {
        if (_listener === listener) {
            _listener = null;
        }
    };
}

function emit(log: SystemLog) {
    if (_listener) {
        _listener(log);
    }
}

/**
 * Initialize global interceptors.
 * MUST be called exactly once, before ReactDOM.createRoot().
 * Safe to call multiple times (idempotent via _initialized guard).
 */
export function initSystemInterceptor(): void {
    if (_initialized) return;
    _initialized = true;

    // 1. Monkey Patch Fetch
    const originalFetch = window.fetch;
    const patchedFetch = async (...args: [RequestInfo | URL, RequestInit?]) => {
        const [resource] = args;
        const urlStr = String(resource);

        try {
            const response = await originalFetch(...args);

            if (!response.ok) {
                // Only log if it's likely an API call
                if (urlStr.includes('/chat/completions') || urlStr.includes('/models')) {
                    try {
                        const clone = response.clone();
                        const text = await clone.text();
                        emit({
                            id: `log-${Date.now()}`,
                            timestamp: Date.now(),
                            type: 'network',
                            source: 'API Request',
                            message: `HTTP ${response.status} Error`,
                            detail: `URL: ${urlStr}\nResponse: ${text.substring(0, 500)}`
                        });
                    } catch {
                        emit({
                            id: `log-${Date.now()}`,
                            timestamp: Date.now(),
                            type: 'network',
                            source: 'API Request',
                            message: `HTTP ${response.status} (Unreadable Body)`,
                            detail: `URL: ${urlStr}`
                        });
                    }
                }
            }
            return response;
        } catch (err: any) {
            emit({
                id: `log-${Date.now()}`,
                timestamp: Date.now(),
                type: 'network',
                source: 'Network',
                message: err.message || 'Fetch Failed',
                detail: `URL: ${urlStr}`
            });
            throw err;
        }
    };

    try {
        window.fetch = patchedFetch;
    } catch {
        try {
            Object.defineProperty(window, 'fetch', {
                value: patchedFetch,
                writable: true,
                configurable: true
            });
        } catch (e2) {
            console.warn("Failed to install network interceptor", e2);
        }
    }

    // 2. Monkey Patch console.error
    const originalConsoleError = console.error;
    console.error = (...args: any[]) => {
        originalConsoleError(...args);
        const msg = args.map(a => (a instanceof Error ? a.message : String(a))).join(' ');
        const detail = args.map(a => (a instanceof Error ? a.stack : '')).join('\n');
        if (msg.includes('Warning:')) return;
        emit({
            id: `log-${Date.now()}-${Math.random()}`,
            timestamp: Date.now(),
            type: 'error',
            source: 'Application',
            message: msg.substring(0, 100),
            detail: detail || msg
        });
    };
}
