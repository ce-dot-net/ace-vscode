import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';

import { activateTerminalWatcher } from '../../automation/terminalWatcher';

type EndHandler = (event: vscode.TerminalShellExecutionEndEvent) => void;

function makeContext(): vscode.ExtensionContext {
    return {
        subscriptions: [] as vscode.Disposable[]
    } as unknown as vscode.ExtensionContext;
}

function makeEvent(commandLineValue: string, exitCode: number | undefined): vscode.TerminalShellExecutionEndEvent {
    return {
        terminal: {} as vscode.Terminal,
        shellIntegration: {} as vscode.TerminalShellIntegration,
        execution: {
            commandLine: { value: commandLineValue, isTrusted: true, confidence: 2 }
        } as unknown as vscode.TerminalShellExecution,
        exitCode
    };
}

suite('TerminalWatcher', () => {
    let originalOnDidEnd: typeof vscode.window.onDidEndTerminalShellExecution | undefined;
    let getConfigStub: sinon.SinonStub;
    let infoMessageStub: sinon.SinonStub;
    let capturedHandler: EndHandler | undefined;

    setup(() => {
        capturedHandler = undefined;

        originalOnDidEnd = vscode.window.onDidEndTerminalShellExecution;
        const stubEvent = ((handler: EndHandler) => {
            capturedHandler = handler;
            return { dispose() { /* noop */ } } as vscode.Disposable;
        }) as unknown as typeof vscode.window.onDidEndTerminalShellExecution;
        Object.defineProperty(vscode.window, 'onDidEndTerminalShellExecution', {
            value: stubEvent,
            configurable: true,
            writable: true
        });

        getConfigStub = sinon.stub(vscode.workspace, 'getConfiguration');
        infoMessageStub = sinon.stub(vscode.window, 'showInformationMessage');
    });

    teardown(() => {
        sinon.restore();
        if (originalOnDidEnd !== undefined) {
            Object.defineProperty(vscode.window, 'onDidEndTerminalShellExecution', {
                value: originalOnDidEnd,
                configurable: true,
                writable: true
            });
        }
    });

    function configureLevel(level: string): void {
        getConfigStub.withArgs('ace').returns({
            get: (key: string, defaultValue?: unknown) => {
                if (key === 'automation.level') return level;
                return defaultValue;
            }
        } as unknown as vscode.WorkspaceConfiguration);
    }

    test('shows nudge for successful build/test command in smart mode', () => {
        configureLevel('smart');
        const ctx = makeContext();

        activateTerminalWatcher(ctx);
        assert.ok(capturedHandler, 'handler should have been registered');

        capturedHandler!(makeEvent('npm test', 0));

        assert.strictEqual(infoMessageStub.callCount, 1);
        const args = infoMessageStub.firstCall.args;
        assert.match(args[0] as string, /ace_search/i);
    });

    test('does not show nudge when command exits non-zero', () => {
        configureLevel('smart');
        const ctx = makeContext();

        activateTerminalWatcher(ctx);
        assert.ok(capturedHandler);

        capturedHandler!(makeEvent('npm test', 1));

        assert.strictEqual(infoMessageStub.callCount, 0);
    });

    test('does not show nudge when automation level is manual', () => {
        configureLevel('manual');
        const ctx = makeContext();

        activateTerminalWatcher(ctx);
        assert.ok(capturedHandler);

        capturedHandler!(makeEvent('npm test', 0));

        assert.strictEqual(infoMessageStub.callCount, 0);
    });
});
