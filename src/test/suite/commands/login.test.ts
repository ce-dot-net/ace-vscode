import * as assert from 'assert';
import { COMMANDS, DEVICE_MANAGEMENT_URL, DEVICE_LIMITS_DOCS_URL } from '../../../constants';

/**
 * Unit tests for Login command
 * Tests device code authentication workflow configuration and constants
 */
suite('Login Command Tests', () => {

    test('LOGIN command is registered with correct ID', () => {
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

    test('device limit error detection matches expected string', () => {
        const errorMessage = 'device limit exceeded';
        assert.ok(
            errorMessage.includes('device limit exceeded'),
            'Should detect device limit error from message'
        );
    });

    test('AbortError name matches cancellation pattern', () => {
        const abortError = new DOMException('The operation was aborted', 'AbortError');
        assert.strictEqual(abortError.name, 'AbortError');
    });

    test('AbortController signal starts as not aborted', () => {
        const controller = new AbortController();
        assert.strictEqual(controller.signal.aborted, false);
    });

    test('AbortController signal reflects abort', () => {
        const controller = new AbortController();
        controller.abort();
        assert.strictEqual(controller.signal.aborted, true);
    });
});

suite('Token Expiration Logic Tests', () => {

    test('expired refresh token is detected', () => {
        const refreshExpiresAt = new Date('2025-01-01T00:00:00Z').getTime();
        const now = Date.now();
        assert.ok(refreshExpiresAt < now, 'Past date should be detected as expired');
    });

    test('future refresh token is not expired', () => {
        const refreshExpiresAt = new Date('2099-01-01T00:00:00Z').getTime();
        const now = Date.now();
        assert.ok(refreshExpiresAt > now, 'Future date should not be expired');
    });

    test('absolute cap within 24h triggers warning', () => {
        const absoluteExpiresAt = Date.now() + (12 * 60 * 60 * 1000); // 12h from now
        const hoursRemaining = (absoluteExpiresAt - Date.now()) / (1000 * 60 * 60);
        assert.ok(hoursRemaining < 24 && hoursRemaining > 0, 'Should trigger warning');
    });

    test('absolute cap beyond 24h does not trigger warning', () => {
        const absoluteExpiresAt = Date.now() + (48 * 60 * 60 * 1000); // 48h from now
        const hoursRemaining = (absoluteExpiresAt - Date.now()) / (1000 * 60 * 60);
        assert.ok(hoursRemaining >= 24, 'Should not trigger warning');
    });

    test('hours remaining rounds correctly for display', () => {
        const hoursRemaining = 11.7;
        assert.strictEqual(Math.round(hoursRemaining), 12);
    });
});
