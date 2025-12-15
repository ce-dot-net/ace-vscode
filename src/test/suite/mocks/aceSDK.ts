/**
 * ACE SDK mocks for unit testing
 */

import type { PlaybookBullet, BulletSection } from '@ace-sdk/core';

export interface MockSearchResult {
    similar_patterns: PlaybookBullet[];
    metadata?: {
        efficiency_gain?: string;
    };
}

export interface MockLearnResult {
    learning_statistics?: {
        patterns_created?: number;
        patterns_updated?: number;
        patterns_pruned?: number;
        average_confidence?: number;
        by_section?: Record<string, number>;
        analysis_time_seconds?: number;
    };
}

export interface MockStatusResult {
    total_patterns?: number;
    total_bullets?: number;
    avg_confidence?: number;
    by_section?: Record<string, number>;
    top_helpful?: PlaybookBullet[];
}

export interface MockPlaybookResult {
    playbook: Record<BulletSection, PlaybookBullet[]>;
    total_bullets: number;
}

export class MockAceClient {
    private searchResult: MockSearchResult = { similar_patterns: [] };
    private learnResult: MockLearnResult = {};
    private statusResult: MockStatusResult = { total_patterns: 0 };
    private playbookResult: MockPlaybookResult = {
        playbook: {
            strategies_and_hard_rules: [],
            useful_code_snippets: [],
            troubleshooting_and_pitfalls: [],
            apis_to_use: []
        },
        total_bullets: 0
    };
    private shouldThrow = false;
    private errorMessage = 'Mock error';

    setSearchResult(result: MockSearchResult) {
        this.searchResult = result;
    }

    setLearnResult(result: MockLearnResult) {
        this.learnResult = result;
    }

    setStatusResult(result: MockStatusResult) {
        this.statusResult = result;
    }

    setPlaybookResult(result: MockPlaybookResult) {
        this.playbookResult = result;
    }

    setShouldThrow(should: boolean, message = 'Mock error') {
        this.shouldThrow = should;
        this.errorMessage = message;
    }

    async searchPatterns(_params: { query: string; threshold?: number; top_k?: number; include_metadata?: boolean }) {
        if (this.shouldThrow) {
            throw new Error(this.errorMessage);
        }
        return this.searchResult;
    }

    async storeExecutionTrace(_trace: unknown) {
        if (this.shouldThrow) {
            throw new Error(this.errorMessage);
        }
        return this.learnResult;
    }

    async getStatus() {
        if (this.shouldThrow) {
            throw new Error(this.errorMessage);
        }
        return this.statusResult;
    }

    async getPlaybook(_params?: { include_metadata?: boolean }) {
        if (this.shouldThrow) {
            throw new Error(this.errorMessage);
        }
        return this.playbookResult;
    }
}

// Helper to create mock playbook bullets
export function createMockBullet(overrides: Partial<PlaybookBullet> = {}): PlaybookBullet {
    return {
        id: `bullet_${Math.random().toString(36).slice(2, 9)}`,
        content: 'Test pattern content',
        section: 'strategies_and_hard_rules',
        helpful: 1,
        harmful: 0,
        domain: 'test-domain',
        ...overrides
    } as PlaybookBullet;
}

// Helper to create multiple mock bullets
export function createMockBullets(count: number, section?: BulletSection): PlaybookBullet[] {
    return Array.from({ length: count }, (_, i) => createMockBullet({
        content: `Test pattern ${i + 1}`,
        section: section || 'strategies_and_hard_rules',
        helpful: i,
        domain: `domain-${i}`
    }));
}
