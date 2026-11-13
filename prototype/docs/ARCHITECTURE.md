# Architecture decision record — 2026-11-13

## Product invariants

1. Real-life communication over gamification: no streaks, artificial points or vocabulary-only advancement.
2. Active participation over passive lessons: listening, speaking, reading and feedback throughout each session.
3. Adaptive mastery over curriculum completion: completion is never equivalent to durable proficiency.
4. French is an enabling bridge, faded when evidence supports it.
5. The learner controls camera and microphone; accessibility and dignity are first class.

## Target architecture (not implemented in this prototype)

```text
Laptop PWA (Next.js/React/TypeScript)
  | HTTPS app API (auth, user/session authorization, settings)
  |--- Curriculum service (versioned skill graph, prerequisites, lesson plans)
  |--- Instructional state machine (bounded actions, scaffolding policies)
  |--- Evidence/assessment service (audio/transcript/reading responses, confidence)
  |--- Memory service (skill state, spaced review, consented personal context)
  |--- AI orchestration service (model prompts, tool authorization, budgets)
  |--- Realtime voice session endpoint (server-created ephemeral WebRTC credentials)
  |--- Vision broker (user-initiated, context-limited frames; no default recording)
  |--- PostgreSQL (versioned learner record, encrypted at rest, audit/event history)
  |--- Observability (redacted structured logs, errors, usage, latency)
```

### Application boundary

- Browser never receives long-lived AI API secrets.
- Server validates identity, lesson state, tool calls, per-session limits, and policy before storing evidence or progressing skills.
- Realtime model may propose instructional actions but only an explicit controller can commit progression.
- Use an outbox/event log for resilient progress persistence, idempotent updates, and resume-after-interruption.
- Persist skill evidence independently from raw transcripts and media; raw media storage is opt-in, purpose-limited, time-limited.
- Secrets in managed secret store. Enforce authorization per learner and minimal retention.
- Version prompts, curriculum, scoring rubric, and teaching policies to support regression testing.

### Candidate tables

`learner(id, preferred_language, timezone, consent_version, created_at)`

`capability(id, curriculum_version, descriptor, prerequisites_json, modalities_json)`

`learning_session(id, learner_id, lesson_version, state, checkpoint_json, started_at, updated_at)`

`attempt(id, session_id, capability_id, prompt_variant, modality, assistance_level, response_metadata_json, created_at)`

`evidence(id, attempt_id, evaluation_source, confidence, rubric_version, outcome_json, reviewed_at)`

`capability_state(learner_id, capability_id, status, next_review_at, last_evidence_at, updated_at)`

`consent(id, learner_id, medium, granted, granted_at, withdrawn_at)`

`curriculum_event(id, learner_id, session_id, event_type, payload_json, idempotency_key, created_at)`

### Assessment integrity

- Silence could mean no response, mic failure, more thinking time, or confusion. Never infer a cause without probing.
- ASR text is not a reliable pronunciation score; audio needs separate assessment with calibrated confidence.
- A correct scripted introduction does not show transfer or retention. Use new speakers, wording and delayed reassessment.
- Store the actual kind and strength of evidence with assistance level and evaluator confidence.
- Add human review controls for any automated assessment claims.
- Test real-world comprehension periodically, including American English accents and varied speaking speeds.

### Vision policy

- Camera defaults off, and user can terminate it immediately.
- Request video only for explicit lesson activity or user opt-in; no emotion, intelligence or engagement inference from facial appearance.
- Process locally when possible; for AI interpretation request the learner's consent for a specific captured frame with a preview/confirmation and purpose.
- No background image analysis and no default raw video storage.

### Voice plan

- Production voice uses OpenAI Realtime API over WebRTC, with server-created ephemeral credentials per authenticated session.
- Support natural barge-in, turn-taking, echo handling and voice activity detection, plus user replay and slower speech.
- Implement fallback to text/keyboard and accessible subtitles.
- Investigate actual voice turn quality on the learner's laptop and network before declaring it ready.

### Deployment and operations

- Managed HTTPS hosting; managed PostgreSQL with backup restore tests; private authenticated access.
- CI lint/typecheck/unit tests/e2e tests; dependency scanning; browser and accessibility testing.
- Keep a feature flag for new model versions and a deterministic teaching fallback.
- Measure task success, comprehensibility, AI interruption accuracy, delayed retention, cost/session and crash-free sessions.

## Staged migration from this initial build

- **Current**: static browser prototype, localStorage, browser TTS and optional speech input, webcam preview.
- **Next**: Next.js + TS repository, auth, PostgreSQL persistence, explicit session state machine, Playwright tests.
- **Then**: realtime voice gateway, bounded instructional tools, educator-reviewed prompts and evaluation.
- **Then**: scoped image/vision actions, learner testing, hardening and private deployment.

## External documentation (checked 2026-11-13)

- https://developers.openai.com/api/docs/guides/realtime
- https://developers.openai.com/api/docs/guides/voice-webrtc
- https://nextjs.org/docs/app/guides/progressive-web-apps
- https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
