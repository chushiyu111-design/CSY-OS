/**
 * 测试脚本：前端连通性测试
 * 用于验证前端是否能成功调用本地启动的 csyos-backend
 */

import { VectorMemory } from '../types';

// 你刚才在 backend 的 .env 里设置的 API_SECRET
const BACKEND_API_SECRET = 'csyos-dev-secret-2026';
const BACKEND_URL = 'http://localhost:6677';

export async function testBackendConnection(charId: string) {
    console.log(`[Backend Test] 开始测试连接后端...`);

    // 1. 测健康检查
    try {
        const healthRes = await fetch(`${BACKEND_URL}/health`);
        const healthData = await healthRes.json();
        console.log(`[Backend Test] ✅ 健康检查成功:`, healthData);
    } catch (e: any) {
        console.error(`[Backend Test] ❌ 无法连接到后端，确认 npm run dev 是否在运行?`, e.message);
        return;
    }

    // 2. 模拟前端提取出了一条新记忆
    const mockMemory: Partial<VectorMemory> = {
        id: `vmem-test-${Date.now()}`,
        charId,
        title: '测试连通性',
        content: '这是一条从前端发往后端的测试记忆，证明接口通了！',
        importance: 8,
        createdAt: Date.now(),
        // 假设这里本来有向量数据：
        // vector: [0.1, 0.2, 0.3, ...], 
    };

    // 3. 将记忆推送到后端 (使用 Sync API)
    try {
        console.log(`[Backend Test] 尝试推送记忆到后端...`);
        const pushRes = await fetch(`${BACKEND_URL}/api/sync/push`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${BACKEND_API_SECRET}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                charId,
                memories: [mockMemory]
            })
        });

        if (!pushRes.ok) {
            throw new Error(`Push 失败: ${pushRes.status} ${await pushRes.text()}`);
        }
        
        const pushData = await pushRes.json();
        console.log(`[Backend Test] ✅ 记忆推送成功:`, pushData);

    } catch (e: any) {
        console.error(`[Backend Test] ❌ 记忆推送失败:`, e.message);
        return;
    }

    // 4. 再从后端拉取一下，看看有没有存进去
    try {
        console.log(`[Backend Test] 尝试从后端拉取记忆...`);
        const pullRes = await fetch(`${BACKEND_URL}/api/sync/pull?charId=${charId}&since=0`, {
            headers: {
                'Authorization': `Bearer ${BACKEND_API_SECRET}`
            }
        });

        if (!pullRes.ok) {
            throw new Error(`Pull 失败: ${pullRes.status} ${await pullRes.text()}`);
        }

        const pullData = await pullRes.json();
        console.log(`[Backend Test] ✅ 成功拉取到 ${pullData.count} 条记忆`);
        console.log(`[Backend Test] 最新一条是:`, pullData.memories[pullData.memories.length - 1]);

    } catch (e: any) {
        console.error(`[Backend Test] ❌ 记忆拉取失败:`, e.message);
    }
}
