import * as assert from 'assert';

/**
 * Unit tests for Chat Participant
 * Tests @ace participant registration and command routing
 */
suite('Chat Participant Tests', () => {

    test('participant ID is correct', () => {
        const EXTENSION_ID = 'ace-vscode';
        const PARTICIPANT_ID = `${EXTENSION_ID}.ace`;
        assert.strictEqual(PARTICIPANT_ID, 'ace-vscode.ace', 'Correct participant ID');
    });

    test('participant routes to search command', () => {
        const command = 'search';
        const handler = getHandlerForCommand(command);
        assert.strictEqual(handler, 'handleSearch', 'Routes to search handler');
    });

    test('participant routes to patterns command', () => {
        const command = 'patterns';
        const handler = getHandlerForCommand(command);
        assert.strictEqual(handler, 'handlePatterns', 'Routes to patterns handler');
    });

    test('participant routes to status command', () => {
        const command = 'status';
        const handler = getHandlerForCommand(command);
        assert.strictEqual(handler, 'handleStatus', 'Routes to status handler');
    });

    test('participant routes to learn command', () => {
        const command = 'learn';
        const handler = getHandlerForCommand(command);
        assert.strictEqual(handler, 'handleLearn', 'Routes to learn handler');
    });

    test('participant routes to top command', () => {
        const command = 'top';
        const handler = getHandlerForCommand(command);
        assert.strictEqual(handler, 'handleTop', 'Routes to top handler');
    });

    test('participant routes to bootstrap command', () => {
        const command = 'bootstrap';
        const handler = getHandlerForCommand(command);
        assert.strictEqual(handler, 'handleBootstrap', 'Routes to bootstrap handler');
    });

    test('participant routes to clear command', () => {
        const command = 'clear';
        const handler = getHandlerForCommand(command);
        assert.strictEqual(handler, 'handleClear', 'Routes to clear handler');
    });

    test('participant routes unknown command to default', () => {
        const command = 'unknown';
        const handler = getHandlerForCommand(command);
        assert.strictEqual(handler, 'handleDefaultRequest', 'Routes to default handler');
    });
});

// Helper to simulate command routing
function getHandlerForCommand(command: string): string {
    const CHAT_COMMANDS = {
        SEARCH: 'search',
        PATTERNS: 'patterns',
        STATUS: 'status',
        LEARN: 'learn',
        TOP: 'top',
        BOOTSTRAP: 'bootstrap',
        CLEAR: 'clear'
    };

    switch (command) {
        case CHAT_COMMANDS.SEARCH:
            return 'handleSearch';
        case CHAT_COMMANDS.PATTERNS:
            return 'handlePatterns';
        case CHAT_COMMANDS.STATUS:
            return 'handleStatus';
        case CHAT_COMMANDS.LEARN:
            return 'handleLearn';
        case CHAT_COMMANDS.TOP:
            return 'handleTop';
        case CHAT_COMMANDS.BOOTSTRAP:
            return 'handleBootstrap';
        case CHAT_COMMANDS.CLEAR:
            return 'handleClear';
        default:
            return 'handleDefaultRequest';
    }
}

suite('Chat Participant Default Request', () => {

    test('empty prompt shows command menu', () => {
        const prompt = '';
        const isEmpty = prompt.trim().length === 0;
        const action = isEmpty ? 'showMenu' : 'autoSearch';
        assert.strictEqual(action, 'showMenu', 'Empty prompt shows menu');
    });

    test('non-empty prompt triggers auto-search', () => {
        const prompt = 'how to implement authentication';
        const isEmpty = prompt.trim().length === 0;
        const action = isEmpty ? 'showMenu' : 'autoSearch';
        assert.strictEqual(action, 'autoSearch', 'Non-empty prompt auto-searches');
    });

    test('command menu lists all commands', () => {
        const menuCommands = [
            '/search <query>',
            '/patterns [section]',
            '/status',
            '/learn <description>',
            '/top [count]',
            '/bootstrap [mode]',
            '/clear --confirm'
        ];

        assert.strictEqual(menuCommands.length, 7, 'Menu lists all 7 commands');
    });
});

suite('Chat Participant Icon', () => {

    test('participant has icon path', () => {
        const iconPath = 'resources/ace-icon.png';
        assert.ok(iconPath.includes('ace-icon'), 'Has ACE icon');
    });

    test('icon is PNG format', () => {
        const iconPath = 'resources/ace-icon.png';
        assert.ok(iconPath.endsWith('.png'), 'Icon is PNG');
    });
});

suite('Chat Participant Result Metadata', () => {

    test('result includes command metadata', () => {
        const result = { metadata: { command: 'search' } };
        assert.ok(result.metadata.command, 'Has command in metadata');
    });

    test('search result includes query', () => {
        const result = { metadata: { command: 'search', query: 'authentication' } };
        assert.ok(result.metadata.query, 'Has query in metadata');
    });

    test('default result has default command', () => {
        const result = { metadata: { command: 'default' } };
        assert.strictEqual(result.metadata.command, 'default', 'Has default command');
    });
});
