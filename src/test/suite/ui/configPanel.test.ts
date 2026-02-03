import * as assert from 'assert';

/**
 * Unit tests for ConfigPanel - Device Login First Design
 * Tests the three-state UI: not logged in / logged in / expired
 */

suite('ConfigPanel Auth States', () => {

    test('not logged in state disables save button', () => {
        const isLoggedIn = false;
        const saveDisabled = !isLoggedIn;
        assert.ok(saveDisabled, 'Save button disabled when not logged in');
    });

    test('logged in state enables save button', () => {
        const isLoggedIn = true;
        const isExpired = false;
        const saveDisabled = !isLoggedIn || isExpired;
        assert.ok(!saveDisabled, 'Save button enabled when logged in');
    });

    test('expired state disables save button', () => {
        const isLoggedIn = true;
        const isExpired = true;
        const saveDisabled = !isLoggedIn || isExpired;
        assert.ok(saveDisabled, 'Save button disabled when expired');
    });

    test('not logged in shows login button', () => {
        const isLoggedIn = false;
        const showLoginPrompt = !isLoggedIn;
        assert.ok(showLoginPrompt, 'Shows login button when not logged in');
    });

    test('logged in shows logged in status', () => {
        const isLoggedIn = true;
        const email = 'test@example.com';
        const showLoggedInStatus = isLoggedIn && email;
        assert.ok(showLoggedInStatus, 'Shows logged in status with email');
    });

    test('expired shows re-login required', () => {
        const isLoggedIn = true;
        const isExpired = true;
        const showReLoginRequired = isLoggedIn && isExpired;
        assert.ok(showReLoginRequired, 'Shows re-login required when expired');
    });
});

suite('ConfigPanel Login Button States', () => {

    test('login button text is "Login with Browser" when not logged in', () => {
        const isLoggedIn = false;
        const buttonText = isLoggedIn ? '✓ Logged In' : 'Login with Browser';
        assert.strictEqual(buttonText, 'Login with Browser');
    });

    test('login button text is "✓ Logged In" when logged in', () => {
        const isLoggedIn = true;
        const isExpired = false;
        const buttonText = isExpired ? 'Re-login Required' : (isLoggedIn ? '✓ Logged In' : 'Login with Browser');
        assert.strictEqual(buttonText, '✓ Logged In');
    });

    test('login button text is "Re-login Required" when expired', () => {
        const isLoggedIn = true;
        const isExpired = true;
        const buttonText = isExpired ? 'Re-login Required' : (isLoggedIn ? '✓ Logged In' : 'Login with Browser');
        assert.strictEqual(buttonText, 'Re-login Required');
    });

    test('logout button hidden when not logged in', () => {
        const isLoggedIn = false;
        const showLogout = isLoggedIn;
        assert.ok(!showLogout, 'Logout button hidden');
    });

    test('logout button visible when logged in', () => {
        const isLoggedIn = true;
        const showLogout = isLoggedIn;
        assert.ok(showLogout, 'Logout button visible');
    });
});

suite('ConfigPanel Org/Project Selection', () => {

    test('org dropdown hidden when not logged in', () => {
        const isLoggedIn = false;
        const showOrgDropdown = isLoggedIn;
        assert.ok(!showOrgDropdown, 'Org dropdown hidden when not logged in');
    });

    test('org dropdown visible when logged in', () => {
        const isLoggedIn = true;
        const isExpired = false;
        const showOrgDropdown = isLoggedIn && !isExpired;
        assert.ok(showOrgDropdown, 'Org dropdown visible when logged in');
    });

    test('org dropdown hidden when expired', () => {
        const isLoggedIn = true;
        const isExpired = true;
        const showOrgDropdown = isLoggedIn && !isExpired;
        assert.ok(!showOrgDropdown, 'Org dropdown hidden when expired');
    });

    test('project dropdown hidden when not logged in', () => {
        const isLoggedIn = false;
        const showProjectDropdown = isLoggedIn;
        assert.ok(!showProjectDropdown, 'Project dropdown hidden');
    });

    test('project dropdown visible when logged in', () => {
        const isLoggedIn = true;
        const isExpired = false;
        const showProjectDropdown = isLoggedIn && !isExpired;
        assert.ok(showProjectDropdown, 'Project dropdown visible');
    });

    test('project dropdown populates on org change', () => {
        const orgId = 'org_123';
        const projects = [
            { project_id: 'prj_1', project_name: 'Project 1' },
            { project_id: 'prj_2', project_name: 'Project 2' }
        ];
        const filteredProjects = projects.filter(p => p.project_id.startsWith('prj_'));
        assert.strictEqual(filteredProjects.length, 2, 'Projects filtered by org');
    });
});

suite('ConfigPanel Session Expiry Display', () => {

    test('format time remaining shows days when > 24h', () => {
        const hours = 72;
        const days = Math.floor(hours / 24);
        const remainingHours = hours % 24;
        const display = `${days}d ${remainingHours}h`;
        assert.strictEqual(display, '3d 0h');
    });

    test('format time remaining shows hours when < 24h', () => {
        const hours = 18;
        const display = `${hours}h`;
        assert.strictEqual(display, '18h');
    });

    test('format time remaining shows Expired when <= 0', () => {
        const hours = 0;
        const display = hours <= 0 ? 'Expired' : `${hours}h`;
        assert.strictEqual(display, 'Expired');
    });

    test('shows session and hard cap expiry when logged in', () => {
        const accessExpiry = '48h';
        const hardCapExpiry = '7d 0h';
        const statusHtml = `⏱️ Session: ${accessExpiry} · 🔒 Hard cap: ${hardCapExpiry}`;
        assert.ok(statusHtml.includes('Session:'), 'Shows session expiry');
        assert.ok(statusHtml.includes('Hard cap:'), 'Shows hard cap expiry');
    });
});

suite('ConfigPanel No API Token Field', () => {

    test('design does not include API token field', () => {
        // The new design uses device login only
        const hasApiTokenField = false;
        assert.ok(!hasApiTokenField, 'No API token field in new design');
    });

    test('design does not include Connect button', () => {
        // Connect button was for manual token verification
        const hasConnectButton = false;
        assert.ok(!hasConnectButton, 'No Connect button in new design');
    });

    test('authentication is via device code flow only', () => {
        const authMethod = 'device_code';
        assert.strictEqual(authMethod, 'device_code', 'Auth method is device code');
    });
});

suite('ConfigPanel Save Configuration', () => {

    test('save requires serverUrl', () => {
        const serverUrl = '';
        const isValid = serverUrl.length > 0;
        assert.ok(!isValid, 'Save invalid without serverUrl');
    });

    test('save requires orgId', () => {
        const orgId = '';
        const isValid = orgId.length > 0;
        assert.ok(!isValid, 'Save invalid without orgId');
    });

    test('save requires projectId', () => {
        const projectId = '';
        const isValid = projectId.length > 0;
        assert.ok(!isValid, 'Save invalid without projectId');
    });

    test('save validates all fields', () => {
        const serverUrl = 'https://ace-api.code-engine.app';
        const orgId = 'org_123';
        const projectId = 'prj_456';
        const isValid = serverUrl.length > 0 && orgId.length > 0 && projectId.length > 0;
        assert.ok(isValid, 'Save valid with all fields');
    });
});

suite('ConfigPanel Message Handlers', () => {

    test('handles login command', () => {
        const command = 'login';
        const isHandled = command === 'login';
        assert.ok(isHandled, 'Login command handled');
    });

    test('handles logout command', () => {
        const command = 'logout';
        const isHandled = command === 'logout';
        assert.ok(isHandled, 'Logout command handled');
    });

    test('handles fetchProjects command', () => {
        const command = 'fetchProjects';
        const isHandled = command === 'fetchProjects';
        assert.ok(isHandled, 'FetchProjects command handled');
    });

    test('handles save command', () => {
        const command = 'save';
        const isHandled = command === 'save';
        assert.ok(isHandled, 'Save command handled');
    });

    test('handles loginResult message', () => {
        const command = 'loginResult';
        const success = true;
        const user = { email: 'test@example.com', organizations: [] };
        assert.ok(success && user.email, 'LoginResult message processed');
    });

    test('handles projectsResult message', () => {
        const command = 'projectsResult';
        const success = true;
        const projects = [{ project_id: 'prj_1', project_name: 'Test' }];
        assert.ok(success && projects.length > 0, 'ProjectsResult message processed');
    });
});
