import * as assert from 'assert';
import {
    COMMANDS,
    DEVICE_MANAGEMENT_URL,
    DEVICE_LIMITS_DOCS_URL,
    TOKEN_CHECK_INTERVAL_MS,
    HARD_CAP_WARNING_HOURS,
} from '../../../constants';
import { isDeviceLimitError, isValidVerificationUri } from '../../../utils/loginHelpers';

/**
 * Unit tests for Login command
 * Tests exported helper functions and configuration constants
 */
suite('Login Command Tests', () => {

    test('LOGIN command constant has correct ID', () => {
        assert.strictEqual(COMMANDS.LOGIN, 'ace-vscode.login');
    });

    test('device management URL uses HTTPS', () => {
        assert.ok(
            DEVICE_MANAGEMENT_URL.startsWith('https://'),
            'Device management URL must use HTTPS'
        );
    });

    test('device limits docs URL uses HTTPS', () => {
        assert.ok(
            DEVICE_LIMITS_DOCS_URL.startsWith('https://'),
            'Device limits docs URL must use HTTPS'
        );
    });
});

suite('isDeviceLimitError', () => {

    test('detects Error with "device limit exceeded" message', () => {
        const error = new Error('device limit exceeded');
        assert.strictEqual(isDeviceLimitError(error), true);
    });

    test('detects message case-insensitively', () => {
        const error = new Error('Device Limit Exceeded for this account');
        assert.strictEqual(isDeviceLimitError(error), true);
    });

    test('detects Axios-style response with error_code', () => {
        const error = {
            response: {
                data: { error_code: 'device_limit_exceeded' },
            },
        };
        assert.strictEqual(isDeviceLimitError(error), true);
    });

    test('returns false for unrelated Error', () => {
        const error = new Error('network timeout');
        assert.strictEqual(isDeviceLimitError(error), false);
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

    test('returns false for object with non-object response', () => {
        assert.strictEqual(isDeviceLimitError({ response: 'not an object' }), false);
    });

    test('returns false for response without data', () => {
        assert.strictEqual(isDeviceLimitError({ response: {} }), false);
    });

    test('returns false for wrong error_code', () => {
        const error = {
            response: {
                data: { error_code: 'rate_limited' },
            },
        };
        assert.strictEqual(isDeviceLimitError(error), false);
    });
});

suite('isValidVerificationUri', () => {

    test('accepts valid HTTPS URI', () => {
        assert.strictEqual(
            isValidVerificationUri('https://auth.example.com/device?code=ABC'),
            true
        );
    });

    test('rejects HTTP URI', () => {
        assert.strictEqual(
            isValidVerificationUri('http://auth.example.com/device'),
            false
        );
    });

    test('rejects javascript: URI', () => {
        assert.strictEqual(
            isValidVerificationUri('javascript:alert(1)'),
            false
        );
    });

    test('rejects file: URI', () => {
        assert.strictEqual(
            isValidVerificationUri('file:///etc/passwd'),
            false
        );
    });

    test('rejects empty string', () => {
        assert.strictEqual(isValidVerificationUri(''), false);
    });

    test('rejects malformed URI', () => {
        assert.strictEqual(isValidVerificationUri('not a url'), false);
    });
});

suite('Token Expiration Constants', () => {

    test('check interval is 1 hour in milliseconds', () => {
        assert.strictEqual(TOKEN_CHECK_INTERVAL_MS, 3_600_000);
    });

    test('hard cap warning threshold is 24 hours', () => {
        assert.strictEqual(HARD_CAP_WARNING_HOURS, 24);
    });
});
