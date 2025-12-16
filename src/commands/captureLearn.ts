import * as vscode from 'vscode';
import { activityMonitor, taskDetector, gitMonitor } from '../automation';
import { isProjectConfigured } from '../services/config';

interface CaptureLearnOptions {
    context?: string;
    success?: boolean;
}

/**
 * Command to capture learning from the current work session.
 * Opens a dialog to describe what was accomplished.
 */
export async function handleCaptureLearn(options?: CaptureLearnOptions): Promise<void> {
    // Check if configured
    if (!isProjectConfigured()) {
        const result = await vscode.window.showWarningMessage(
            'ACE: Project not configured. Configure now?',
            'Configure',
            'Cancel'
        );
        if (result === 'Configure') {
            vscode.commands.executeCommand('ace-vscode.configure');
        }
        return;
    }

    // Get activity stats
    const stats = activityMonitor.getStats();
    const taskContext = taskDetector.getRecentTaskContext();

    // Build pre-filled context
    let prefilledDescription = '';
    if (options?.context) {
        prefilledDescription = options.context;
    } else if (taskContext) {
        prefilledDescription = `Completed: ${taskContext}`;
    }

    // Step 1: Get task description
    const taskDescription = await vscode.window.showInputBox({
        prompt: 'What did you accomplish?',
        placeHolder: 'e.g., Implemented JWT authentication with refresh tokens',
        value: prefilledDescription,
        validateInput: (v) => v.length < 10 ? 'Please provide a more detailed description' : undefined,
    });

    if (!taskDescription) {
        return;
    }

    // Step 2: Ask about outcome
    const outcomeItems: vscode.QuickPickItem[] = [
        {
            label: '$(check) Successful',
            description: 'Task completed successfully',
            picked: options?.success === true,
        },
        {
            label: '$(warning) Partial',
            description: 'Partially completed or needs more work',
        },
        {
            label: '$(error) Learned from failure',
            description: 'Encountered issues but learned something valuable',
        },
    ];

    const outcome = await vscode.window.showQuickPick(outcomeItems, {
        placeHolder: 'How did it go?',
        title: 'ACE: Capture Learning',
    });

    if (!outcome) {
        return;
    }

    const success = outcome.label.includes('Successful');

    // Step 3: Get lessons learned (optional but encouraged)
    const lessons = await vscode.window.showInputBox({
        prompt: 'Any lessons learned or patterns worth remembering? (optional)',
        placeHolder: 'e.g., Always validate JWT expiry before refresh, use short-lived access tokens',
    });

    // Step 4: Build trajectory summary
    let trajectory = `Task: ${taskDescription}\n`;
    trajectory += `Outcome: ${outcome.description}\n`;
    if (stats.editCount > 0) {
        trajectory += `Activity: ${stats.editCount} edits in ${stats.fileCount} files\n`;
    }

    // Add Git context if available
    const gitContext = await gitMonitor.getGitContext();
    if (gitContext) {
        trajectory += `Branch: ${gitContext.branch}\n`;
        if (gitContext.commitsSinceStart.length > 0) {
            trajectory += `Commits this session: ${gitContext.commitsSinceStart.length}\n`;
            const latestCommit = gitContext.commitsSinceStart[0];
            trajectory += `Latest commit: ${latestCommit.shortHash} - ${latestCommit.message}\n`;
        }
        if (gitContext.uncommittedChanges > 0) {
            trajectory += `Uncommitted changes: ${gitContext.uncommittedChanges}\n`;
            if (gitContext.changedFiles.length > 0) {
                const displayFiles = gitContext.changedFiles.slice(0, 10); // Limit to 10 files
                trajectory += `Changed files: ${displayFiles.join(', ')}`;
                if (gitContext.changedFiles.length > 10) {
                    trajectory += ` (+${gitContext.changedFiles.length - 10} more)`;
                }
                trajectory += '\n';
            }
        }
    }

    if (lessons) {
        trajectory += `Lessons: ${lessons}\n`;
    }

    // Step 5: Send to Copilot Chat to invoke ace_learn
    const chatQuery = buildChatQuery(taskDescription, success, trajectory, lessons);

    // Open Copilot chat with the learning request
    vscode.commands.executeCommand('workbench.action.chat.open', {
        query: chatQuery,
    });

    // Reset activity monitor
    activityMonitor.reset();

    vscode.window.showInformationMessage('ACE: Learning captured! Check Copilot chat for confirmation.');
}

/**
 * Builds a chat query that will trigger ace_learn tool
 */
function buildChatQuery(
    task: string,
    success: boolean,
    trajectory: string,
    lessons?: string
): string {
    let query = `@ace Use the ace_learn tool to capture this learning:\n\n`;
    query += `**Task**: ${task}\n`;
    query += `**Success**: ${success}\n`;
    query += `**Trajectory**:\n${trajectory}\n`;
    if (lessons) {
        query += `**Lessons learned**: ${lessons}\n`;
    }
    return query;
}
