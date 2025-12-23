# NeuroNote TODO List

## Pending Items

### TODO #1: Token Usage in App Telemetry
**Priority:** Medium  
**Added:** 2024-12-23

Currently token usage is logged to console only. Should be surfaced in the app UI so users can see:
- `prompt_tokens` - tokens sent to AI
- `completion_tokens` - tokens received from AI  
- `total_tokens` - combined total

**Files to modify:**
- `services/ai/groq.ts` - emit telemetry event instead of just console.log
- `services/ai/gemini.ts` - emit telemetry event
- `services/ai/bedrock.ts` - emit telemetry event
- `services/observability.ts` or new telemetry service - aggregate and expose
- `App.tsx` or new component - display in UI

---

### TODO #2: SerenaBridge Telemetry
**Priority:** Medium  
**Added:** 2024-12-23

Track SerenaBridge two-phase retrieval usage:
- When menu is sent (Phase 1) - log/emit event
- When full specs are requested (Phase 2) - log/emit event
- Track which operators are most frequently requested

**Files to modify:**
- `services/SerenaBridge.ts` - add telemetry hooks to `buildMenuPrompt()` and `buildSpecsPrompt()`
- Create telemetry aggregation for operator usage patterns

---

### TODO #3: Hybrid Prompt Mode Investigation
**Priority:** Low  
**Added:** 2024-12-23

The hybrid prompt mode (`featuredOperators`) was implemented but needs more work:
- JSON structure improved vs `useMenu: true`
- But token usage increased and AI used wrong casing (`input.audio` vs `Input.Audio`)
- May work better with different models (Claude, GPT-4)
- Consider adding UI component types to the featured examples

**Files:**
- `services/SerenaBridge.ts` - `buildHybridPrompt()` implemented
- `services/ai/types.ts` - `featuredOperators` option added
- `services/ai/promptBuilder.ts` - hybrid mode supported

---

### TODO #4: Auto-Repair Layer ✅ COMPLETED
**Priority:** High  
**Added:** 2024-12-23  
**Completed:** 2024-12-23

Implemented `repairProposal()` function that fixes common AI mistakes before Zod validation:
- Fixes casing issues (`input.audio` → `Input.Audio`)
- Converts invalid `children` values to empty arrays
- Logs all applied fixes
- Builds structured feedback for AI self-correction

**Files modified:**
- `schemas/index.ts` - Added `repairProposal()` and `buildRepairFeedback()`
- `services/ai/groq.ts` - Integrated repair before validation
- `services/ai/gemini.ts` - Integrated repair before validation
- `services/ai/bedrock.ts` - Integrated repair before validation
- `schemas/schemas.test.ts` - Added 8 tests for repair functionality

**Test count:** 322 passing (up from 314)

---

## Completed Items
(Move items here when done)

