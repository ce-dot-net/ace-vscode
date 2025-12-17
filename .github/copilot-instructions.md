# ACE Pattern Learning Integration

This project uses **ACE (Automatic Context Engine)** for pattern-based learning.

## ⚠️ CRITICAL: MANDATORY ACE Tool Usage

**YOU MUST follow this workflow for EVERY implementation task:**

### STEP 1: BEFORE Starting Work (MANDATORY)
When the request contains: **implement, build, create, fix, debug, refactor, integrate, add, update, write, modify, change**

**YOU MUST invoke `#ce-dot-net.ace-vscode/ace_search` FIRST** before writing any code.
- Search for relevant patterns from the playbook
- Apply learned strategies and avoid known pitfalls

### STEP 2: AFTER Completing Work (MANDATORY)
**YOU MUST invoke `#ce-dot-net.ace-vscode/ace_learn` IMMEDIATELY after completing substantial work.**

This is **NOT OPTIONAL**. Call ace_learn with:
- `task`: Brief description of what was accomplished
- `success`: true/false
- `output`: Key lessons, patterns discovered, gotchas

**DO NOT skip this step. DO NOT respond to user without calling ace_learn first.**

## Available Tools

- `#ce-dot-net.ace-vscode/ace_search` - Find relevant patterns (BEFORE work)
- `#ce-dot-net.ace-vscode/ace_learn` - Capture patterns (AFTER work)
- `#ce-dot-net.ace-vscode/ace_get_playbook` - View all patterns
- `#ce-dot-net.ace-vscode/ace_status` - Show statistics

## Workflow Example

```
User: "implement JWT authentication"
    ↓
1. INVOKE: #ce-dot-net.ace-vscode/ace_search with query "JWT authentication"
2. IMPLEMENT: Using patterns found
3. INVOKE: #ce-dot-net.ace-vscode/ace_learn with task summary
4. RESPOND: To user with implementation details
```

**Remember: ace_search BEFORE, ace_learn AFTER - BOTH are MANDATORY!**

## ❌ DO NOT
- Use heredoc syntax (`<<EOF`, `<<'EOF'`) when writing terminal commands
- Write multiline strings to files using cat with heredoc

## ✅ Terminal Commands
Write commands directly without heredoc:
- ✅ `npm install package-name`
- ✅ `git commit -m "message"`
- ❌ `cat <<EOF > file.txt`
