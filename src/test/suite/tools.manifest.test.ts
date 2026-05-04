import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface LanguageModelTool {
    name: string;
    displayName: string;
    toolReferenceName: string;
    canBeReferencedInPrompt: boolean;
    modelDescription: string;
    userDescription: string;
    inputSchema: unknown;
    annotations: unknown;
    confirmationMessages?: { title: string; message: string };
}

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const PACKAGE_JSON_PATH = path.join(PROJECT_ROOT, 'package.json');
const FIXTURE_PATH = path.join(
    PROJECT_ROOT,
    'src/test/suite/__fixtures__/languageModelTools.json'
);

const REQUIRED_KEYS = [
    'name',
    'displayName',
    'toolReferenceName',
    'canBeReferencedInPrompt',
    'modelDescription',
    'userDescription',
    'inputSchema',
    'annotations'
] as const;

const EXPECTED_NAMES = ['ace_search', 'ace_learn', 'ace_status', 'ace_get_playbook'];
const NAMES_REQUIRING_CONFIRMATION = ['ace_search', 'ace_learn'];

suite('languageModelTools manifest snapshot', () => {
    let tools: LanguageModelTool[];

    suiteSetup(() => {
        const raw = fs.readFileSync(PACKAGE_JSON_PATH, 'utf8');
        const pkg = JSON.parse(raw);
        tools = pkg.contributes?.languageModelTools ?? [];
    });

    test('contains exactly the 4 expected tool entries', () => {
        assert.equal(tools.length, 4, 'expected 4 languageModelTools entries');
        const names = tools.map(t => t.name).sort();
        assert.deepEqual(names, [...EXPECTED_NAMES].sort());
    });

    test('every entry has the required keys', () => {
        for (const tool of tools) {
            for (const key of REQUIRED_KEYS) {
                assert.ok(
                    Object.prototype.hasOwnProperty.call(tool, key),
                    `tool "${tool.name}" missing required key "${key}"`
                );
            }
        }
    });

    test('ace_search and ace_learn carry non-empty confirmationMessages', () => {
        for (const name of NAMES_REQUIRING_CONFIRMATION) {
            const tool = tools.find(t => t.name === name);
            assert.ok(tool, `tool "${name}" not found`);
            const cm = tool!.confirmationMessages;
            assert.ok(cm, `tool "${name}" missing confirmationMessages`);
            assert.equal(typeof cm!.title, 'string');
            assert.equal(typeof cm!.message, 'string');
            assert.ok(cm!.title.length > 0, `tool "${name}" confirmationMessages.title is empty`);
            assert.ok(cm!.message.length > 0, `tool "${name}" confirmationMessages.message is empty`);
        }
    });

    test('manifest matches golden fixture (cache-stability gate)', () => {
        const current = JSON.stringify(tools);

        if (!fs.existsSync(FIXTURE_PATH)) {
            fs.mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
            fs.writeFileSync(FIXTURE_PATH, current);
            console.warn(
                `[tools.manifest] seeded fixture at ${FIXTURE_PATH} on first run`
            );
            return;
        }

        const golden = fs.readFileSync(FIXTURE_PATH, 'utf8');
        assert.equal(
            current,
            golden,
            'languageModelTools manifest drifted from golden fixture. ' +
                'If intentional, regenerate fixture by deleting it and re-running tests.'
        );
    });
});
