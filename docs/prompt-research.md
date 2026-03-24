# Skill Generation Prompt Research — 2026-03-23

Sources: Anthropic skill-creator (486-line SKILL.md), claude-reflect, agentskills.io spec, platform.claude.com best practices

## Key Findings Applied to buildSkillPrompt()

1. Descriptions must be "pushy" — 100-200 words, imperative framing, trigger keywords
2. Two-shot examples (simple + complex) to calibrate output complexity
3. Self-validation checklist in prompt
4. WHY behind every rule (not just WHAT)
5. Generalize from specific patterns, don't just wrap commands

## Not Yet Applied — Next Iteration

- Description optimization loop (improve_description.py pattern — train/test split, 5 iterations)
- Correction capture from conversation history (claude-reflect regex + semantic detection)
- /reflect-skills semantic pattern discovery (intent similarity > keyword matching)
- MCP tool annotations (readOnlyHint, destructiveHint, idempotentHint)
- Progressive disclosure budget enforcement (<5000 tokens body)
- Iterative dev with two Claude instances (designer + tester)

## Full research output: 500K+ chars archived in brain repo Memory Engine
