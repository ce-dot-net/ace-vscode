import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { AceLearnTool } from '../../tools/aceLearn';

interface FakeLearningResponse {
    learning_statistics: {
        patterns_created: number;
        patterns_updated: number;
        patterns_pruned: number;
        average_confidence: number;
        analysis_time_seconds: number;
        by_section: Record<string, number>;
    };
}

function fakeStats(): FakeLearningResponse {
    return {
        learning_statistics: {
            patterns_created: 1,
            patterns_updated: 0,
            patterns_pruned: 0,
            average_confidence: 0.9,
            analysis_time_seconds: 0.5,
            by_section: { strategies_and_hard_rules: 1 }
        }
    };
}

function makeOptions(): vscode.LanguageModelToolInvocationOptions<{ task: string; success?: boolean; output?: string }> {
    return {
        input: { task: 'test task', success: true, output: 'ok' },
        toolInvocationToken: undefined
    } as unknown as vscode.LanguageModelToolInvocationOptions<{ task: string; success?: boolean; output?: string }>;
}

function partsToString(result: vscode.LanguageModelToolResult): string {
    const parts = (result as unknown as { content: { value: string }[] }).content;
    return parts.map(p => p.value).join('\n');
}

suite('AceLearnTool CancellationToken', () => {
    let storeStub: sinon.SinonStub;
    let fakeClient: { storeExecutionTraceStream: sinon.SinonStub };

    setup(() => {
        storeStub = sinon.stub();
        fakeClient = { storeExecutionTraceStream: storeStub };
    });

    teardown(() => {
        sinon.restore();
    });

    test('cancelled-before-invoke: short-circuits without calling SDK', async () => {
        const tool = new AceLearnTool(() => fakeClient as unknown as ReturnType<typeof import('../../services/aceClient').getAceClient>);
        const cts = new vscode.CancellationTokenSource();
        cts.cancel();

        const result = await tool.invoke(makeOptions(), cts.token);
        const text = partsToString(result);

        assert.strictEqual(storeStub.callCount, 0, 'storeExecutionTraceStream must NOT be called');
        assert.ok(/cancel|skip/i.test(text), `expected skip/cancel marker, got: ${text}`);

        cts.dispose();
    });

    test('cancel-during-invoke: SDK already committed, report success', async () => {
        // Late cancellation cannot un-commit a server-side trace. If the SDK
        // resolves, the trace landed — report capture truthfully rather than
        // lying with a "skipped" marker.
        let resolveSdk: (v: FakeLearningResponse) => void = () => {};
        const sdkPromise = new Promise<FakeLearningResponse>(r => { resolveSdk = r; });
        storeStub.returns(sdkPromise);

        const tool = new AceLearnTool(() => fakeClient as unknown as ReturnType<typeof import('../../services/aceClient').getAceClient>);
        const cts = new vscode.CancellationTokenSource();

        const invokePromise = tool.invoke(makeOptions(), cts.token);
        await new Promise(r => setImmediate(r));
        cts.cancel();
        resolveSdk(fakeStats());

        const result = await invokePromise;
        const text = partsToString(result);

        assert.strictEqual(storeStub.callCount, 1, 'SDK called exactly once');
        assert.ok(/Learning captured/i.test(text), `expected success output after late cancel, got: ${text}`);

        cts.dispose();
    });

    test('happy-path: not cancelled → full success output, SDK called once', async () => {
        storeStub.resolves(fakeStats());

        const tool = new AceLearnTool(() => fakeClient as unknown as ReturnType<typeof import('../../services/aceClient').getAceClient>);
        const cts = new vscode.CancellationTokenSource();

        const result = await tool.invoke(makeOptions(), cts.token);
        const text = partsToString(result);

        assert.strictEqual(storeStub.callCount, 1, 'SDK called exactly once');
        assert.ok(/Learning captured/i.test(text), `expected success output, got: ${text}`);
        assert.ok(!/cancel|skip/i.test(text), 'happy path should not contain skip/cancel marker');

        cts.dispose();
    });
});
