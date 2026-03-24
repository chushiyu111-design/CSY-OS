/**
 * StatusCardRenderer — 创意状态栏通用渲染器
 * 
 * 根据 StatusCardData.cardType 路由到对应的骨架组件。
 * 负责：CSS变量注入、白名单验证、fallback降级。
 */

import React, { Suspense, useMemo } from 'react';
import { StatusCardData } from '../../types/statusCard';

// ─── Lazy-loaded skeletons ──────────────────────────────────────
// Each skeleton is lazy-imported to avoid bloating the main bundle.
// When new skeletons are added, register them here.

const skeletonLoaders: Record<string, React.LazyExoticComponent<React.FC<{ data: StatusCardData }>>> = {
    postcard:      React.lazy(() => import('./skeletons/PostcardSkeleton')),
    phone_screen:  React.lazy(() => import('./skeletons/PhoneScreenSkeleton')),
    sticky_note:   React.lazy(() => import('./skeletons/StickyNoteSkeleton')),
    receipt:       React.lazy(() => import('./skeletons/ReceiptSkeleton')),
    diary:         React.lazy(() => import('./skeletons/DiarySkeleton')),
    music_player:  React.lazy(() => import('./skeletons/MusicPlayerSkeleton')),
    polaroid:      React.lazy(() => import('./skeletons/PolaroidSkeleton')),
    social_post:   React.lazy(() => import('./skeletons/SocialPostSkeleton')),
};

// ─── CSS value whitelist ────────────────────────────────────────
const SAFE_COLOR_RE = /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|[a-zA-Z]{3,20})$/;
const SAFE_FONT_STYLES = new Set(['serif', 'sans', 'handwrite', 'mono']);

function sanitizeColor(value: string | undefined, fallback: string): string;
function sanitizeColor(value: string | undefined, fallback: undefined): string | undefined;
function sanitizeColor(value: string | undefined, fallback: string | undefined): string | undefined {
    if (!value) return fallback;
    return SAFE_COLOR_RE.test(value.trim()) ? value.trim() : fallback;
}

// ─── Fallback Card (classic innerVoice text) ────────────────────
const FallbackCard: React.FC<{ data: StatusCardData }> = ({ data }) => (
    <div
        style={{
            width: '330px',
            maxWidth: 'calc(100vw - 48px)',
            background: '#F9F8F4',
            borderRadius: '3px',
            padding: '24px 18px',
            boxShadow: '0 20px 40px -10px rgba(0,0,0,0.4)',
            transform: 'rotate(-1.5deg)',
            color: '#2A2520',
            fontFamily: "'Noto Serif SC', 'Kaiti SC', STKaiti, serif",
            textAlign: 'center',
            lineHeight: '2.0',
            fontSize: '16px',
        }}
    >
        <div style={{
            fontSize: '10px',
            letterSpacing: '0.4em',
            color: '#8C8273',
            textTransform: 'uppercase',
            marginBottom: '12px',
        }}>
            Inner Voice
        </div>
        <div style={{ minHeight: '40px' }}>{data.body}</div>
        {data.footer && (
            <div style={{
                fontSize: '9px',
                color: '#A69D8F',
                marginTop: '16px',
                paddingTop: '12px',
                borderTop: '1px solid rgba(140,130,115,0.2)',
            }}>
                {data.footer}
            </div>
        )}
    </div>
);

// ─── Loading spinner ────────────────────────────────────────────
const CardLoadingFallback: React.FC = () => (
    <div style={{
        width: '330px',
        maxWidth: 'calc(100vw - 48px)',
        height: '200px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(255,255,255,0.05)',
        borderRadius: '6px',
        backdropFilter: 'blur(4px)',
    }}>
        <div style={{
            width: '24px',
            height: '24px',
            border: '2px solid rgba(255,255,255,0.3)',
            borderTopColor: 'rgba(255,255,255,0.8)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
        }} />
    </div>
);

// ─── Main Renderer ──────────────────────────────────────────────
interface StatusCardRendererProps {
    data: StatusCardData;
}

const StatusCardRenderer: React.FC<StatusCardRendererProps> = ({ data }) => {
    // Sanitize style values
    const sanitizedData = useMemo<StatusCardData>(() => ({
        ...data,
        body: (data.body || '').slice(0, 200),
        title: data.title?.slice(0, 50),
        footer: data.footer?.slice(0, 50),
        style: {
            ...data.style,
            bgGradient: data.style.bgGradient ? [
                sanitizeColor(data.style.bgGradient[0], '#1a1a2e'),
                sanitizeColor(data.style.bgGradient[1], '#16213e'),
            ] as [string, string] : undefined,
            textColor: sanitizeColor(data.style.textColor, undefined),
            accent: sanitizeColor(data.style.accent, undefined),
            fontStyle: SAFE_FONT_STYLES.has(data.style.fontStyle || '') ? data.style.fontStyle : 'serif',
        },
    }), [data]);

    // ── Freeform HTML card: render in sandboxed iframe ──
    if (sanitizedData.cardType === 'freeform' && sanitizedData.meta?.html) {
        return (
            <iframe
                srcDoc={sanitizedData.meta.html}
                sandbox="allow-scripts"
                title="Freeform creative card"
                style={{
                    width: '330px',
                    maxWidth: 'calc(100vw - 48px)',
                    height: '220px',
                    border: 'none',
                    borderRadius: '6px',
                    background: 'transparent',
                    colorScheme: 'light dark',
                    overflow: 'hidden',
                    display: 'block',
                }}
            />
        );
    }

    // Resolve skeleton component
    const SkeletonComponent = skeletonLoaders[sanitizedData.cardType];

    if (!SkeletonComponent) {
        // Unknown cardType → fallback to simple text card
        return <FallbackCard data={sanitizedData} />;
    }

    return (
        <Suspense fallback={<CardLoadingFallback />}>
            <SkeletonComponent data={sanitizedData} />
        </Suspense>
    );
};

export default StatusCardRenderer;
