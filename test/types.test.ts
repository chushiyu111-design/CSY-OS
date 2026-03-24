import { describe, it, expect } from 'vitest';

// Test the types barrel export — ensures all type modules resolve correctly
describe('Types barrel export', () => {
    it('should export AppID enum', async () => {
        const types = await import('../types');
        expect(types.AppID).toBeDefined();
        expect(types.AppID.Chat).toBe('chat');
        expect(types.AppID.Launcher).toBe('launcher');
    });

    it('should export all key interfaces as importable symbols', async () => {
        // Dynamic import to verify module resolution
        const types = await import('../types');
        // These are type-only exports, but the module should resolve without error
        expect(types).toBeDefined();
    });
});

// Test pure utility: chatParser
describe('ChatParser', () => {
    it('should be importable', async () => {
        const { ChatParser } = await import('../utils/chatParser');
        expect(ChatParser).toBeDefined();
    });
});
