import * as assert from 'assert';
import {
    COMMANDS,
    DEVICE_MANAGEMENT_URL,
    DEVICE_LIMITS_DOCS_URL,
    TOKEN_CHECK_INTERVAL_MS,
    HARD_CAP_WARNING_HOURS,
} from '../../../constants';
import {
    isDeviceLimitError,
    isValidVerificationUri,
    evaluateTokenExpiration,
} from '../../../utils/loginHelpers';

suite('Login Command Constants', () => {

    test('LOGIN command constant has correct ID', () => {
        assert.strictEqual(COMMANDS.LOGIN, 'ace-vscode.login');
    });

    test('device management URL uses HTTPS', () => {
        assert.ok(DEVICE_MANAGEMENT_URL.startsWith('https://'));
    });

    test('device limits docs URL uses HTTPS', () => {
        assert.ok(DEVICE_LIMITS_DOCS_URL.startsWith('https://'));
    });

    test('check interval is 1 hour in milliseconds', () => {
        assert.strictEqual(TOKEN_CHECK_INTERVAL_MS, 3_600_000);
    });

    test('hard cap warning threshold is 24 hours', () => {
        assert.strictEqual(HARD_CAP_WARNING_HOURS, 24);
    });
});

suite('isDeviceLimitError', () => {

    test('detects Error with "device limit exceeded" message', () => {
        assert.strictEqual(isDeviceLimitError(new Error('device limit exceeded')), true);
    });

    test('detects message case-insensitively', () => {
        assert.strictEqual(isDeviceLimitError(new Error('Device Limit Exceeded for this account')), true);
    });

    test('detects Axios-style response with error_code', () => {
        const error = { response: { data: { error_code: 'device_limit_exceeded' } } };
        assert.strictEqual(isDeviceLimitError(error), true);
    });

    test('detects Axios Error with response property', () => {
        const error = new Error('Request failed with status 429');
        (error as Error & { response: unknown }).response = {
            data: { error_code: 'device_limit_exceeded' },
        };
        assert.strictEqual(isDeviceLimitError(error), true);
    });

    test('returns false for unrelated Error', () => {
        assert.strictEqual(isDeviceLimitError(new Error('network timeout')), false);
    });

    test('returns false for null', () => {
        assert.strictEqual(isDeviceLimitError(null), false);
    });

    test('returns false for string', () => {
        assert.strictEqual(isDeviceLimitError('device limit exceeded'), false);
    });

    test('returns false for object without response', () => {
        assert.strictEqual(isDeviceLimitError({ code: 'LIMIT' }), false);
    });

    test('returns false for non-object response', () => {
        assert.strictEqual(isDeviceLimitError({ response: 'not an object' }), false);
    });

    test('returns false for response without data', () => {
        assert.strictEqual(isDeviceLimitError({ response: {} }), false);
    });

    test('returns false for wrong error_code', () => {
        assert.strictEqual(
            isDeviceLimitError({ response: { data: { error_code: 'rate_limited' } } }),
            false
        );
    });
});

suite('isValidVerificationUri', () => {

    test('accepts valid HTTPS URI', () => {
        assert.strictEqual(isValidVerificationUri('https://auth.example.com/device?code=ABC'), true);
    });

    test('rejects HTTP URI', () => {
        assert.strictEqual(isValidVerificationUri('http://auth.example.com/device'), false);
    });

    test('rejects javascript: URI', () => {
        assert.strictEqual(isValidVerificationUri('javascript:alert(1)'), false);
    });

    test('rejects file: URI', () => {
        assert.strictEqual(isValidVerificationUri('file:///etc/passwd'), false);
    });

    test('rejects empty string', () => {
        assert.strictEqual(isValidVerificationUri(''), false);
    });

    test('rejects malformed URI', () => {
        assert.strictEqual(isValidVerificationUri('not a url'), false);
    });
});

suite('evaluateTokenExpiration', () => {

    const baseInput = {
        now: Date.now(),
        refreshExpiresAt: null as string | null,
        absoluteExpiresAt: null as string | null,
        hasNotifiedExpiration: false,
        hasNotifiedHardCap: false,
    };

    test('returns none when no auth timestamps', () => {
        const result = evaluateTokenExpiration(baseInput);
        assert.strictEqual(result.action, 'none');
    });

    test('returns expired when refresh token is in the past', () => {
        const pastDate = new Date(baseInput.now - 3_600_000).toISOString();
        const result = evaluateTokenExpiration({ ...baseInput, refreshExpiresAt: pastDate });
        assert.strictEqual(result.action, 'expired');
        assert.strictEqual(result.flags.hasNotifiedExpiration, true);
    });

    test('skips notification if already notified about expiration', () => {
        const pastDate = new Date(baseInput.now - 3_600_000).toISOString();
        const result = evaluateTokenExpiration({
            ...baseInput,
            refreshExpiresAt: pastDate,
            hasNotifiedExpiration: true,
        });
        assert.strictEqual(result.action, 'none');
    });

    test('returns warn_hard_cap when absolute cap is within threshold', () => {
        const soonDate = new Date(baseInput.now + 12 * 3_600_000).toISOString(); // 12h
        const result = evaluateTokenExpiration({ ...baseInput, absoluteExpiresAt: soonDate });
        assert.strictEqual(result.action, 'warn_hard_cap');
        assert.ok(result.hoursRemaining! >= 1);
        assert.strictEqual(result.flags.hasNotifiedHardCap, true);
    });

    test('skips hard cap notification if already notified', () => {
        const soonDate = new Date(baseInput.now + 12 * 3_600_000).toISOString();
        const result = evaluateTokenExpiration({
            ...baseInput,
            absoluteExpiresAt: soonDate,
            hasNotifiedHardCap: true,
        });
        assert.strictEqual(result.action, 'none');
    });

    test('resets hard cap flag when outside warning window', () => {
        const farDate = new Date(baseInput.now + 48 * 3_600_000).toISOString(); // 48h
        const result = evaluateTokenExpiration({
            ...baseInput,
            absoluteExpiresAt: farDate,
            hasNotifiedHardCap: true,
        });
        assert.strictEqual(result.action, 'none');
        assert.strictEqual(result.flags.hasNotifiedHardCap, false);
    });

    test('refresh expiry takes priority over hard cap check', () => {
        const pastDate = new Date(baseInput.now - 3_600_000).toISOString();
        const soonDate = new Date(baseInput.now + 12 * 3_600_000).toISOString();
        const result = evaluateTokenExpiration({
            ...baseInput,
            refreshExpiresAt: pastDate,
            absoluteExpiresAt: soonDate,
        });
        assert.strictEqual(result.action, 'expired');
    });

    test('healthy state resets expiration flag', () => {
        const futureRefresh = new Date(baseInput.now + 7 * 24 * 3_600_000).toISOString();
        const result = evaluateTokenExpiration({
            ...baseInput,
            refreshExpiresAt: futureRefresh,
            hasNotifiedExpiration: true,
        });
        assert.strictEqual(result.action, 'none');
        assert.strictEqual(result.flags.hasNotifiedExpiration, false);
    });

    test('hoursRemaining uses ceil and minimum of 1', () => {
        // 20 minutes from now
        const soonDate = new Date(baseInput.now + 20 * 60_000).toISOString();
        const result = evaluateTokenExpiration({ ...baseInput, absoluteExpiresAt: soonDate });
        assert.strictEqual(result.action, 'warn_hard_cap');
        assert.strictEqual(result.hoursRemaining, 1, 'Should show at least 1h, not 0h');
    });

    test('returns expired when absolute cap is already past', () => {
        const pastCap = new Date(baseInput.now - 3_600_000).toISOString(); // 1h ago
        const result = evaluateTokenExpiration({ ...baseInput, absoluteExpiresAt: pastCap });
        assert.strictEqual(result.action, 'expired');
        assert.strictEqual(result.flags.hasNotifiedExpiration, true);
    });

    test('skips past-cap notification if already notified', () => {
        const pastCap = new Date(baseInput.now - 3_600_000).toISOString();
        const result = evaluateTokenExpiration({
            ...baseInput,
            absoluteExpiresAt: pastCap,
            hasNotifiedExpiration: true,
        });
        assert.strictEqual(result.action, 'none');
    });
});
