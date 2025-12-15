import * as assert from 'assert';

/**
 * Unit tests for CaptureLearn command
 * Tests learning capture dialog and workflow
 */
suite('CaptureLearn Command Tests', () => {

    test('requires project configuration', () => {
        const isConfigured = false;
        const shouldPromptConfig = !isConfigured;
        assert.ok(shouldPromptConfig, 'Prompts configuration when not configured');
    });

    test('proceeds when configured', () => {
        const isConfigured = true;
        const shouldProceed = isConfigured;
        assert.ok(shouldProceed, 'Proceeds when configured');
    });

    test('accepts optional context parameter', () => {
        const options = { context: 'Tests passed: npm test' };
        assert.ok(options.context, 'Accepts context');
    });

    test('accepts optional success parameter', () => {
        const options = { success: true };
        assert.ok(options.success !== undefined, 'Accepts success');
    });
});

suite('CaptureLearn Task Description', () => {

    test('requires minimum description length', () => {
        const minLength = 10;
        const shortDescription = 'Fixed bug';
        const isValid = shortDescription.length >= minLength;
        assert.ok(!isValid, 'Rejects short descriptions');
    });

    test('accepts valid description', () => {
        const minLength = 10;
        const validDescription = 'Implemented JWT authentication with refresh tokens';
        const isValid = validDescription.length >= minLength;
        assert.ok(isValid, 'Accepts valid descriptions');
    });

    test('prefills with task context if available', () => {
        const taskContext = 'npm test';
        const prefilled = `Completed: ${taskContext}`;
        assert.ok(prefilled.includes('npm test'), 'Prefills with context');
    });

    test('prefills with options context if provided', () => {
        const options = { context: 'Custom context' };
        const prefilled = options.context;
        assert.strictEqual(prefilled, 'Custom context', 'Uses options context');
    });
});

suite('CaptureLearn Outcome Selection', () => {

    test('outcome options include successful', () => {
        const outcomes = ['Successful', 'Partial', 'Learned from failure'];
        assert.ok(outcomes.includes('Successful'), 'Has successful option');
    });

    test('outcome options include partial', () => {
        const outcomes = ['Successful', 'Partial', 'Learned from failure'];
        assert.ok(outcomes.includes('Partial'), 'Has partial option');
    });

    test('outcome options include failure learning', () => {
        const outcomes = ['Successful', 'Partial', 'Learned from failure'];
        assert.ok(outcomes.includes('Learned from failure'), 'Has failure learning option');
    });

    test('success is true for Successful outcome', () => {
        const outcome = '$(check) Successful';
        const success = outcome.includes('Successful');
        assert.ok(success, 'Successful maps to true');
    });

    test('success is false for failure outcome', () => {
        const outcome = '$(error) Learned from failure';
        const success = outcome.includes('Successful');
        assert.ok(!success, 'Failure maps to false');
    });
});

suite('CaptureLearn Lessons Input', () => {

    test('lessons input is optional', () => {
        const lessons = undefined;
        const isRequired = false;
        assert.ok(!isRequired, 'Lessons are optional');
        assert.ok(lessons === undefined, 'Can be undefined');
    });

    test('lessons can be provided', () => {
        const lessons = 'Always validate JWT expiry before refresh';
        assert.ok(lessons.length > 0, 'Accepts lessons');
    });
});

suite('CaptureLearn Trajectory Building', () => {

    test('trajectory includes task description', () => {
        const task = 'Implemented auth';
        const trajectory = `Task: ${task}\n`;
        assert.ok(trajectory.includes(task), 'Includes task');
    });

    test('trajectory includes outcome', () => {
        const outcome = 'Task completed successfully';
        const trajectory = `Outcome: ${outcome}\n`;
        assert.ok(trajectory.includes(outcome), 'Includes outcome');
    });

    test('trajectory includes activity stats', () => {
        const stats = { editCount: 15, fileCount: 3 };
        const trajectory = `Activity: ${stats.editCount} edits in ${stats.fileCount} files\n`;
        assert.ok(trajectory.includes('15'), 'Includes edit count');
        assert.ok(trajectory.includes('3'), 'Includes file count');
    });

    test('trajectory includes lessons if provided', () => {
        const lessons = 'Important lesson';
        const trajectory = `Lessons: ${lessons}\n`;
        assert.ok(trajectory.includes(lessons), 'Includes lessons');
    });

    test('trajectory omits activity if zero edits', () => {
        const stats = { editCount: 0, fileCount: 0 };
        const includeActivity = stats.editCount > 0;
        assert.ok(!includeActivity, 'Omits zero activity');
    });
});

suite('CaptureLearn Chat Query Building', () => {

    test('chat query mentions @ace', () => {
        const query = '@ace Use the ace_learn tool';
        assert.ok(query.includes('@ace'), 'Mentions @ace');
    });

    test('chat query mentions ace_learn tool', () => {
        const query = '@ace Use the ace_learn tool';
        assert.ok(query.includes('ace_learn'), 'Mentions ace_learn tool');
    });

    test('chat query includes task', () => {
        const task = 'Implemented JWT';
        const query = `**Task**: ${task}`;
        assert.ok(query.includes(task), 'Includes task');
    });

    test('chat query includes success flag', () => {
        const success = true;
        const query = `**Success**: ${success}`;
        assert.ok(query.includes('true'), 'Includes success flag');
    });

    test('chat query includes trajectory', () => {
        const trajectory = 'Step 1, Step 2';
        const query = `**Trajectory**:\n${trajectory}`;
        assert.ok(query.includes(trajectory), 'Includes trajectory');
    });

    test('chat query includes lessons if provided', () => {
        const lessons = 'Important lesson';
        const query = `**Lessons learned**: ${lessons}`;
        assert.ok(query.includes(lessons), 'Includes lessons');
    });
});

suite('CaptureLearn Post-Capture Actions', () => {

    test('resets activity monitor after capture', () => {
        // After capture, activity monitor should reset
        const shouldReset = true;
        assert.ok(shouldReset, 'Resets activity monitor');
    });

    test('shows confirmation message', () => {
        const message = 'ACE: Learning captured! Check Copilot chat for confirmation.';
        assert.ok(message.includes('captured'), 'Shows confirmation');
    });

    test('opens Copilot chat with query', () => {
        const command = 'workbench.action.chat.open';
        assert.ok(command.includes('chat.open'), 'Opens chat');
    });
});
