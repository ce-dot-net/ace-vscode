---
name: ace-pattern-learning
description: "Search ACE playbook before implementing, building, fixing, debugging, or refactoring code. Capture patterns after completing substantial coding work."
---
# ACE Pattern Learning Skill

This skill provides pattern-based learning for coding tasks.

## When This Skill Activates

Copilot will automatically load this skill when your request contains:
- **Implementation**: implement, build, create, add, develop, write
- **Modification**: update, modify, change, edit, enhance, extend
- **Debugging**: debug, fix, troubleshoot, resolve, diagnose
- **Refactoring**: refactor, optimize, improve, restructure
- **Integration**: integrate, connect, setup, configure

## BEFORE Starting Work (MANDATORY)

**INVOKE**: `ace_search` with relevant query

Search for patterns from previous work before implementing:
- Proven solutions and best practices
- Known gotchas and pitfalls to avoid
- Recommended APIs and libraries

## AFTER Completing Work (MANDATORY)

**INVOKE**: `ace_learn` with:
- `task`: Brief description of what was accomplished
- `success`: true/false
- `output`: Start with `TIME_SAVED: Xm | reason`, then key lessons, patterns discovered, gotchas

**FAILURE TO CALL ace_learn = INCOMPLETE TASK**

## Continuous Re-Search (Domain Shift Detection)

Call `ace_search` AGAIN during work when:
- **Topic shift**: New domain mentioned (auth->caching, API->database, frontend->backend)
- **Extended work**: After 5+ tool calls without re-searching
- **Errors**: Hitting errors in a different area than original task
- **New context**: Switching file types or directories
- **Task shift**: User asks about something not covered by previous search

## Domain-Filtered Search

After topic change detection, use domain filtering for targeted retrieval:
1. **List domains**: `/domains` to see available domains
2. **Match topic to domain**: Find domain name matching new topic
3. **Filtered search**: `ace_search <query> allowed_domains=<domain>`
