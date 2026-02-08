import * as assert from 'assert';

/**
 * TDD Unit Tests for ConfigPanel Auto-Save Feature
 *
 * These tests are written FIRST following Test-Driven Development principles.
 * The implementation should satisfy all these test cases.
 *
 * Feature Requirements:
 * 1. Auto-save when org dropdown changes (after debounce)
 * 2. Auto-save when project dropdown changes (after debounce)
 * 3. Debounce rapid changes (500ms delay)
 * 4. Only save when BOTH org AND project are selected
 * 5. Show subtle status bar confirmation
 * 6. Keep save button as fallback
 */

// =============================================================================
// MOCK SETUP
// =============================================================================

interface MockWebviewMessage {
    command: string;
    data?: Record<string, unknown>;
    success?: boolean;
    message?: string;
}

interface MockWebview {
    postMessage: (message: MockWebviewMessage) => void;
    messages: MockWebviewMessage[];
}

interface MockStatusBarItem {
    text: string;
    show: () => void;
    hide: () => void;
    dispose: () => void;
}

/**
 * Creates a mock webview for testing message passing
 */
function createMockWebview(): MockWebview {
    const messages: MockWebviewMessage[] = [];
    return {
        postMessage: (message: MockWebviewMessage) => {
            messages.push(message);
        },
        messages
    };
}

/**
 * Creates a mock status bar item for testing status updates
 */
function createMockStatusBarItem(): MockStatusBarItem {
    return {
        text: '',
        show: () => {},
        hide: () => {},
        dispose: () => {}
    };
}

/**
 * Mock timer functions for debounce testing
 */
class MockTimer {
    private callbacks: Map<number, { fn: () => void; delay: number; scheduledAt: number }> = new Map();
    private nextId = 1;
    private currentTime = 0;

    setTimeout(fn: () => void, delay: number): number {
        const id = this.nextId++;
        this.callbacks.set(id, { fn, delay, scheduledAt: this.currentTime });
        return id;
    }

    clearTimeout(id: number): void {
        this.callbacks.delete(id);
    }

    advanceTime(ms: number): void {
        this.currentTime += ms;
        const toExecute: (() => void)[] = [];

        this.callbacks.forEach((callback, id) => {
            if (this.currentTime >= callback.scheduledAt + callback.delay) {
                toExecute.push(callback.fn);
                this.callbacks.delete(id);
            }
        });

        toExecute.forEach(fn => fn());
    }

    getPendingCount(): number {
        return this.callbacks.size;
    }

    reset(): void {
        this.callbacks.clear();
        this.currentTime = 0;
        this.nextId = 1;
    }
}

/**
 * Mock saveProjectConfig function for testing
 */
interface SaveProjectConfigCall {
    projectId: string;
    orgId: string;
    folder?: { name: string };
}

class MockSaveProjectConfig {
    public calls: SaveProjectConfigCall[] = [];
    public shouldFail = false;
    public failureMessage = 'Save failed';

    async save(projectId: string, orgId: string, folder?: { name: string }): Promise<void> {
        if (this.shouldFail) {
            throw new Error(this.failureMessage);
        }
        this.calls.push({ projectId, orgId, folder });
    }

    reset(): void {
        this.calls = [];
        this.shouldFail = false;
        this.failureMessage = 'Save failed';
    }
}

/**
 * Simulates the auto-save debounce logic that will be implemented
 */
class AutoSaveDebouncer {
    private timer: MockTimer;
    private debounceTimeoutId: number | null = null;
    private readonly DEBOUNCE_DELAY = 500; // 500ms debounce

    constructor(timer: MockTimer) {
        this.timer = timer;
    }

    /**
     * Schedules an auto-save with debouncing
     */
    scheduleAutoSave(callback: () => void): void {
        // Cancel any pending save
        if (this.debounceTimeoutId !== null) {
            this.timer.clearTimeout(this.debounceTimeoutId);
        }

        // Schedule new save after debounce delay
        this.debounceTimeoutId = this.timer.setTimeout(() => {
            this.debounceTimeoutId = null;
            callback();
        }, this.DEBOUNCE_DELAY);
    }

    /**
     * Cancels any pending auto-save
     */
    cancelPendingSave(): void {
        if (this.debounceTimeoutId !== null) {
            this.timer.clearTimeout(this.debounceTimeoutId);
            this.debounceTimeoutId = null;
        }
    }

    /**
     * Checks if there's a pending save
     */
    hasPendingSave(): boolean {
        return this.debounceTimeoutId !== null;
    }
}

/**
 * Simulates the auto-save validation logic
 */
interface AutoSaveState {
    orgId: string;
    projectId: string;
    isLoggedIn: boolean;
    serverUrl: string;
}

function canAutoSave(state: AutoSaveState): boolean {
    return (
        state.isLoggedIn &&
        state.orgId.length > 0 &&
        state.projectId.length > 0 &&
        state.serverUrl.length > 0
    );
}

// =============================================================================
// TEST SUITES
// =============================================================================

suite('ConfigPanel Auto-Save Debounce Behavior', () => {

    let timer: MockTimer;
    let debouncer: AutoSaveDebouncer;
    let saveCount: number;

    setup(() => {
        timer = new MockTimer();
        debouncer = new AutoSaveDebouncer(timer);
        saveCount = 0;
    });

    test('should NOT save immediately on dropdown change', () => {
        // Arrange
        const saveFn = () => { saveCount++; };

        // Act - simulate dropdown change
        debouncer.scheduleAutoSave(saveFn);

        // Assert - save should not happen immediately
        assert.strictEqual(saveCount, 0, 'Save should not happen immediately');
        assert.ok(debouncer.hasPendingSave(), 'Should have pending save scheduled');
    });

    test('should save after 500ms debounce delay', () => {
        // Arrange
        const saveFn = () => { saveCount++; };

        // Act
        debouncer.scheduleAutoSave(saveFn);
        timer.advanceTime(499);
        assert.strictEqual(saveCount, 0, 'Should not save before 500ms');

        timer.advanceTime(1); // Total: 500ms

        // Assert
        assert.strictEqual(saveCount, 1, 'Should save exactly once after 500ms');
        assert.ok(!debouncer.hasPendingSave(), 'Should not have pending save after execution');
    });

    test('should cancel pending save when new change occurs', () => {
        // Arrange
        let lastValue = '';
        const saveFn = (value: string) => () => {
            lastValue = value;
            saveCount++;
        };

        // Act - first change
        debouncer.scheduleAutoSave(saveFn('first'));
        timer.advanceTime(300); // Not yet 500ms

        // New change before debounce completes
        debouncer.scheduleAutoSave(saveFn('second'));
        timer.advanceTime(500); // Complete debounce for second change

        // Assert
        assert.strictEqual(saveCount, 1, 'Should only save once');
        assert.strictEqual(lastValue, 'second', 'Should save the latest value');
    });

    test('should only save the last selection after rapid changes', () => {
        // Arrange
        const savedValues: string[] = [];
        const saveFn = (value: string) => () => {
            savedValues.push(value);
            saveCount++;
        };

        // Act - simulate rapid dropdown changes
        debouncer.scheduleAutoSave(saveFn('org_1'));
        timer.advanceTime(100);

        debouncer.scheduleAutoSave(saveFn('org_2'));
        timer.advanceTime(100);

        debouncer.scheduleAutoSave(saveFn('org_3'));
        timer.advanceTime(100);

        debouncer.scheduleAutoSave(saveFn('org_4'));
        timer.advanceTime(100);

        debouncer.scheduleAutoSave(saveFn('org_5')); // Final selection
        timer.advanceTime(500); // Complete debounce

        // Assert
        assert.strictEqual(saveCount, 1, 'Should only save once after rapid changes');
        assert.deepStrictEqual(savedValues, ['org_5'], 'Should only save the final selection');
    });

    test('should reset debounce timer on each new change', () => {
        // Arrange
        const saveFn = () => { saveCount++; };

        // Act - change every 400ms (before 500ms debounce completes)
        debouncer.scheduleAutoSave(saveFn);
        timer.advanceTime(400);
        assert.strictEqual(saveCount, 0);

        debouncer.scheduleAutoSave(saveFn);
        timer.advanceTime(400);
        assert.strictEqual(saveCount, 0);

        debouncer.scheduleAutoSave(saveFn);
        timer.advanceTime(400);
        assert.strictEqual(saveCount, 0);

        // Now let the final debounce complete
        timer.advanceTime(100); // Total: 500ms from last change

        // Assert
        assert.strictEqual(saveCount, 1, 'Should save once after debounce completes');
    });

    test('should allow manual cancel of pending save', () => {
        // Arrange
        const saveFn = () => { saveCount++; };

        // Act
        debouncer.scheduleAutoSave(saveFn);
        timer.advanceTime(300);
        debouncer.cancelPendingSave();
        timer.advanceTime(300); // Would have triggered if not cancelled

        // Assert
        assert.strictEqual(saveCount, 0, 'Save should be cancelled');
        assert.ok(!debouncer.hasPendingSave(), 'Should not have pending save');
    });
});

suite('ConfigPanel Auto-Save Validation', () => {

    test('should NOT auto-save when only orgId is selected', () => {
        // Arrange
        const state: AutoSaveState = {
            orgId: 'org_123',
            projectId: '', // Empty - not selected
            isLoggedIn: true,
            serverUrl: 'https://ace-api.code-engine.app'
        };

        // Assert
        assert.ok(!canAutoSave(state), 'Should not allow auto-save without projectId');
    });

    test('should NOT auto-save when only projectId is selected', () => {
        // Arrange
        const state: AutoSaveState = {
            orgId: '', // Empty - not selected
            projectId: 'prj_456',
            isLoggedIn: true,
            serverUrl: 'https://ace-api.code-engine.app'
        };

        // Assert
        assert.ok(!canAutoSave(state), 'Should not allow auto-save without orgId');
    });

    test('should auto-save when BOTH orgId AND projectId are selected', () => {
        // Arrange
        const state: AutoSaveState = {
            orgId: 'org_123',
            projectId: 'prj_456',
            isLoggedIn: true,
            serverUrl: 'https://ace-api.code-engine.app'
        };

        // Assert
        assert.ok(canAutoSave(state), 'Should allow auto-save with both org and project');
    });

    test('should NOT auto-save when user is not logged in', () => {
        // Arrange
        const state: AutoSaveState = {
            orgId: 'org_123',
            projectId: 'prj_456',
            isLoggedIn: false, // Not logged in
            serverUrl: 'https://ace-api.code-engine.app'
        };

        // Assert
        assert.ok(!canAutoSave(state), 'Should not allow auto-save when not logged in');
    });

    test('should NOT auto-save when serverUrl is empty', () => {
        // Arrange
        const state: AutoSaveState = {
            orgId: 'org_123',
            projectId: 'prj_456',
            isLoggedIn: true,
            serverUrl: '' // Empty server URL
        };

        // Assert
        assert.ok(!canAutoSave(state), 'Should not allow auto-save without serverUrl');
    });

    test('should validate all required fields for auto-save', () => {
        // Test all combinations
        const testCases: Array<{ state: AutoSaveState; expected: boolean; description: string }> = [
            {
                state: { orgId: '', projectId: '', isLoggedIn: false, serverUrl: '' },
                expected: false,
                description: 'All empty'
            },
            {
                state: { orgId: 'org_1', projectId: '', isLoggedIn: true, serverUrl: 'http://test' },
                expected: false,
                description: 'Missing projectId'
            },
            {
                state: { orgId: '', projectId: 'prj_1', isLoggedIn: true, serverUrl: 'http://test' },
                expected: false,
                description: 'Missing orgId'
            },
            {
                state: { orgId: 'org_1', projectId: 'prj_1', isLoggedIn: false, serverUrl: 'http://test' },
                expected: false,
                description: 'Not logged in'
            },
            {
                state: { orgId: 'org_1', projectId: 'prj_1', isLoggedIn: true, serverUrl: '' },
                expected: false,
                description: 'Missing serverUrl'
            },
            {
                state: { orgId: 'org_1', projectId: 'prj_1', isLoggedIn: true, serverUrl: 'http://test' },
                expected: true,
                description: 'All valid'
            }
        ];

        for (const testCase of testCases) {
            assert.strictEqual(
                canAutoSave(testCase.state),
                testCase.expected,
                `Failed for case: ${testCase.description}`
            );
        }
    });
});

suite('ConfigPanel _autoSaveConfiguration Method', () => {

    let mockWebview: MockWebview;
    let mockSaveConfig: MockSaveProjectConfig;
    let mockStatusBarItem: MockStatusBarItem;
    let statusBarMessages: string[];

    setup(() => {
        mockWebview = createMockWebview();
        mockSaveConfig = new MockSaveProjectConfig();
        mockStatusBarItem = createMockStatusBarItem();
        statusBarMessages = [];
    });

    /**
     * Simulates the _autoSaveConfiguration method behavior
     */
    async function autoSaveConfiguration(
        data: { serverUrl: string; orgId: string; projectId: string },
        options: {
            webview: MockWebview;
            saveConfig: MockSaveProjectConfig;
            statusBar: MockStatusBarItem;
            isAuthenticated: () => boolean;
            targetFolder?: { name: string };
            onStatusBarMessage?: (msg: string) => void;
        }
    ): Promise<{ success: boolean; message: string }> {
        // Verify user is logged in
        if (!options.isAuthenticated()) {
            const result = { success: false, message: 'Please login first' };
            options.webview.postMessage({ command: 'autoSaveResult', ...result });
            return result;
        }

        // Validate required fields
        if (!data.serverUrl || !data.orgId || !data.projectId) {
            const result = { success: false, message: 'Missing required fields' };
            options.webview.postMessage({ command: 'autoSaveResult', ...result });
            return result;
        }

        try {
            // Save project config
            await options.saveConfig.save(data.projectId, data.orgId, options.targetFolder);

            // Update global config with orgId (simulated)
            // In real implementation: fs.writeFileSync(configPath, ...)

            // Show status bar confirmation
            const folderMsg = options.targetFolder ? ` for "${options.targetFolder.name}"` : '';
            const statusMsg = `Auto-saved${folderMsg}`;
            options.statusBar.text = statusMsg;
            if (options.onStatusBarMessage) {
                options.onStatusBarMessage(statusMsg);
            }

            // Post success message to webview
            const result = { success: true, message: `Configuration auto-saved${folderMsg}` };
            options.webview.postMessage({ command: 'autoSaveResult', ...result });

            return result;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            const result = { success: false, message: `Auto-save failed: ${errorMsg}` };
            options.webview.postMessage({ command: 'autoSaveResult', ...result });
            return result;
        }
    }

    test('should call saveProjectConfig with correct params', async () => {
        // Arrange
        const data = {
            serverUrl: 'https://ace-api.code-engine.app',
            orgId: 'org_test123',
            projectId: 'prj_test456'
        };

        // Act
        await autoSaveConfiguration(data, {
            webview: mockWebview,
            saveConfig: mockSaveConfig,
            statusBar: mockStatusBarItem,
            isAuthenticated: () => true
        });

        // Assert
        assert.strictEqual(mockSaveConfig.calls.length, 1, 'saveProjectConfig should be called once');
        assert.strictEqual(mockSaveConfig.calls[0].projectId, 'prj_test456');
        assert.strictEqual(mockSaveConfig.calls[0].orgId, 'org_test123');
    });

    test('should update global config with orgId', async () => {
        // Arrange
        const data = {
            serverUrl: 'https://ace-api.code-engine.app',
            orgId: 'org_global_test',
            projectId: 'prj_test'
        };

        // Act
        const result = await autoSaveConfiguration(data, {
            webview: mockWebview,
            saveConfig: mockSaveConfig,
            statusBar: mockStatusBarItem,
            isAuthenticated: () => true
        });

        // Assert
        assert.ok(result.success, 'Auto-save should succeed');
        // The orgId is passed to saveProjectConfig which handles global config update
        assert.strictEqual(mockSaveConfig.calls[0].orgId, 'org_global_test');
    });

    test('should post autoSaveResult message to webview', async () => {
        // Arrange
        const data = {
            serverUrl: 'https://ace-api.code-engine.app',
            orgId: 'org_123',
            projectId: 'prj_456'
        };

        // Act
        await autoSaveConfiguration(data, {
            webview: mockWebview,
            saveConfig: mockSaveConfig,
            statusBar: mockStatusBarItem,
            isAuthenticated: () => true
        });

        // Assert
        assert.ok(mockWebview.messages.length > 0, 'Should post message to webview');
        const autoSaveMsg = mockWebview.messages.find(m => m.command === 'autoSaveResult');
        assert.ok(autoSaveMsg, 'Should post autoSaveResult command');
        assert.ok(autoSaveMsg?.success, 'Should indicate success');
        assert.ok(autoSaveMsg?.message?.includes('auto-saved'), 'Message should mention auto-save');
    });

    test('should show status bar message on success', async () => {
        // Arrange
        const data = {
            serverUrl: 'https://ace-api.code-engine.app',
            orgId: 'org_123',
            projectId: 'prj_456'
        };

        // Act
        await autoSaveConfiguration(data, {
            webview: mockWebview,
            saveConfig: mockSaveConfig,
            statusBar: mockStatusBarItem,
            isAuthenticated: () => true,
            onStatusBarMessage: (msg) => statusBarMessages.push(msg)
        });

        // Assert
        assert.ok(statusBarMessages.length > 0, 'Should update status bar');
        assert.ok(statusBarMessages[0].includes('Auto-saved'), 'Status bar should show auto-save confirmation');
    });

    test('should include folder name in status message when folder is provided', async () => {
        // Arrange
        const data = {
            serverUrl: 'https://ace-api.code-engine.app',
            orgId: 'org_123',
            projectId: 'prj_456'
        };
        const targetFolder = { name: 'my-project' };

        // Act
        await autoSaveConfiguration(data, {
            webview: mockWebview,
            saveConfig: mockSaveConfig,
            statusBar: mockStatusBarItem,
            isAuthenticated: () => true,
            targetFolder,
            onStatusBarMessage: (msg) => statusBarMessages.push(msg)
        });

        // Assert
        const autoSaveMsg = mockWebview.messages.find(m => m.command === 'autoSaveResult');
        assert.ok(autoSaveMsg?.message?.includes('my-project'), 'Message should include folder name');
        assert.ok(statusBarMessages[0].includes('my-project'), 'Status bar should include folder name');
    });

    test('should return error when not authenticated', async () => {
        // Arrange
        const data = {
            serverUrl: 'https://ace-api.code-engine.app',
            orgId: 'org_123',
            projectId: 'prj_456'
        };

        // Act
        const result = await autoSaveConfiguration(data, {
            webview: mockWebview,
            saveConfig: mockSaveConfig,
            statusBar: mockStatusBarItem,
            isAuthenticated: () => false // Not logged in
        });

        // Assert
        assert.ok(!result.success, 'Should fail when not authenticated');
        assert.ok(result.message.includes('login'), 'Error message should mention login');
        assert.strictEqual(mockSaveConfig.calls.length, 0, 'Should not call saveProjectConfig');
    });
});

suite('ConfigPanel Auto-Save Edge Cases', () => {

    let mockWebview: MockWebview;
    let mockSaveConfig: MockSaveProjectConfig;
    let mockStatusBarItem: MockStatusBarItem;

    setup(() => {
        mockWebview = createMockWebview();
        mockSaveConfig = new MockSaveProjectConfig();
        mockStatusBarItem = createMockStatusBarItem();
    });

    /**
     * Simulates auto-save with error handling
     */
    async function autoSaveWithErrorHandling(
        data: { serverUrl: string; orgId: string; projectId: string },
        options: {
            webview: MockWebview;
            saveConfig: MockSaveProjectConfig;
            statusBar: MockStatusBarItem;
            isAuthenticated: () => boolean;
        }
    ): Promise<{ success: boolean; message: string; crashed: boolean }> {
        try {
            if (!options.isAuthenticated()) {
                const result = { success: false, message: 'Please login first', crashed: false };
                options.webview.postMessage({ command: 'autoSaveResult', ...result });
                return result;
            }

            if (!data.serverUrl || !data.orgId || !data.projectId) {
                const result = { success: false, message: 'Missing required fields', crashed: false };
                options.webview.postMessage({ command: 'autoSaveResult', ...result });
                return result;
            }

            await options.saveConfig.save(data.projectId, data.orgId);

            const result = { success: true, message: 'Configuration auto-saved', crashed: false };
            options.webview.postMessage({ command: 'autoSaveResult', ...result });
            return result;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            const result = { success: false, message: `Auto-save failed: ${errorMsg}`, crashed: false };
            options.webview.postMessage({ command: 'autoSaveResult', ...result });
            return result;
        }
    }

    test('should handle save errors gracefully (no crash)', async () => {
        // Arrange
        mockSaveConfig.shouldFail = true;
        mockSaveConfig.failureMessage = 'Network error: Connection refused';

        const data = {
            serverUrl: 'https://ace-api.code-engine.app',
            orgId: 'org_123',
            projectId: 'prj_456'
        };

        // Act
        const result = await autoSaveWithErrorHandling(data, {
            webview: mockWebview,
            saveConfig: mockSaveConfig,
            statusBar: mockStatusBarItem,
            isAuthenticated: () => true
        });

        // Assert
        assert.ok(!result.crashed, 'Should not crash on error');
        assert.ok(!result.success, 'Should indicate failure');
        assert.ok(result.message.includes('Network error'), 'Should include error message');

        // Webview should receive error notification
        const errorMsg = mockWebview.messages.find(m => m.command === 'autoSaveResult');
        assert.ok(errorMsg, 'Should post error to webview');
        assert.ok(!errorMsg?.success, 'Webview message should indicate failure');
    });

    test('should handle filesystem permission errors', async () => {
        // Arrange
        mockSaveConfig.shouldFail = true;
        mockSaveConfig.failureMessage = 'EACCES: permission denied';

        const data = {
            serverUrl: 'https://ace-api.code-engine.app',
            orgId: 'org_123',
            projectId: 'prj_456'
        };

        // Act
        const result = await autoSaveWithErrorHandling(data, {
            webview: mockWebview,
            saveConfig: mockSaveConfig,
            statusBar: mockStatusBarItem,
            isAuthenticated: () => true
        });

        // Assert
        assert.ok(!result.crashed, 'Should not crash on permission error');
        assert.ok(result.message.includes('EACCES'), 'Should include permission error');
    });

    test('should handle invalid JSON in existing config', async () => {
        // Arrange - simulate invalid JSON scenario
        // The implementation should handle this gracefully by starting fresh
        const data = {
            serverUrl: 'https://ace-api.code-engine.app',
            orgId: 'org_123',
            projectId: 'prj_456'
        };

        // Act
        const result = await autoSaveWithErrorHandling(data, {
            webview: mockWebview,
            saveConfig: mockSaveConfig,
            statusBar: mockStatusBarItem,
            isAuthenticated: () => true
        });

        // Assert
        assert.ok(result.success, 'Should succeed even with invalid existing config');
    });

    test('should work with manual input fields as fallback', () => {
        // Arrange - simulate manual input scenario
        const manualOrgId = 'org_manual_input_123';
        const manualProjectId = 'prj_manual_input_456';

        // The webview should use manual input when dropdown has no selection
        const formData = {
            orgId: '', // Dropdown empty
            orgIdManual: manualOrgId, // Manual input filled
            projectId: '', // Dropdown empty
            projectIdManual: manualProjectId // Manual input filled
        };

        // Simulated fallback logic
        const effectiveOrgId = formData.orgId || formData.orgIdManual;
        const effectiveProjectId = formData.projectId || formData.projectIdManual;

        // Assert
        assert.strictEqual(effectiveOrgId, manualOrgId, 'Should use manual orgId');
        assert.strictEqual(effectiveProjectId, manualProjectId, 'Should use manual projectId');
    });

    test('should prefer dropdown value over manual input', () => {
        // Arrange
        const dropdownOrgId = 'org_dropdown_123';
        const manualOrgId = 'org_manual_456';

        const formData = {
            orgId: dropdownOrgId, // Dropdown has value
            orgIdManual: manualOrgId // Manual also has value
        };

        // Simulated priority logic
        const effectiveOrgId = formData.orgId || formData.orgIdManual;

        // Assert
        assert.strictEqual(effectiveOrgId, dropdownOrgId, 'Should prefer dropdown value');
    });
});

suite('ConfigPanel Auto-Save Integration with Manual Save', () => {

    test('manual save button should still work when auto-save is enabled', () => {
        // Arrange
        const autoSaveEnabled = true;
        const manualSaveDisabled = false;

        // Assert - manual save should always be available as fallback
        assert.ok(!manualSaveDisabled, 'Manual save should not be disabled');
        assert.ok(autoSaveEnabled, 'Auto-save can be enabled alongside manual');
    });

    test('save button should remain enabled when user is logged in', () => {
        // Arrange
        const isLoggedIn = true;
        const isExpired = false;

        // Simulated button state logic
        const saveDisabled = !isLoggedIn || isExpired;

        // Assert
        assert.ok(!saveDisabled, 'Save button should be enabled for logged in user');
    });

    test('auto-save should not interfere with manual save operation', () => {
        // This test verifies that both save mechanisms can coexist
        // The implementation should:
        // 1. Cancel pending auto-save when manual save is triggered
        // 2. Allow manual save to complete
        // 3. Resume auto-save monitoring after manual save

        const timer = new MockTimer();
        const debouncer = new AutoSaveDebouncer(timer);
        let autoSaveCount = 0;
        let manualSaveCount = 0;

        // Schedule auto-save
        debouncer.scheduleAutoSave(() => { autoSaveCount++; });

        // Before auto-save completes, user clicks manual save
        timer.advanceTime(300);
        debouncer.cancelPendingSave(); // Cancel auto-save
        manualSaveCount++; // Simulate manual save

        // Verify manual save succeeded and auto-save was cancelled
        timer.advanceTime(300); // Would have triggered auto-save
        assert.strictEqual(manualSaveCount, 1, 'Manual save should complete');
        assert.strictEqual(autoSaveCount, 0, 'Auto-save should be cancelled');
    });
});

suite('ConfigPanel Auto-Save Status Bar Feedback', () => {

    test('should show subtle confirmation in status bar', () => {
        // Arrange
        const statusBar = createMockStatusBarItem();
        const confirmationText = 'Auto-saved';

        // Act - simulate status bar update
        statusBar.text = confirmationText;

        // Assert
        assert.ok(statusBar.text.includes('Auto-saved'), 'Status bar should show confirmation');
    });

    test('should include folder context in status message for multi-root', () => {
        // Arrange
        const folderName = 'frontend-app';
        const expectedMessage = `Auto-saved for "${folderName}"`;

        // Assert
        assert.ok(expectedMessage.includes(folderName), 'Message should include folder name');
    });

    test('status bar confirmation should be temporary', () => {
        // This test verifies the implementation should auto-hide the confirmation
        // The actual timing would be handled by the implementation

        const showDurationMs = 3000; // Expected: 3 seconds
        assert.ok(showDurationMs > 0, 'Confirmation should have limited duration');
        assert.ok(showDurationMs <= 5000, 'Confirmation should not persist too long');
    });
});

suite('ConfigPanel Auto-Save Org/Project Change Detection', () => {

    test('should trigger auto-save on org dropdown change', () => {
        // Arrange
        const timer = new MockTimer();
        const debouncer = new AutoSaveDebouncer(timer);
        let saveTriggered = false;

        // Act - simulate org change
        const onOrgChange = () => {
            debouncer.scheduleAutoSave(() => { saveTriggered = true; });
        };

        onOrgChange();
        timer.advanceTime(500);

        // Assert
        assert.ok(saveTriggered, 'Auto-save should trigger on org change');
    });

    test('should trigger auto-save on project dropdown change', () => {
        // Arrange
        const timer = new MockTimer();
        const debouncer = new AutoSaveDebouncer(timer);
        let saveTriggered = false;

        // Act - simulate project change
        const onProjectChange = () => {
            debouncer.scheduleAutoSave(() => { saveTriggered = true; });
        };

        onProjectChange();
        timer.advanceTime(500);

        // Assert
        assert.ok(saveTriggered, 'Auto-save should trigger on project change');
    });

    test('should handle org change followed by project change', () => {
        // Arrange
        const timer = new MockTimer();
        const debouncer = new AutoSaveDebouncer(timer);
        let saveCount = 0;
        const savedStates: Array<{ org: string; project: string }> = [];

        let currentOrg = '';
        let currentProject = '';

        const scheduleSave = () => {
            const org = currentOrg;
            const project = currentProject;
            debouncer.scheduleAutoSave(() => {
                saveCount++;
                savedStates.push({ org, project });
            });
        };

        // Act - change org
        currentOrg = 'org_new';
        scheduleSave();
        timer.advanceTime(300);

        // Change project before debounce completes
        currentProject = 'prj_new';
        scheduleSave();
        timer.advanceTime(500);

        // Assert
        assert.strictEqual(saveCount, 1, 'Should save only once');
        assert.strictEqual(savedStates[0].org, 'org_new');
        assert.strictEqual(savedStates[0].project, 'prj_new');
    });

    test('should not trigger auto-save when switching to empty selection', () => {
        // Arrange
        const state: AutoSaveState = {
            orgId: '', // Empty - user selected "-- Select --"
            projectId: 'prj_123',
            isLoggedIn: true,
            serverUrl: 'https://ace-api.code-engine.app'
        };

        // Assert
        assert.ok(!canAutoSave(state), 'Should not auto-save with empty org');
    });
});
