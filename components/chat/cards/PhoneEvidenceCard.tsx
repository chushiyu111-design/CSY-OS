import React from 'react';
import { Message } from '../../../types';

// ─── Sub-card imports (modular architecture) ────────────────────
import WeChatSpyCard from './phone/WeChatSpyCard';
import TaobaoOrderCard from './phone/TaobaoOrderCard';
import MeituanTakeoutCard from './phone/MeituanTakeoutCard';
import CallLogCard from './phone/CallLogCard';
import SocialPostSpyCard from './phone/SocialPostSpyCard';
import DefaultAppCard from './phone/DefaultAppCard';

/**
 * PhoneEvidenceCard — Pure Dispatcher / Router
 *
 * Routes `phoneType` to the appropriate sub-card component.
 * Each sub-card lives in its own file under `./phone/` for
 * easy maintenance, independent iteration, and zero cross-contamination.
 *
 * These cards are IMMUTABLE (not affected by chat theme).
 */

interface PhoneEvidenceCardProps {
    message: Message;
}

const PhoneEvidenceCard: React.FC<PhoneEvidenceCardProps> = ({ message }) => {
    const meta = message.metadata || {};
    const phoneType = (meta.phoneType as string) || '';
    const title = (meta.phoneTitle as string) || '';
    const detail = (meta.phoneDetail as string) || '';
    const value = meta.phoneValue as string | undefined;
    const label = (meta.phoneLabel as string) || phoneType;
    const charName = (meta.charName as string) || '';
    const charAvatar = (meta.charAvatar as string) || undefined;
    const shop = (meta.phoneShop as string) || undefined;

    switch (phoneType) {
        case 'chat':
            return <WeChatSpyCard title={title} detail={detail} charName={charName} />;
        case 'order':
            return <TaobaoOrderCard title={title} detail={detail} value={value} shop={shop} />;
        case 'delivery':
            return <MeituanTakeoutCard title={title} detail={detail} value={value} shop={shop} />;
        case 'call':
            return <CallLogCard title={title} detail={detail} value={value} />;
        case 'social':
            return <SocialPostSpyCard title={title} detail={detail} charName={charName} charAvatar={charAvatar} />;
        default:
            // Custom apps or unknown types — generic purple card
            return <DefaultAppCard label={label} title={title} detail={detail} value={value} />;
    }
};

export default PhoneEvidenceCard;
