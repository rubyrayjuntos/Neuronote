# Serena Configuration - Optimized for NeuroNote

## Global Config (~/.serena/serena_config.yml)
- **Backend**: LSP (TypeScript language server)
- **Tool Timeout**: 300s (5 min for complex operations)
- **Max Answer Chars**: 200,000 (increased for large symbol bodies)
- **Web Dashboard**: Enabled at http://localhost:24282/dashboard/

## Project Config (.serena/project.yml)
- **Languages**: typescript, markdown
- **Initial Prompt**: Auto-injected context about NeuroNote architecture
- **Optional Tools**: execute_shell_command enabled
- **Ignored Paths**: node_modules, dist, .git, *.lock

## Key Serena Capabilities
1. **Symbol-level operations**: find_symbol, replace_symbol_body, insert_after_symbol
2. **Reference tracking**: find_referencing_symbols for safe refactoring
3. **Pattern search**: search_for_pattern for flexible codebase exploration
4. **Memories**: Persistent project knowledge across sessions

## JetBrains Plugin (Optional Upgrade)
For even better performance:
1. Install Serena plugin from JetBrains Marketplace
2. Set `language_backend: JetBrains` in serena_config.yml
3. Open project in WebStorm/IntelliJ
Benefits: External library indexing, faster execution, multi-language support

## Session Restart Required
Changes to project.yml require session restart to take effect.
