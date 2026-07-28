# _unused

Files in this directory are **quarantined, not deleted**. They are no longer imported
by any active code but are kept for reference.

## aiReal.ts
- **Moved:** July 28, 2026
- **Reason:** Stale model references (gemma-3, mistral-small, qwen3 — all removed from
  OpenRouter free tier as of July 2026). Superseded by `lib/ai.ts` which uses current
  free models + Gemini 2.5 Flash as primary provider.
- **Do NOT re-import** — it contains duplicate type definitions and outdated API logic.
