# Command Wrapper Reference Removal - 2026-07-13

## Scope

The user confirmed that the former shell command wrapper was removed and explicitly requested that
all repository references be removed. This is a documentation/tooling cleanup separate from
Production Readiness Phase 1 tournament behavior.

## Plan

1. Inventory every case-insensitive reference across tracked source, scripts, current docs, and
   historical docs.
2. Replace wrapped command examples with direct commands while preserving their arguments and
   historical pass/fail meaning.
3. Replace the `AGENTS.md` wrapper rule with direct-command guidance.
4. Update scripts that generate command instructions or audit documents.
5. Remove obsolete prose about requiring the wrapper without rewriting unrelated historical
   conclusions.
6. Verify a repository-wide case-insensitive search returns no references.
7. Run formatting/diff checks and include the cleanup in the same reviewed PR, but keep its scope
   distinct in the summary and commit message/body.

## Review Risks

- Do not remove command names or arguments after the wrapper prefix.
- Do not change tournament requirements, old check outcomes, dates, PR references, or evidence.
- Preserve PowerShell/Bash syntax and generated-script output.
- Include archived documentation because the user requested all references, but make only the
  mechanical wrapper cleanup there.

## Verification

```bash
rg -n -i "\\b<removed-wrapper-name>\\b" -g '!node_modules/**' -g '!.git/**' .
git diff --check
```

The search must return no matches. Relevant scripts and the standard repository gates are rerun as
part of the enclosing delivery.
