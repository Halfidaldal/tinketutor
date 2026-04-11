# V2 Language And Localization Spec

> **Product:** TinkeTutor
> **Scope:** Danish-first UX with English fallback
> **Date:** 2026-04-10
> **Status:** Binding

---

## 1. Default Language Policy

TinkeTutor v2 is Danish-first.

That means:

- Danish is the default language for UI copy.
- Danish is the default language for tutor output.
- English exists as fallback and support language, not as the primary authored posture.

The product should feel native to a Danish learner first and merely accessible to English-speaking fallback cases second.

---

## 2. UI Localization Rules

1. New user-facing strings must be authored in Danish first.
2. English fallback strings must exist for all core flows.
3. Missing Danish copy may temporarily fall back to English, but missing English fallback should be treated as a release bug.
4. The app should not mix Danish and English within a single component unless fallback is unavoidable.
5. Internal technical terms may remain English in code, but user-facing labels should follow the terminology policy below.

---

## 3. Terminology Policy

| Product Concept | Preferred Danish UI Term | English Fallback | Policy |
|---|---|---|---|
| Tutor | tutor | tutor | Keep simple; do not overbrand every label |
| Workspace | arbejdsrum | workspace | Preferred user-facing container term |
| Sources | kilder | sources | Primary evidence term |
| Citation | kildehenvisning | citation | Use for trust/grounding UI |
| Quiz | quiz | quiz | Accept shared loanword |
| Gap / weak area | forståelseshul | knowledge gap | Use plain learner-facing phrasing |
| Notebook | notesbog/notebook | notebook | Avoid as primary marketing/navigation term; keep only where technically required |

### Terminology Guardrail

User-facing copy should avoid re-centering the product around "notebooks." If an internal object remains a `Notebook`, the visible UI should still prefer `arbejdsrum` or another tutor-aligned term unless there is a deliberate exception.

---

## 4. Tutor Output Language Rules

The tutor should default to Danish unless one of the following is true:

1. The user explicitly asks for English.
2. The study context is clearly English-language and the learner is working in English.
3. The tutor is quoting or preserving source material in another language.

Default rule:

> Tutor framing, explanation, and guidance are in Danish.

Override rule:

> If the source or user request strongly implies another language, the tutor may switch, but should do so deliberately rather than drifting.

---

## 5. Source-Language Behavior

Sources may be Danish or non-Danish. The product must preserve source truth.

Rules:

- Source excerpts in citations should be shown in the original source language.
- Tutor paraphrase may be in Danish even when the source excerpt is in English or another language.
- The system must not silently rewrite a source quote as if the translation were the original.
- If the source language differs from the tutor output language, the UI should make that understandable through labels or layout, not through hidden translation.

---

## 6. Citation Rendering Rules

Citation rendering should separate:

- UI chrome language
- tutor explanation language
- source excerpt language

Minimum behavior:

- citation labels, buttons, and metadata follow the active UI language
- quoted source passage remains in the original language
- page/section/source title metadata remains faithful to the source where possible

This prevents the system from making grounded evidence look more normalized than it really is.

---

## 7. Prompt Language Behavior

Prompt orchestration does not have to mirror the UI language exactly.

Approved v2 approach:

- system and developer prompts may stay in English if that yields clearer control and lower prompt ambiguity
- request payloads must carry explicit locale context such as `ui_locale`, `response_locale`, and `source_locale`
- output instructions must explicitly require Danish user-facing output by default

This allows the implementation to optimize model control without weakening the Danish-first product posture.

---

## 8. Fallback Behavior

### English Fallback

English fallback is acceptable when:

- a Danish translation is missing
- a user account preference explicitly chooses English
- support/debugging surfaces are temporarily untranslated during migration

### Not Acceptable

- defaulting whole new features to English because localization work was deferred
- letting tutor output drift into English because prompts were authored in English
- rendering mixed-language CTA labels in core study flows without a fallback reason

---

## 9. Implementation Implications

- Locale preference should become part of durable user state.
- Frontend should be authored to support Danish-first copy loading from the start.
- Tutor orchestration must carry locale state through every request.
- QA must review not only translation coverage, but also whether the experience still feels tutor-first and Danish-native after fallback behavior is applied.
