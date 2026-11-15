# Phase 1B · acceptance package

For the product owner’s decision: is the conversational experience acceptable, or does it need refinement before merging? Companion to [PHASE_1B_REVIEW.md](PHASE_1B_REVIEW.md) (architecture, mapping, state model).

**Reviewed commit:** code at `5e9ba07` (CI green: [run 43655474192](https://github.com/mahoutin/language/actions/runs/43655474192)). Later commits on the branch only add this document.
**Nothing here is AI.** Daniel is scripted. The voice is your browser’s speech synthesis; the portrait is a still photo.

---

## 1. Run it on your Mac

You already have Node 24 (the repo’s `.nvmrc`). In Terminal:

```sh
cd ~/Desktop/language
git fetch origin
git switch feat/phase-1b-conversation-flow
npm ci
npm run dev
```

Open **http://127.0.0.1:3000** in **Chrome** (the browser the automated tests use). Stop with `Ctrl-C`. To return to the previous state: `git switch main`.

- **Real sound:** unmute the Mac. Browsers use the system voices. For better ones: System Settings → Accessibility → Spoken Content → System Voice → Manage Voices, and add an English (US) and a French voice.
- **Production-like run** (what is deployed to Pages is built this way): `npm run build && npm start`, same address. If you ever ran another build on the same address, unregister its service worker first (DevTools → Application → Service Workers → Unregister), otherwise Chrome may show the old page once.
- **Start over:** progress is kept in this browser for this address only. Finish a session and press « Pratiquer à nouveau », or open « Mes progrès » → « Effacer mes progrès », or use a Private window. Existing Phase 1A progress, if any, is picked up (« Content de vous revoir ! »), which is itself worth testing.
- **Automated checks** (optional, about two minutes): `npm run check`, then `npx playwright install chromium` (first time only) and `npm run test:e2e`. Run `npm run build` before `test:e2e` if you just ran `build:pages`, and make sure nothing is listening on port 3100.
- **Not tested by me:** Safari, Firefox, real Mac voices. Please say which browser you used.

---

## 2. Acceptance walkthrough (about 12 minutes)

Do it once as the learner would, wrong answers included. Each row says what to do, what you should see, and what would make you reject it.

### A. French welcome
1. Open the app, press « Commencer la leçon ».
   **See:** a calm French welcome from Daniel (« Bonjour, je suis Daniel. »). No sound, no microphone or camera permission prompt. « Aide » is greyed out. The stage says « Séance guidée · simulation » and « Portrait d’illustration · dialogue préparé ».
2. Press « Écouter le message ».
   **See:** a French voice reads the welcome; the status says Daniel is speaking.
   **Reject if:** anything speaks or asks for a device before you press something.

### B. Modeling
3. Press « Commencer ».
   **See:** Daniel says “Hello! My name is Daniel.” aloud, with the English line, the French meaning and a one-line context, all visible at once.
4. Press « Sous-titres » (English hides, French stays). Press it again. Press « Aide » (the whole card turns pale with a French explanation), then close it. Press « Écouter » and « Plus lentement ».
   **Reject if:** French ever disappears, or Captions and Aide behave like one control.
5. Press « Continuer ».

### C. Meaning check and repair (listening)
6. Choose « Ordering food », « Répondre ».
   **See:** a *slower* replay plus the French translation, in a pale card. Not a repeat of the same text.
7. Choose « Ordering food » again.
   **See:** only **two** choices left. Do this later on another listening step too and watch whether the right answer’s position changes.
8. Choose « Introducing himself ».
   **See:** a short French acknowledgement, and Daniel says “What is your name?”.

### D. Interruption
9. While Daniel is speaking, press « Arrêter la voix ».
   **See:** the voice stops at once; status « J’ai arrêté de parler »; the French explanation opens by itself. « Plus lentement » replays slowly. « Je suis prêt » resumes.
10. Choose « Your name », « Répondre ». (Optional: pick a wrong answer twice first to see the two-choice screen again and whether the right answer’s position changed.)

### E. The learner’s turn: thinking, pause, help
11. **Do nothing for 35 seconds.**
    **See:** after 30 s a quiet offer (« Je suis toujours là… »). No error, no repair, nothing advances.
12. Type `Alex`, press « Répondre ».
    **See:** « J’ai compris un mot, merci » and an invitation to try a short sentence. Not an error (check « Mes progrès » at the end: it is not recorded).
13. Press « J’ai besoin d’un moment » → calm message; « Je suis prêt » → back.
14. Type `My name`, press « Pause ».
    **See:** « Séance en pause », devices off. Press « Reprendre »: your text `My name` is still there.
15. Press « Aide », then « Écouter ». Close « Aide ».
    **Reject if:** your typed text changes, or any of this counts as a mistake.

### F. Repair (speaking)
16. Replace the text with `Yes please`, « Répondre » three times, reading each screen:
    1. slower audio + the French translation of the question;
    2. a sentence frame with a gap (« Exemple : « My name is Daniel. » · À vous : « My name is … » »);
    3. a **different kind of task**: « Quelle phrase répond à « What is your name? » ? », three choices, not scored.
17. Choose « My name is Sam. » → « Bien vu. Maintenant, essayez avec votre prénom. ».
18. Type `My name is` + your own first name, « Répondre ».
    **Reject if:** any step merely repeats the previous one, or the tutor stops offering a way forward.

### G. Transfer
19. **See:** « Je vous présente Maria… » and Maria’s written line; choose « Maria ».
20. **See:** « Une nouvelle rencontre. Les mots changent, la situation reste la même. », Alex’s different line “Hi there! I’m Alex. And you?”, an empty field, no example on display. Answer with a short sentence (`I'm …`).
    **Reject if:** you can answer by copying something on screen.

### H. Conclusion
21. **See:** « Merci pour cette séance ! », what was practised, what was harder (your repair steps), and a note that the answers were aided and are not proof of mastery.
    **Reject if:** it says or implies that you “mastered” anything, or that a short name was a problem.
22. « Terminer la séance » → « Mes progrès » → « Télécharger mes progrès ». Open the file: about 10 observations on this exact path (3 for the first meaning check, 1, 4 for the speaking turn, 1, 1; « Alex » and the probe are not among them), `modality: "typed"` on the speaking ones, and **no** answer text.

### I. Things that go wrong on purpose
| Try | Expected |
| --- | --- |
| Speaking turn → « Micro », tick the consent box, « Parler en anglais », **Block** the permission in Chrome | One French message, the panel closes, « Écrire ma réponse » puts the cursor in the field. Nothing recorded. |
| « Caméra », then **Block** | « Vous pouvez continuer sans caméra. » The conversation is unaffected. |
| Allow the camera, then « Pause » | The camera light goes off. « Reprendre » does **not** turn it back on. |
| Switch to another browser tab for a few seconds, come back | The session is **paused** (« Reprendre »). This is intentional. |
| Reload in the middle | « Content de vous revoir ! », resumes at the right activity. |
| Keyboard only (Tab, Space, Enter) through one meaning check | Every control reachable, visible focus ring, heading takes focus at each new step. |
| Resize the window narrow | The card scrolls inside; the dock is never covered. |

### J. Your verdict
Answer honestly, in this order: (1) Did it feel like *one conversation* from welcome to goodbye? (2) Would your father know what to do at every step without reading much? (3) Was French support enough at the start? (4) Did the repair feel like a patient tutor changing approach? (5) Was anything too dense, too fast or too much like a test?

---

## 3. UX problems that work against “one continuous conversation”

Honest ranking, most damaging first. These are not defects (everything works as specified), but you should weigh them before accepting.

1. **Every step is still a form.** Each question shows a radio group (or a text field), a « Répondre » button, and up to five secondary buttons (replay ×2, « Je ne comprends pas », « J’ai besoin d’un moment », « Passer sans évaluation »), plus six dock controls. That is 12 buttons on one screen. It reads like a quiz, not like someone talking to him.
2. **Daniel only speaks the English target line.** Every reaction (acknowledgements, repair explanations, the quiet check-in, the recap) is silent text in a small card. The tutor “talks” when teaching content and “goes silent” when reacting, which is the opposite of a conversation. The spoken part is the easy part to add; I did not, to stay inside the approved scope.
3. **One voice for Daniel, Maria and Alex.** Only a small name chip changes. The “different speaker” in the transfer is real in the script but weak in the experience.
4. **The meaning checks are gates.** The English line and its French translation are both on screen when he is asked what it means, so the answer is visible. And Daniel asks “What is your name?” twice back to back (once to check understanding, once for the real answer), because both are existing curriculum activities I was told not to change.
5. **Daniel never uses what the learner said.** No “Nice to meet you, Alex.” The app deliberately never stores answer text; keeping it in memory for the session only is possible, but it is a privacy decision for you.
6. **Speaking takes four steps** (Micro → consent checkbox → « Parler en anglais » → « Répondre »), re-asked for every exercise. There is no natural turn-taking; that needs the later realtime work.
7. **The screen never changes shape.** Same card in the same place on every step, a still photo, and status shown as text. In the densest repair state the card covers the lower half of Daniel’s face.
8. **The French welcome is a ~45-word paragraph.** Fine for a French reader, but long for a first screen.
9. **« Passer sans évaluation » is always visible.** Useful and honest, but it invites skipping at the first difficulty; the Figma frames I inspected show no such button.
10. **The tab-hidden auto-pause** will surprise anyone who looks something up mid-session.

Cheap refinements I would consider, none implemented (each needs your call): speak the French reactions with a French voice; one tap on a choice answers (drop « Répondre » for choices); move the secondary buttons behind « Aide »; merge the two “What is your name?” steps in the script (a curriculum change); keep the learner’s first name in session memory only.

---

## 4. Unresolved defects, privacy, accessibility, Figma

### Defects and untested ground
- **No open functional defect** in the paths tested: 82 unit tests; 37 browser tests (74/74 over two repeats); Pages test; CI green. “Tested” means scripted browsers with a **fake voice and fake recognizer**.
- **Not verified:** Safari/WebKit (the installed WebKit build does not match this Playwright version, and you asked me not to install more tools), Firefox (has no speech recognition), real Mac voices, real recognition accuracy, VoiceOver, OS capture indicators under live permission revocation (carried over from Phase 1A).
- If a browser’s speech synthesis never reports “ended”, the status can keep saying Daniel is speaking. You are never blocked (stop the voice, ask for a moment, type, answer all work).
- `assess()` still accepts a few non-introductions that happen to match “I am …” (for example “I am fine”). Existing behaviour, deliberately untouched.
- The French copy has not had a native-speaker review.

### Privacy
- The app makes **no network requests of its own** (checked: no `fetch`, beacon or socket in the code). No analytics, no AI.
- Nothing is requested on page load. Microphone use is opt-in per exercise, with the existing consent text. **Chrome sends recognised audio to Google’s speech service, and some system or cloud voices may use the network for synthesis**; the panel already says the browser may transmit audio.
- Stored locally, as before: the learner record. New: an optional `modality` label (`typed` / `browser-recognition`). Never stored: answer text, audio, video. Unsaved session memory (draft text and counters) disappears on reload.
- Camera stays off by default, preview only, no capture. Pause, exit, hidden tab and permission loss release audio, recognition and camera.

### Accessibility
- Measured contrast of the card colours: 6.5:1 to 14.2:1 for every text/background pair (AA needs 4.5:1), including the pale Aide card.
- Tested: keyboard-only answer path, accessible names on every control, a visible focus ring of at least 2 px, `lang="en"` on English phrases, heading focus at each step, no horizontal scroll from 360 px up, nothing under the dock or self-view at 390×844, 360×640 and 640×360. No new animation.
- **Not tested with a screen reader.** Several elements are polite live regions (status, feedback, French help); they may feel chatty. « Aide » has `aria-expanded` but no `aria-controls`. On narrow screens the card is a scrolling region inside the page.

### Deviations from Figma
I opened frames 13:34 and 6:194 directly; the rest is from the repository’s experience map, so treat the list as partial.
- **Dock labels:** Figma has Mic, Cam, CC, Aide, Fin; the app (since Phase 1A) has Micro, Caméra, Sous-titres, Aide, Pause, Quitter.
- **Badge and nameplate:** Figma shows « En ligne » and a « Daniel · Votre tuteur » nameplate (6:194). The app shows « Séance guidée · simulation » and has no nameplate; Daniel appears only as a name chip inside the card.
- **Self-view:** Figma labels the tile « Vous »; the app shows the real camera state (« La caméra est éteinte. »).
- **Repair (6:194):** Figma has an « ESSAYONS AUTREMENT » eyebrow, two large pill answers « A · Hello! » / « B · Goodbye! » that answer on tap, and « Écoutez les deux voix ». The app uses a pale card without the eyebrow, radio choices plus « Répondre », three options for the speaking probe, and one voice.
- **Tutor speaking (13:34):** Figma shows a tutor caption (« Bonjour ! On commence doucement. ») and a « Start conversation » button. The app starts from the French welcome and « Commencer ».
- **Card size and position:** Figma’s overlay is compact (about 57–81 % of the height). The app’s card is taller in repair states and can cover the lower part of the face.
- **Page 04 states 13:47 / 13:60 / 13:73:** represented by a status line and dot, not separate visuals.
- **Portrait:** the Phase 1A stock photo, not the Figma image.
