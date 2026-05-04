import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawnSync } from 'child_process';

/**
 * Stop-hook unit tests.
 *
 * The Stop hook is a bash one-liner embedded in .github/hooks/ace-hooks.json.
 * These tests extract the command verbatim, then run it via spawnSync(bash, ['-c', cmd])
 * under a sandboxed $HOME with synthetic Copilot Agent Debug Log files and synthetic
 * transcript files. We verify each signal source (debug log → transcript →
 * last_assistant_message) and the block fallback.
 *
 * Pure shell exercises — no VS Code, no electron, no extension activation.
 */

interface RunResult {
    stdout: string;
    exitCode: number;
}

// __dirname differs between source (src/test/suite — 3 up to repo root) and
// compiled (out/test/suite — also 3 up). Walk up until we find package.json
// to be robust to either layout.
function findRepoRoot(start: string): string {
    let dir = start;
    for (let i = 0; i < 8; i++) {
        if (fs.existsSync(path.join(dir, 'package.json')) &&
            fs.existsSync(path.join(dir, '.github', 'hooks', 'ace-hooks.json'))) {
            return dir;
        }
        const parent = path.dirname(dir);
        if (parent === dir) { break; }
        dir = parent;
    }
    throw new Error(`Could not find repo root from ${start}`);
}
const REPO_ROOT = findRepoRoot(__dirname);
const HOOKS_JSON = path.join(REPO_ROOT, '.github', 'hooks', 'ace-hooks.json');

function loadStopCommand(): string {
    const raw = fs.readFileSync(HOOKS_JSON, 'utf8');
    const parsed = JSON.parse(raw);
    const cmd = parsed?.hooks?.Stop?.[0]?.command;
    assert.ok(typeof cmd === 'string' && cmd.length > 0, 'Stop hook command not found in ace-hooks.json');
    return cmd as string;
}

function runHook(cmd: string, input: object, fakeHome: string): RunResult {
    // Spawn bash directly, no shell-string interpolation; cmd is a static config string,
    // input is delivered via stdin (matches how hooks actually receive it).
    const result = spawnSync('/bin/bash', ['-c', cmd], {
        input: JSON.stringify(input),
        env: { ...process.env, HOME: fakeHome },
        encoding: 'utf8',
        timeout: 10000
    });
    return {
        stdout: result.stdout || '',
        exitCode: typeof result.status === 'number' ? result.status : 1
    };
}

function makeTempHome(prefix: string): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function seedDebugLog(home: string, sessionDir: string, contents: string): string {
    const dir = path.join(
        home,
        'Library',
        'Application Support',
        'Code',
        'logs',
        '01',
        'exthost',
        'anon.copilot-chat',
        sessionDir
    );
    fs.mkdirSync(dir, { recursive: true });
    const logPath = path.join(dir, 'agentDebug.log');
    fs.writeFileSync(logPath, contents, 'utf8');
    return logPath;
}

function writeTranscript(text: string): string {
    const file = path.join(os.tmpdir(), `ace-transcript-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
    fs.writeFileSync(file, text, 'utf8');
    return file;
}

suite('Stop Hook — Agent Debug Log + transcript fallback', () => {
    const cmd = loadStopCommand();

    test('Scenario A: debug log present, session_id matches, ace_learn entry → exit 0 (allow)', () => {
        const home = makeTempHome('ace-stophook-A-');
        try {
            seedDebugLog(
                home,
                'sess-x',
                '{"sessionId":"sess-x","name":"ace_learn","args":{"task":"impl"}}\n'
            );
            const r = runHook(cmd, {
                session_id: 'sess-x',
                stop_hook_active: false,
                transcript_path: '/dev/null',
                last_assistant_message: ''
            }, home);
            assert.strictEqual(r.exitCode, 0, 'Hook should exit 0');
            assert.strictEqual(r.stdout.trim(), '', 'Hook should emit no JSON when allowing');
        } finally {
            fs.rmSync(home, { recursive: true, force: true });
        }
    });

    test('Scenario B: debug log present but contains no ace_learn → block JSON', () => {
        const home = makeTempHome('ace-stophook-B-');
        try {
            seedDebugLog(
                home,
                'sess-x',
                '{"sessionId":"sess-x","name":"some_other_tool","args":{}}\n'
            );
            const r = runHook(cmd, {
                session_id: 'sess-x',
                stop_hook_active: false,
                transcript_path: '/dev/null',
                last_assistant_message: ''
            }, home);
            assert.strictEqual(r.exitCode, 0, 'Hook always exits 0; decision is in the JSON payload');
            assert.match(
                r.stdout,
                /"decision"\s*:\s*"block"/,
                'Block decision should be present when no signal matches'
            );
            assert.match(
                r.stdout,
                /"hookEventName"\s*:\s*"Stop"/,
                'Block payload should reference Stop event'
            );
        } finally {
            fs.rmSync(home, { recursive: true, force: true });
        }
    });

    test('Scenario C1: debug log absent, transcript contains ace_learn → exit 0 (transcript fallback)', () => {
        const home = makeTempHome('ace-stophook-C1-');
        const transcript = writeTranscript('something happened\nthen ace_learn was invoked\nthen done\n');
        try {
            const r = runHook(cmd, {
                session_id: 'sess-x',
                stop_hook_active: false,
                transcript_path: transcript,
                last_assistant_message: ''
            }, home);
            assert.strictEqual(r.exitCode, 0);
            assert.strictEqual(r.stdout.trim(), '', 'Should allow via transcript fallback');
        } finally {
            fs.rmSync(home, { recursive: true, force: true });
            fs.rmSync(transcript, { force: true });
        }
    });

    test('Scenario C2: debug log absent, transcript clean, last_assistant_message neutral → block', () => {
        const home = makeTempHome('ace-stophook-C2-');
        const transcript = writeTranscript('only unrelated content here\n');
        try {
            const r = runHook(cmd, {
                session_id: 'sess-x',
                stop_hook_active: false,
                transcript_path: transcript,
                last_assistant_message: 'all done with the task'
            }, home);
            assert.match(r.stdout, /"decision"\s*:\s*"block"/);
        } finally {
            fs.rmSync(home, { recursive: true, force: true });
            fs.rmSync(transcript, { force: true });
        }
    });

    test('Scenario C3: debug log absent, last_assistant_message says "captured learning" → exit 0', () => {
        const home = makeTempHome('ace-stophook-C3-');
        const transcript = writeTranscript('only unrelated content here\n');
        try {
            const r = runHook(cmd, {
                session_id: 'sess-x',
                stop_hook_active: false,
                transcript_path: transcript,
                last_assistant_message: 'I have captured learning for this task'
            }, home);
            assert.strictEqual(r.stdout.trim(), '', 'Should allow via last_assistant_message fallback');
        } finally {
            fs.rmSync(home, { recursive: true, force: true });
            fs.rmSync(transcript, { force: true });
        }
    });

    test('Scenario D: stop_hook_active=true short-circuits all checks', () => {
        const home = makeTempHome('ace-stophook-D-');
        try {
            const r = runHook(cmd, {
                stop_hook_active: true,
                session_id: 'sess-x',
                transcript_path: '/dev/null',
                last_assistant_message: ''
            }, home);
            assert.strictEqual(r.exitCode, 0);
            assert.strictEqual(r.stdout.trim(), '', 'Should silently exit when already active');
        } finally {
            fs.rmSync(home, { recursive: true, force: true });
        }
    });
});
