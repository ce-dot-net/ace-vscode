import * as vscode from 'vscode';

/**
 * Git context captured for AI-Trail trajectory
 */
export interface GitContext {
    branch: string;
    commitsSinceStart: Array<{
        hash: string;
        shortHash: string;
        message: string;
        author: string;
        date?: Date;
    }>;
    uncommittedChanges: number;
    changedFiles: string[];
    remoteUrl?: string;
}

/**
 * Minimal Git API types (from vscode.git extension)
 * We define these locally to avoid hard dependency on vscode.git typings
 */
interface GitExtension {
    readonly enabled: boolean;
    getAPI(version: 1): GitAPI;
}

interface GitAPI {
    readonly repositories: Repository[];
    getRepository(uri: vscode.Uri): Repository | null;
    onDidOpenRepository: vscode.Event<Repository>;
    onDidCloseRepository: vscode.Event<Repository>;
}

interface Repository {
    readonly rootUri: vscode.Uri;
    readonly state: RepositoryState;
    log(options?: LogOptions): Promise<Commit[]>;
    getCommit(ref: string): Promise<Commit>;
}

interface RepositoryState {
    readonly HEAD: Branch | undefined;
    readonly remotes: Remote[];
    readonly workingTreeChanges: Change[];
    readonly indexChanges: Change[];
    readonly onDidChange: vscode.Event<void>;
}

interface Branch {
    readonly name?: string;
    readonly commit?: string;
    readonly upstream?: { name: string; remote: string };
}

interface Remote {
    readonly name: string;
    readonly fetchUrl?: string;
    readonly pushUrl?: string;
}

interface Change {
    readonly uri: vscode.Uri;
}

interface Commit {
    readonly hash: string;
    readonly message: string;
    readonly authorName?: string;
    readonly authorDate?: Date;
}

interface LogOptions {
    readonly maxEntries?: number;
    readonly range?: string;
}

/**
 * Monitors Git repository state for AI-Trail trajectory capture.
 * Provides both passive (on-request) and active (commit listener) modes.
 */
export class GitMonitor implements vscode.Disposable {
    private gitApi: GitAPI | undefined;
    private repository: Repository | undefined;
    private sessionStartCommit: string | undefined;
    private disposables: vscode.Disposable[] = [];
    private isActive = false;

    /**
     * Activates the Git monitor
     */
    activate(context: vscode.ExtensionContext): void {
        // Try to get Git extension
        try {
            const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git');
            if (!gitExtension) {
                console.log('ACE: Git extension not found, GitMonitor disabled');
                return;
            }

            if (!gitExtension.isActive) {
                // Wait for Git extension to activate
                Promise.resolve(gitExtension.activate()).then(() => {
                    this.initializeGitApi(gitExtension.exports, context);
                }).catch((err: unknown) => {
                    console.log('ACE: Failed to activate Git extension:', err);
                });
            } else {
                this.initializeGitApi(gitExtension.exports, context);
            }
        } catch (error) {
            console.log('ACE: Error accessing Git extension:', error);
        }
    }

    private initializeGitApi(gitExtension: GitExtension, context: vscode.ExtensionContext): void {
        if (!gitExtension.enabled) {
            console.log('ACE: Git extension is disabled');
            return;
        }

        try {
            this.gitApi = gitExtension.getAPI(1);

            // Get repository for current workspace
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
                this.repository = this.gitApi.getRepository(workspaceFolders[0].uri) ?? undefined;
            }

            // Capture session start commit
            this.captureSessionStart();

            // Set up active mode if configured
            this.setupActiveMode(context);

            // Listen for repository changes
            this.gitApi.onDidOpenRepository((repo) => {
                if (!this.repository) {
                    this.repository = repo;
                    this.captureSessionStart();
                    this.setupActiveMode(context);
                }
            }, null, this.disposables);

            context.subscriptions.push(this);
            console.log('ACE: GitMonitor activated');
        } catch (error) {
            console.log('ACE: Error initializing Git API:', error);
        }
    }

    /**
     * Captures the current HEAD commit as session start reference
     */
    private captureSessionStart(): void {
        if (this.repository?.state.HEAD?.commit) {
            this.sessionStartCommit = this.repository.state.HEAD.commit;
            console.log(`ACE: Session start commit: ${this.sessionStartCommit.substring(0, 7)}`);
        }
    }

    /**
     * Sets up active commit monitoring if configured
     */
    private setupActiveMode(context: vscode.ExtensionContext): void {
        const config = vscode.workspace.getConfiguration('ace');
        const gitAutoCapture = config.get<boolean>('automation.gitAutoCapture', false);

        if (!gitAutoCapture || !this.repository || this.isActive) {
            return;
        }

        this.isActive = true;
        let lastKnownCommit = this.repository.state.HEAD?.commit;

        // Listen for repository state changes
        this.repository.state.onDidChange(() => {
            const currentCommit = this.repository?.state.HEAD?.commit;
            if (currentCommit && currentCommit !== lastKnownCommit) {
                lastKnownCommit = currentCommit;
                this.onNewCommitDetected(currentCommit);
            }
        }, null, this.disposables);

        console.log('ACE: GitMonitor active mode enabled');
    }

    /**
     * Called when a new commit is detected (active mode)
     */
    private async onNewCommitDetected(commitHash: string): Promise<void> {
        try {
            const commit = await this.repository?.getCommit(commitHash);
            if (!commit) return;

            const result = await vscode.window.showInformationMessage(
                `ACE: Commit detected - "${commit.message.split('\n')[0]}"`,
                'Capture Learning',
                'Dismiss'
            );

            if (result === 'Capture Learning') {
                vscode.commands.executeCommand('ace-vscode.captureLearn', {
                    context: `Committed: ${commit.message.split('\n')[0]}`,
                    success: true,
                });
            }
        } catch (error) {
            console.log('ACE: Error processing commit:', error);
        }
    }

    /**
     * Gets the current Git context for trajectory enrichment.
     * Returns null if Git is not available.
     */
    async getGitContext(): Promise<GitContext | null> {
        if (!this.repository) {
            return null;
        }

        try {
            const state = this.repository.state;
            const branch = state.HEAD?.name || 'detached';

            // Get commits since session start
            const commitsSinceStart: GitContext['commitsSinceStart'] = [];
            if (this.sessionStartCommit && state.HEAD?.commit) {
                try {
                    const range = `${this.sessionStartCommit}..${state.HEAD.commit}`;
                    const commits = await this.repository.log({ maxEntries: 10, range });
                    for (const commit of commits) {
                        commitsSinceStart.push({
                            hash: commit.hash,
                            shortHash: commit.hash.substring(0, 7),
                            message: commit.message.split('\n')[0], // First line only
                            author: commit.authorName || 'Unknown',
                            date: commit.authorDate,
                        });
                    }
                } catch {
                    // Range query failed, maybe no new commits
                }
            }

            // Count uncommitted changes
            const uncommittedChanges =
                state.workingTreeChanges.length +
                state.indexChanges.length;

            // Extract changed file paths (relative to workspace)
            const changedFiles = [
                ...state.workingTreeChanges.map(c => vscode.workspace.asRelativePath(c.uri)),
                ...state.indexChanges.map(c => vscode.workspace.asRelativePath(c.uri))
            ];

            // Get remote URL
            const origin = state.remotes.find(r => r.name === 'origin');
            const remoteUrl = origin?.fetchUrl || origin?.pushUrl;

            return {
                branch,
                commitsSinceStart,
                uncommittedChanges,
                changedFiles,
                remoteUrl,
            };
        } catch (error) {
            console.log('ACE: Error getting Git context:', error);
            return null;
        }
    }

    /**
     * Resets the session start to current HEAD
     */
    resetSessionStart(): void {
        this.captureSessionStart();
    }

    /**
     * Checks if Git is available
     */
    isAvailable(): boolean {
        return this.repository !== undefined;
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}

// Singleton instance
export const gitMonitor = new GitMonitor();
