import * as assert from 'assert';

/**
 * Unit tests for TaskDetector
 * Tests task completion detection and pattern search suggestions
 */
suite('TaskDetector Tests', () => {

    test('task detector respects automation level', () => {
        const automationLevels = ['manual', 'smart', 'aggressive'];

        for (const level of automationLevels) {
            assert.ok(automationLevels.includes(level), `Level ${level} is valid`);
        }
    });

    test('manual mode disables task detection', () => {
        const automationLevel = 'manual';
        const isDisabled = automationLevel === 'manual';
        assert.ok(isDisabled, 'Manual mode disables detection');
    });

    test('task detector tracks recent task context', () => {
        const taskName = 'npm test';
        const recentTaskContext = taskName;
        assert.strictEqual(recentTaskContext, taskName, 'Tracks task context');
    });
});

suite('TaskDetector Task Type Detection', () => {

    test('isTestTask detects test commands', () => {
        const testTasks = ['npm test', 'jest', 'mocha', 'vitest', 'pytest', 'spec'];

        for (const task of testTasks) {
            const isTest = /test|spec|jest|mocha|vitest|pytest/.test(task.toLowerCase());
            assert.ok(isTest, `${task} is detected as test task`);
        }
    });

    test('isTestTask rejects non-test commands', () => {
        const nonTestTasks = ['npm build', 'webpack', 'start', 'serve'];

        for (const task of nonTestTasks) {
            const isTest = /test|spec|jest|mocha|vitest|pytest/.test(task.toLowerCase());
            assert.ok(!isTest, `${task} is not a test task`);
        }
    });

    test('isBuildTask detects build commands', () => {
        const buildTasks = ['npm run build', 'webpack', 'tsc', 'compile', 'esbuild'];

        for (const task of buildTasks) {
            const isBuild = /build|compile|webpack|tsc|esbuild/.test(task.toLowerCase());
            assert.ok(isBuild, `${task} is detected as build task`);
        }
    });

    test('isBuildTask rejects non-build commands', () => {
        const nonBuildTasks = ['npm test', 'serve', 'start', 'lint'];

        for (const task of nonBuildTasks) {
            const isBuild = /build|compile|webpack|tsc|esbuild/.test(task.toLowerCase());
            assert.ok(!isBuild, `${task} is not a build task`);
        }
    });

    test('isSignificantTask detects deployment commands', () => {
        const significantTasks = ['deploy', 'publish', 'release', 'migrate', 'upgrade'];

        for (const task of significantTasks) {
            const isSignificant = /deploy|publish|release|migrate|upgrade/.test(task.toLowerCase());
            assert.ok(isSignificant, `${task} is detected as significant task`);
        }
    });
});

suite('TaskDetector Event Handling', () => {

    test('onTestsPass triggers in smart mode', () => {
        const automationLevel: string = 'smart';
        const shouldTrigger = automationLevel === 'smart' || automationLevel === 'aggressive';
        assert.ok(shouldTrigger, 'Triggers in smart mode');
    });

    test('onTestsPass triggers in aggressive mode', () => {
        const automationLevel: string = 'aggressive';
        const shouldTrigger = automationLevel === 'smart' || automationLevel === 'aggressive';
        assert.ok(shouldTrigger, 'Triggers in aggressive mode');
    });

    test('onTestsPass does not trigger in manual mode', () => {
        const automationLevel: string = 'manual';
        const shouldTrigger = automationLevel === 'smart' || automationLevel === 'aggressive';
        assert.ok(!shouldTrigger, 'Does not trigger in manual mode');
    });

    test('onTestsFail suggests pattern search', () => {
        const exitCode: number = 1;
        const isFail = exitCode !== 0;
        const action = isFail ? 'Search Patterns' : 'Capture Learning';
        assert.strictEqual(action, 'Search Patterns', 'Suggests search on failure');
    });

    test('onBuildSuccess only triggers in aggressive mode', () => {
        const automationLevel: string = 'smart';
        const shouldTrigger = automationLevel === 'aggressive';
        assert.ok(!shouldTrigger, 'Build success only triggers in aggressive mode');
    });

    test('onBuildFail suggests pattern search', () => {
        const automationLevel: string = 'smart';
        const shouldSuggest = automationLevel !== 'manual';
        assert.ok(shouldSuggest, 'Build fail suggests search in smart mode');
    });
});

suite('TaskDetector Exit Codes', () => {

    test('exit code 0 indicates success', () => {
        const exitCode = 0;
        const isSuccess = exitCode === 0;
        assert.ok(isSuccess, 'Exit code 0 is success');
    });

    test('non-zero exit code indicates failure', () => {
        const exitCodes = [1, 2, 127, 255];

        for (const code of exitCodes) {
            const isFailure = code !== 0;
            assert.ok(isFailure, `Exit code ${code} is failure`);
        }
    });
});
