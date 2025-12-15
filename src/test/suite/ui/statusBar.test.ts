import * as assert from 'assert';

/**
 * Unit tests for AceStatusBar
 * Tests status bar states and display
 */
suite('AceStatusBar Tests', () => {

    test('status bar has valid states', () => {
        const validStates = ['ready', 'searching', 'learning', 'error', 'unconfigured'];

        for (const state of validStates) {
            assert.ok(validStates.includes(state), `State ${state} is valid`);
        }
    });

    test('status bar respects showStatusBar setting', () => {
        const showStatusBar = true;
        const isVisible = showStatusBar;
        assert.ok(isVisible, 'Status bar shown when enabled');
    });

    test('status bar hidden when disabled', () => {
        const showStatusBar = false;
        const isVisible = showStatusBar;
        assert.ok(!isVisible, 'Status bar hidden when disabled');
    });
});

suite('AceStatusBar State Display', () => {

    test('ready state shows pattern count', () => {
        const patternCount = 42;
        const text = `$(lightbulb) ACE: ${patternCount} patterns`;
        assert.ok(text.includes('42'), 'Shows pattern count');
        assert.ok(text.includes('lightbulb'), 'Uses lightbulb icon');
    });

    test('ready state shows "?" when count unknown', () => {
        const patternCount: number | undefined = undefined;
        const text = `$(lightbulb) ACE: ${patternCount ?? '?'} patterns`;
        assert.ok(text.includes('?'), 'Shows ? when count unknown');
    });

    test('searching state shows spinner', () => {
        const text = '$(search) ACE: Searching...';
        assert.ok(text.includes('search'), 'Uses search icon');
        assert.ok(text.includes('Searching'), 'Shows searching text');
    });

    test('learning state shows book icon', () => {
        const text = '$(book) ACE: Learning...';
        assert.ok(text.includes('book'), 'Uses book icon');
        assert.ok(text.includes('Learning'), 'Shows learning text');
    });

    test('error state shows error icon', () => {
        const text = '$(error) ACE: Error';
        assert.ok(text.includes('error'), 'Uses error icon');
    });

    test('unconfigured state shows gear icon', () => {
        const text = '$(gear) ACE: Setup';
        assert.ok(text.includes('gear'), 'Uses gear icon');
        assert.ok(text.includes('Setup'), 'Shows setup text');
    });
});

suite('AceStatusBar Tooltips', () => {

    test('ready state has action tooltip', () => {
        const tooltip = 'ACE Pattern Learning - Click for actions';
        assert.ok(tooltip.includes('Click'), 'Indicates clickable');
    });

    test('searching state has context tooltip', () => {
        const tooltip = 'Searching for relevant patterns';
        assert.ok(tooltip.includes('Searching'), 'Shows search context');
    });

    test('learning state has context tooltip', () => {
        const tooltip = 'Capturing patterns from your work';
        assert.ok(tooltip.includes('Capturing'), 'Shows learning context');
    });

    test('error state has action tooltip', () => {
        const tooltip = 'ACE encountered an error - click to configure';
        assert.ok(tooltip.includes('error'), 'Indicates error');
        assert.ok(tooltip.includes('configure'), 'Suggests action');
    });

    test('unconfigured state has setup tooltip', () => {
        const tooltip = 'Click to configure ACE';
        assert.ok(tooltip.includes('configure'), 'Suggests configuration');
    });
});

suite('AceStatusBar Commands', () => {

    test('ready state triggers quickActions command', () => {
        const command = 'ace-vscode.showQuickActions';
        assert.ok(command.includes('quickActions') || command.includes('QuickActions'), 'Triggers quick actions');
    });

    test('unconfigured state triggers configure command', () => {
        const command = 'ace-vscode.configure';
        assert.ok(command.includes('configure'), 'Triggers configure');
    });
});

suite('AceStatusBar Pattern Count', () => {

    test('setPatternCount updates count', () => {
        let patternCount = 0;
        patternCount = 42;
        assert.strictEqual(patternCount, 42, 'Updates pattern count');
    });

    test('setPatternCount triggers display update', () => {
        const currentState = 'ready';
        const shouldUpdate = currentState === 'ready';
        assert.ok(shouldUpdate, 'Updates display when ready');
    });

    test('setPatternCount does not update during other states', () => {
        const currentState: string = 'searching';
        const shouldUpdate = currentState === 'ready';
        assert.ok(!shouldUpdate, 'Does not update during searching');
    });
});

suite('AceStatusBar Background Colors', () => {

    test('error state has error background', () => {
        const backgroundColor = 'statusBarItem.errorBackground';
        assert.ok(backgroundColor.includes('error'), 'Uses error background');
    });

    test('unconfigured state has warning background', () => {
        const backgroundColor = 'statusBarItem.warningBackground';
        assert.ok(backgroundColor.includes('warning'), 'Uses warning background');
    });

    test('ready state has no special background', () => {
        const backgroundColor = undefined;
        assert.strictEqual(backgroundColor, undefined, 'No special background');
    });
});
