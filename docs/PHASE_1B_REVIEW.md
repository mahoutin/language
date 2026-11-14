# Phase 1B review · deterministic conversational tutoring simulation

Phase 1B turns the Phase 1A presentation shell into **one scripted tutoring conversation**. There is no AI, no realtime model, no avatar video and no backend. Daniel’s voice is the browser’s speech synthesis. His portrait is a still image. Every line, every repair and every reaction is pre-written. The purpose is to validate the interaction contract and the experience before any provider is integrated.

## Review outcome and corrections

Direction approved by the product owner (CI run 43654898234 passed). Decisions: Alex stays the transfer speaker with Maria in the preceding reading activity; `evidence.modality` is approved, and browser recognition is **not** treated as verified pronunciation; bare-name replies stay acknowledged and unpenalized, and `assess()` is not modified in Phase 1B.

Corrections made before merge, each with a regression test:

1. **Reduced choice no longer leaks the answer by position.** `narrowedOptions()` used to put the correct option second every time. The slot is now `reducedVariant(state) % 2`, where the variant advances with every earlier reduced-choice presentation in the session, starting from a per-session offset. It is deterministic (stable while a turn is on screen, testable) but the correct slot alternates across consecutive attempts, and the remaining distractor rotates. Tests: alternation across three activities in one session, determinism per session, variation between sessions, both slots and distractors covered, stability under help/replay/captions.
2. **390 px overlap fixed.** At phone width, or on short viewports, the stage is exactly one viewport tall and only the card scrolls, between the header/self-view and the dock. The dock no longer floats over content, and short landscape screens keep the card beside the self-view. Test: in the densest repair state at 390×844, 360×640 and 640×360, every control and heading is scrolled into view and must not intersect the dock or the self-view. I confirmed the test fails against the previous CSS at all three sizes (it also exposed a self-view overlap at 640×360).
3. **Recap wording.** “Trop courtes pour être comprises” implied that a short name was unintelligible. A bare word is now counted separately (`partial`) and described as understandable: « Vous avez parfois répondu par un seul mot, par exemple votre prénom. C’est compréhensible : je vous ai simplement proposé une phrase complète. » Only genuinely unreadable input (symbols, a single letter) is reported separately, without blame. A bare name no longer adds a “to rework” target. Tests assert the wording and forbid “trop courtes”, “incompréhensible”, “illisible” and “erreur” in the bare-name recap.

## What works, what is simulated, what does not exist

| Working | Simulated (scripted, labelled as such) | Not built |
| --- | --- | --- |
| One persistent session: welcome → model → meaning checks → learner turn → repair → transfer → recap | Daniel’s dialogue and reactions (fixed French copy and the five curriculum lines) | Any AI response, understanding of free speech, or generated explanation |
| Typed answers, choices, optional browser speech recognition (opt-in per exercise) | Tutor voice = browser TTS. The stage reads « Séance guidée · simulation » and « Portrait d’illustration · dialogue préparé » | Live video, lip-sync, continuous listening, barge-in by speech |
| Thinking time, explicit pause, interruption, replay, slower replay, French help, “Je ne comprends pas” | Repair is a fixed ladder of different methods (not chosen by a model) | Automatic fading of English/French aids (later phase) |
| Existing five activities, evidence schema and local-only storage | The Maria / Alex situations are fixed curriculum lines | Server, accounts, database, cost controls |

## How the nine-step lifecycle maps onto the curriculum

The five activity ids, their order, content and `assess()` are untouched. The conversation is a layer around them.

| Step in the handoff | Conversation beat | Curriculum activity (authority) | Phase |
| --- | --- | --- | --- |
| 1 Arrival and orientation | French welcome, « Commencer » | none (no evidence) | `orientation` |
| 2 Tutor modelling | Daniel: “Hello! My name is Daniel.” + French + context | `listen-greeting` (shown, then meaning check) | `model` → `guided_attempt` |
| 3 Tutor invites participation | Daniel asks “What is your name?” | `listen-question` (meaning check) | `guided_attempt` |
| 4 Learner responds | The learner’s turn, typed / recognised text | `say-name` | `guided_attempt` |
| 5 Thinking pause | Quiet, never an outcome | — | media `thinking_pause` |
| 6 Interruption / help | Stop voice, replay, slower, French help | — (not an answer) | any |
| 7 Adaptive repair | Ladders below | attempts at the same activity | `scaffolded_retry`, `diagnostic_probe` |
| 8 Transfer | Daniel introduces Maria (read), then Alex asks “And you?” | `read-intro`, `transfer` | `guided_attempt`, `transfer_attempt` |
| 9 Natural conclusion | Recap with observed difficulty and a caveat | none | `recap` |

Deviation to review: the handoff suggests Maria as the transfer speaker. Preserving curriculum content meant keeping the existing `transfer` line (“Hi there! I’m Alex. And you?”). Maria appears in the step just before (`read-intro`), introduced by Daniel as a new person. Changing the transfer wording would change the meaning of existing evidence, so it needs your approval.

### Repair ladders (each rung is a different method)

| Activity type | 1st miss | 2nd | 3rd | after |
| --- | --- | --- | --- | --- |
| Choice (listening / reading) | slower audio + French meaning | **two** options instead of three (the correct one’s slot alternates between attempts) | French explanation + offer to continue without evaluation | the offer stays; message changes instead of repeating |
| Speak (`say-name`, `transfer`) | slower audio + French meaning | sentence frame with a gap (« My name is … ») | **diagnostic probe**: pick the sentence that answers the question (not scored, never written) | supported retry with explanation, then offer to continue |

“Je ne comprends pas” climbs the same ladder without counting as an error. Replay, slower replay and opening Aide never climb it.

## State architecture

Three independent dimensions plus a lifecycle, in `src/domain/conversation/`:

- **Media** (`MediaState`): `idle`, `tutor_speaking`, `listening_open`, `learner_speaking`, `thinking_pause`, `processing`, `interrupted`, `recovering`, `ended`. `tutor_speaking` is set only when the browser reports that audio actually started. `listening_open` means the learner’s turn is open in any modality; it does not mean the microphone is on (that is `learner_speaking`).
- **Pedagogical phase**: `orientation`, `model`, `guided_attempt`, `diagnostic_probe`, `scaffolded_retry`, `transfer_attempt`, `recap`. Always derived from activity, step and strategy, never set independently.
- **Overlays** (`visibleOverlays`): derived, not stored: English caption, French support, context note, replay controls, visual choice, French help, feedback, device notice. Only what the current moment needs is shown.
- **Lifecycle**: `active`, `paused`, `ended`. An explicit pause is **not** a media state and not thinking time.

`step(state, event) → { state, effects, ignored? }` is pure. `invariantViolations(state)` lists impossible combinations (for example `tutor_speaking` without an output id, a pause with live media, or a pending commit that is not `processing`). The unit tests assert it after every event.

### Authority

```
event source (UI, audio, timer)  →  step()  →  effects
                                              └─ commit {answer | skip | restart}
                                                    │  executed by transition() in learner.ts
                                                    ▼
                                    commit_result {advanced, correct, rejected}  →  step()
```

The conversation never writes progress. It proposes a `commit`, the existing learning engine decides, and the conversation advances only on the reported result. A rejected commit enters recovery instead of advancing. This is the same boundary a future model would use: it would be another event source and could only ever propose.

### Staleness and duplicates

Every event carries `eventId`, `sessionId` and `turnId`. The reducer drops: another session, a repeated `eventId`, anything after the end, anything but resume/exit while paused, and turn-scoped events (audio callbacks, silence check-in, recognition, commit results) from an earlier turn. Each tutor line has its own output id, so the late end-of-audio of an interrupted or replaced line changes nothing. Recognised text belongs to the turn in which listening began. Ignored events return the *same* state object and a reason (`stale_turn`, `duplicate`, `paused`, `invalid_in_state`, …).

## Evidence and data protection

- No new database, no migration, no change to ids, storage key, schema version or `assess()`.
- One additive, optional field: `evidence.modality` (`typed` | `browser-recognition`), because a typed answer and one produced by speech recognition (then confirmed by the learner) are different observations. Every earlier v1 and v2 record still parses unchanged; unknown values are rejected. Choice answers carry no modality. `browser-recognition` only records how the text arrived; it is never evidence of verified pronunciation or intelligibility, and the recap says so.
- Recorded: submitted answers (correct or incorrect) and explicit skips. Not recorded: help and replay requests, the diagnostic probe, unclear or bare-word replies, silence, thinking, interruptions, device failures. These stay in session memory and feed only the recap.
- A bare single word (for example a name alone) is acknowledged and the tutor invites a short sentence; it is **not** recorded as incorrect. Two non-answers in a row make the tutor change method instead of repeating itself. `assess()` itself is unchanged, so “I’m Alex” and “My name is Alex” are accepted as before and nothing about earlier evidence changes meaning.
- Every Phase 1B answer is stored `assisted: true`, because English and French support are visible from the start. This matches Phase 1A.
- Raw answer text is never persisted (tested).
- The recap reports what was practised and what was observed in this simulated session. It states that the answers were aided and is not proof of mastery or a pronunciation assessment (tested to avoid mastery wording).

## Figma references

Page 02: [6:35](https://www.figma.com/design/GV3y4FmpF1C8CIqFMcurfa?node-id=6-35) conversation, [6:72](https://www.figma.com/design/GV3y4FmpF1C8CIqFMcurfa?node-id=6-72) listening, [6:114](https://www.figma.com/design/GV3y4FmpF1C8CIqFMcurfa?node-id=6-114) response, [6:154](https://www.figma.com/design/GV3y4FmpF1C8CIqFMcurfa?node-id=6-154) French help (whole overlay turns pale), [6:194](https://www.figma.com/design/GV3y4FmpF1C8CIqFMcurfa?node-id=6-194) repair (inspected directly). Page 03: [10:32](https://www.figma.com/design/GV3y4FmpF1C8CIqFMcurfa?node-id=10-32) arrival → [10:80](https://www.figma.com/design/GV3y4FmpF1C8CIqFMcurfa?node-id=10-80) reflect and close. Page 04: [13:34](https://www.figma.com/design/GV3y4FmpF1C8CIqFMcurfa?node-id=13-34) tutor speaking (inspected directly), [13:47](https://www.figma.com/design/GV3y4FmpF1C8CIqFMcurfa?node-id=13-47) listening, [13:60](https://www.figma.com/design/GV3y4FmpF1C8CIqFMcurfa?node-id=13-60) learner speaking, [13:73](https://www.figma.com/design/GV3y4FmpF1C8CIqFMcurfa?node-id=13-73) thinking pause, [13:86](https://www.figma.com/design/GV3y4FmpF1C8CIqFMcurfa?node-id=13-86) interruption, [13:99](https://www.figma.com/design/GV3y4FmpF1C8CIqFMcurfa?node-id=13-99) repair/resume.

I opened frames 13:34 and 6:194 through the Figma connector. The others were taken from the repository’s [experience map](EXPERIENCE_TO_CODE_MAP.md), which records the earlier read-only inspection of pages 02–04; I did not re-inspect them this session.

| Page 04 state | Implementation |
| --- | --- |
| 13:34 Tutor speaking | media `tutor_speaking`, « Arrêter la voix » |
| 13:47 Listening open | media `listening_open`, « À vous » |
| 13:60 Learner speaking | media `learner_speaking` (only while browser recognition is listening) |
| 13:73 Thinking pause | media `thinking_pause`: « J’ai besoin d’un moment », or a quiet check-in after 30 s |
| 13:86 Interruption | media `interrupted`: voice stops, French explanation opens |
| 13:99 Repair / resume | phases `scaffolded_retry` / `diagnostic_probe`, then a fresh turn |

## Files

New: `src/domain/conversation/{types,script,machine,summary}.ts` (pure), `src/components/{use-conversation.ts,tutor-card.tsx}`, `tests/unit/conversation.test.ts`, `tests/e2e/{conversation.spec.ts,helpers.ts}`.
Changed: `src/components/tutor-session.tsx` (one persistent session), `tutor-session.module.css`, `learning-app.tsx` (commit callback; unreachable dashboard completion screen removed, the recap replaces it), `media-tools.tsx` (`playSpeech` with start/end/error and language; speech-input signals), `src/domain/learner.ts` (optional `modality`), the two Phase 1A browser specs and the Pages spec (new entry flow only; media-release assertions unchanged).

## Privacy and accessibility

- Nothing is requested on load: no microphone, no camera, no automatic audio (asserted by a test that counts device requests). Audio plays only as a direct result of a learner action (Commencer, Continuer, an answer, or a replay).
- Recognition stays opt-in per exercise with the same consent text. A hard microphone failure closes the speech panel, aborting recognition and revoking that consent, and shows one clear French message with « Écrire ma réponse ». Pause, exit and a hidden tab release audio, recognition and camera. Resuming never restarts audio or the microphone.
- Silence never produces an outcome. After 30 s of an open, quiet turn the tutor only offers help; it does not count, repair, pause, or advance (unit and browser tests).
- English phrases carry `lang="en"` inside the French interface. Status and feedback are polite live regions. Each new step moves focus to its heading. Every control has a visible name and a focus ring. The French help card changes the whole overlay’s colour tokens so every control keeps its contrast.
- No new motion was introduced, so there is nothing to disable for reduced motion.

## Known limitations and untested assumptions

- Real voice quality, real speech recognition accuracy and the actual laptop are **not** established. Automated tests use a deterministic speech stub and a stub recognizer. The prior Phase 1A limit still stands: operating-system capture indicators under live permission revocation were not individually verified.
- Browser speech synthesis can be silent, or never report that it ended. The learner is then never blocked: “Arrêter la voix”, “J’ai besoin d’un moment”, typing and answering all work while the status still says Daniel is speaking.
- At 1280 × 720 every state fits without scrolling and the dock stays visible. The densest repair state (French help open plus a sentence frame) covers the lower part of Daniel’s face. At phone width and on short viewports the card scrolls inside its own area above the dock; reading the whole card there means scrolling it.
- The self-view is a compact tile on narrow screens (space is reserved, and tested, so it never covers text).
- Fixed French copy was written for this simulation and has not had a native-speaker review.
- The heuristic `assess()` accepts some non-introductions that happen to match “I am …” (for example “I am fine”). That is existing curriculum behaviour and was deliberately not changed here.
- The pause when the tab is hidden is automatic and explicit (the learner presses « Reprendre »).

## Follow-up recommendations

1. Product-owner walkthrough on the real laptop with real browser voices, then decide whether the French copy and the Maria/Alex transfer choice are right.
2. Decide whether a bare name should count as a successful introduction. It would change `assess()` and therefore evidence semantics, so it needs an explicit decision and a versioned change.
3. Phase 2 can reuse `step()` unchanged behind a server-side session controller; `commit` effects map directly to authoritative writes.
