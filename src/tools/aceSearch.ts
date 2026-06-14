import * as vscode from 'vscode';
import { getAceClient } from '../services/aceClient';
import {
    generateSessionId,
    saveSession,
    getSession,
    getSessionKey,
    SESSION_TTL
} from '../services/sessionStorage';
import type { SearchResultPattern, SearchPatternsParams } from '@ace-sdk/core';
import { decodeMatchFactors, decodePattern } from '@ace-sdk/core';

interface AceSearchInput {
    query: string;
    allowed_domains?: string;
    blocked_domains?: string;
    task_intent?: 'refactor' | 'routine' | 'explore' | 'spec_strict'; // F-080 #18
}

/**
 * ACE Search Tool - Searches playbook for relevant patterns
 * Returns verbose formatted output for display in Copilot chat
 */
export class AceSearchTool implements vscode.LanguageModelTool<AceSearchInput> {
    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<AceSearchInput>,
        _token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
        const { query, allowed_domains, blocked_domains, task_intent } = options.input;
        const client = getAceClient();

        if (!client) {
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart('❌ **[ACE] Not configured.** Run "ACE: Configure" first.')
            ]);
        }

        try {
            // Generate session ID before building searchOptions so it can be forwarded (#18)
            const sessionKey = getSessionKey(); // 'default' for tool handler (no folder context)
            const sessionId = generateSessionId();

            // Build search options with optional domain filtering (#18: typed as SearchPatternsParams)
            const searchOptions: SearchPatternsParams = {
                query,
                threshold: 0.75,
                top_k: 10,
                include_metadata: true,
                session_id: sessionId,                          // F-080 #18: pass to server
                ...(task_intent ? { task_intent } : {})        // F-080 #18: omit key when absent
            };

            // Parse comma-separated domain lists
            if (allowed_domains) {
                searchOptions.allowed_domains = allowed_domains.split(',').map(d => d.trim());
            }
            if (blocked_domains) {
                searchOptions.blocked_domains = blocked_domains.split(',').map(d => d.trim());
            }

            const result = await client.searchPatterns(searchOptions);

            const patterns: SearchResultPattern[] = result.similar_patterns || [];  // #17: typed as SearchResultPattern[]
            const count = patterns.length;

            // Collect applied_log_ids from match_factors (#17)
            const appliedLogIds = patterns
                .map(p => decodeMatchFactors(p.match_factors))
                .filter((mf): mf is NonNullable<typeof mf> => mf !== null)
                .map(mf => mf.retrieval_log_id)
                .filter((id): id is number => id !== null);

            // Save pattern IDs for attribution
            const patternIds = patterns.map(p => p.id).filter((id): id is string => Boolean(id));

            // Persist the session UNCONDITIONALLY after a successful search — NOT gated on
            // pattern count. The session_id pinned on searchPatterns() must survive a
            // 0-pattern / early-exit path so a later ace_learn re-attaches it byte-identically
            // and the server can credit the retrieval (correlation invariant, see sessionStorage.ts).
            const prevTrajectory = getSession(sessionKey)?.trajectory ?? [];
            const searchStep = `Searched: "${query}"${task_intent ? ` (intent: ${task_intent})` : ''}`;
            saveSession(sessionKey, {
                session_id: sessionId,
                pattern_ids: patternIds,                                                    // may be empty
                query: query,
                timestamp: Date.now(),
                expires_at: Date.now() + SESSION_TTL,
                retrieval_id: result.retrieval_id,                                          // F-080 #16
                applied_log_ids: appliedLogIds.length > 0 ? appliedLogIds : undefined,      // F-080 #17
                trajectory: [...prevTrajectory, searchStep]
            });

            // Format verbose output matching CLI plugin style
            const domainFilter = allowed_domains
                ? ` in domain(s): ${allowed_domains}`
                : blocked_domains
                    ? ` (excluding: ${blocked_domains})`
                    : '';
            let output = `✅ **[ACE] Found ${count} relevant patterns**${domainFilter}\n\n`;

            if (count === 0) {
                output += `_No patterns found matching "${query}"_\n`;
            } else {
                // Show top 5 patterns with domain, preview, and isAtRisk badge (#24)
                patterns.slice(0, 5).forEach((rawP) => {
                    const p = decodePattern(rawP);
                    const domain = p.domain || 'general';
                    const preview = p.content.length > 80
                        ? p.content.slice(0, 80) + '...'
                        : p.content;
                    const riskBadge = p.isAtRisk ? ' ⚠️ at-risk' : '';
                    output += `• **[${domain}]**${riskBadge} ${preview}\n`;
                });

                if (count > 5) {
                    output += `\n_... and ${count - 5} more patterns_\n`;
                }

                // Show expanded neighbors hint when present (#24)
                const expanded = result.expanded ?? [];
                if (expanded.length > 0) {
                    const topExpanded = [...expanded]
                        .sort((a, b) => b.cumulative_reward - a.cumulative_reward)
                        .slice(0, 3);
                    output += `\n🔗 **Expanded neighbors (${expanded.length} via graph cache):** `;
                    output += topExpanded.map(e => `\`${e.pattern_id.slice(0, 8)}\``).join(', ');
                    output += ` — call \`ace_batch_get\` for full details\n`;
                }
            }

            // Show efficiency gain from metadata if available
            if (result.metadata?.efficiency_gain) {
                output += `\n💡 ${result.metadata.efficiency_gain} token efficiency\n`;
            }

            // Show session tracking info for pattern attribution
            if (patternIds.length > 0) {
                output += `\n🔗 Session: \`${sessionId}\` (${patternIds.length} patterns tracked for attribution)\n`;
            }

            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(output)
            ]);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(`❌ **[ACE] Search failed:** ${message}`)
            ]);
        }
    }
}
