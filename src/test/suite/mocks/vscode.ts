/**
 * VSCode API mocks for unit testing
 */

export interface MockLanguageModelTextPart {
    value: string;
}

export interface MockLanguageModelToolResult {
    parts: MockLanguageModelTextPart[];
}

export const mockVscode = {
    LanguageModelTextPart: class {
        value: string;
        constructor(value: string) {
            this.value = value;
        }
    },
    LanguageModelToolResult: class {
        parts: MockLanguageModelTextPart[];
        constructor(parts: MockLanguageModelTextPart[]) {
            this.parts = parts;
        }
    },
    workspace: {
        getConfiguration: (_section: string) => ({
            get: <T>(_key: string, _defaultValue?: T): T | undefined => undefined,
            update: async (_key: string, _value: unknown, _target?: unknown) => {}
        }),
        workspaceFolders: undefined as { uri: { fsPath: string } }[] | undefined
    },
    window: {
        showInformationMessage: async (_message: string, ..._items: string[]) => undefined,
        showWarningMessage: async (_message: string, ..._items: string[]) => undefined,
        showErrorMessage: async (_message: string, ..._items: string[]) => undefined
    },
    commands: {
        executeCommand: async (_command: string, ..._args: unknown[]) => {}
    },
    Uri: {
        file: (path: string) => ({ fsPath: path })
    },
    ConfigurationTarget: {
        Global: 1,
        Workspace: 2,
        WorkspaceFolder: 3
    },
    lm: {
        registerTool: (_name: string, _tool: unknown) => ({
            dispose: () => {}
        })
    },
    extensions: {
        getExtension: (_id: string) => undefined
    },
    CancellationTokenSource: class {
        token = {
            isCancellationRequested: false,
            onCancellationRequested: () => ({ dispose: () => {} })
        };
        cancel() {}
        dispose() {}
    }
};

// Helper to create mock workspace configuration
export function createMockConfiguration(values: Record<string, unknown> = {}) {
    return {
        get: <T>(key: string, defaultValue?: T): T => {
            return (values[key] !== undefined ? values[key] : defaultValue) as T;
        },
        update: async (_key: string, _value: unknown, _target?: unknown) => {}
    };
}

// Helper to create mock workspace folders
export function createMockWorkspaceFolders(paths: string[]) {
    return paths.map(p => ({ uri: { fsPath: p } }));
}
