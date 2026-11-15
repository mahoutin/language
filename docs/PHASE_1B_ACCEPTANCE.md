# Phase 1B · acceptance package (after the UX refinement pass)

For the product owner’s final decision. Companion to [PHASE_1B_REVIEW.md](PHASE_1B_REVIEW.md) (architecture, curriculum mapping, state model).

**Nothing here is AI.** Daniel, Maria and Alex are scripted. Their voices are your browser’s speech synthesis; the portrait is a still photo. The state machine, `assess()`, the five activity IDs and the learner-record schema are unchanged by the refinement.

## What the refinement changed (and what it did not)

| Asked for                                       | What you get now                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Daniel audible in French                        | Daniel says his reactions, French lead-ins, instructions, repair explanations, the quiet check-in and the whole recap aloud, in a French voice, and the English lines in an English voice. English phrases inside French sentences are spoken by the English voice (a French voice would mispronounce them). Every spoken line is also on screen, and a test checks that for the whole conversation. |
| Respect interruption, pause, mute, stale output | « Arrêter la voix » cancels the **whole queued sequence**, not just the current line. Pause cancels it and Reprendre does not restart it. A new dock control **« Voix »** mutes everything (text stays; the replay buttons are disabled; unmuting never speaks by itself). A late “finished” from a cancelled or replaced speech is ignored.                                                         |
| No autoplay before learner action               | Nothing speaks on page load. The first speech follows « Commencer » (or « Écouter le message »). After that, speech follows the learner’s own actions, plus one gentle check-in after 30 s of silence (once per turn).                                                                                                                                                                               |
| Less density                                    | The card now shows the options (or the field) and one help button. « J’ai besoin d’un moment » and « Passer sans évaluation » live inside **Aide**; « Passer » also appears on its own once the learner struggles. English and French support are all still on screen.                                                                                                                               |
| One tap                                         | A choice is answered by tapping it (no « Répondre »). Options are buttons, so arrow keys never answer by accident. Double and triple clicks, a held Enter, and a second tap from an earlier turn cannot commit twice.                                                                                                                                                                                |
| First name                                      | After an accepted introduction Daniel says « Nice to meet you, Alex. » and later « Merci pour cette séance, Alex ! ». The name lives only in the open session: never written to the record, not in any storage, gone on exit, restart and reload. Only used when it clearly is a name (« I am fine » is not).                                                                                        |
| Daniel / Maria / Alex                           | Each character’s English line uses its own voice **if your browser has enough English voices**. With one voice they share it, only a different pitch is attempted, and the card says « même voix que Daniel ». It never claims distinct voices it cannot deliver.                                                                                                                                    |
| Repetitive checks, visible cues                 | Options appear in a varied order (the curriculum lists the correct one first every time, which was a cue). Only the display order changes; answers still use the original option index, so `assess()` and stored evidence mean the same.                                                                                                                                                             |

**Not changed on purpose (needs your decision):** the French translation is still shown next to the English line at the meaning checks. Hiding it would remove the answer cue, but it also removes bilingual support from the first exposure, so I did not do it. The two « What is your name? » moments remain because both are existing curriculum activities.

---

## 1. Run it on your Mac

You already have Node 24. In Terminal:

```sh
cd ~/Desktop/language
git fetch origin
git switch feat/phase-1b-conversation-flow
npm ci
npm run dev
```

Open **http://127.0.0.1:3000** in **Chrome** and **turn the sound on**. Stop with `Ctrl-C`; `git switch main` to go back.

- **Voices:** browsers use the system voices. For better ones: System Settings → Accessibility → Spoken Content → System Voice → Manage Voices. Add an English (US) and a French voice. Several English voices (for example Samantha, Alex, Daniel) let Maria and Alex sound different; with only one, they share it and the card says so.
- **Production-like run:** `npm run build && npm start`. If another build ever ran on that address, unregister its service worker first (DevTools → Application → Service Workers).
- **Start over:** progress is kept in this browser for this address only. Use « Pratiquer à nouveau », « Mes progrès » → « Effacer mes progrès », or a Private window. Existing Phase 1A progress is picked up (« Content de vous revoir ! »).
- **Automated checks (optional):** `npm run check`, then `npx playwright install chromium` once, then `npm run build` and `npm run test:e2e`. Free port 3100 first.
- **Not tested by me:** Safari, Firefox, real Mac voices. Please say which browser you used.

---

## 2. Acceptance walkthrough (about 12 minutes)

Do it once as the learner would, wrong answers included. Each row: what to do, what you should hear and see, and what would make you reject it.

### A. French welcome

1. Open the app, press « Commencer la leçon ».
   **See:** the French welcome. **Hear nothing.** No microphone or camera prompt. « Aide » is greyed. The stage says « Séance guidée · simulation ».
2. Press « Écouter le message ». **Hear** the welcome in French. Try « Voix » (dock): the status says « voix coupée » and « Écouter le message » greys out. Press « Voix » again: nothing speaks by itself.
   **Reject if:** anything speaks or asks for a device before you press something.

### B. Modeling

3. Press « Commencer ». **Hear** French (« Écoutez Daniel se présenter. »), then English (« Hello! My name is Daniel. »). English, French meaning and context are on screen.
4. While it speaks, press « Arrêter la voix »: it stops at once, the rest never plays. Press « Plus lentement » and « Écouter ».
   Try « Sous-titres » (English hides, French stays) and « Aide » (pale French card).
5. Press « Continuer ».

### C. Meaning check, one tap, repair

6. **Tap** « Ordering food ». No « Répondre » needed.
   **Hear** « Écoutons plus lentement », the English line slowly, then the French meaning. Not a repeat.
7. Tap a wrong one again: only **two** options left.
8. Tap « Introducing himself ». **Hear** a short French reaction, the next French lead-in, « What is your name? » in English, then the French instruction.
   **Check:** at the three meaning checks of the session, the correct option is **not always in the same place**.
9. Quickly **double-click** an option. Only one answer should be recorded and you should land one step further, not two.

### D. The learner’s turn: thinking, help, pause

10. Tap « Your name ». Then **do nothing for 35 s**.
    **Hear** once, quietly: « Je suis toujours là. Prenez votre temps. » Status: « Vous réfléchissez ». No error, nothing advances, and it does not repeat.
11. Type `Alex`, « Répondre »: **hear** « J’ai compris un mot, merci… ». Not an error.
12. Press « Aide »: the French explanation opens, with « J’ai besoin d’un moment » and « Passer sans évaluation » inside it. Press « J’ai besoin d’un moment »: a calm word, then « Je suis prêt ».
13. Type `My name`, press « Pause » while Daniel is speaking: the voice stops. « Reprendre »: **hear nothing**, your text `My name` is still there.

### E. Repair (speaking)

14. Type `Yes please`, « Répondre » three times. Each time **hear and read** a different method: slower audio + French; a sentence frame with a gap (Daniel says the example); a **non-scored choice** (« Quelle phrase répond à… ? », English words spoken in English).
15. Tap « My name is Sam. »: **hear** « Bien vu… ».
16. Type `My name is` + **your first name**, « Répondre ».
    **Hear** « Nice to meet you, <your name>. » in English, then French.
    **Reject if:** any step merely repeats the last one, or the tutor stops offering a way forward.

### F. Transfer

17. **Hear** the French introduction of Maria and Maria’s line. The card says whether Maria has her own voice (« autre voix du navigateur ») or shares Daniel’s (« même voix que Daniel »). Tap « Maria ».
18. **Hear** « Une nouvelle rencontre… », then Alex’s different line, then the instruction. The field is empty and no example is shown. Answer with a short sentence.
    **Reject if:** the interface claims different voices when you only hear one.

### G. Conclusion

19. **Hear and read** the recap: « Merci pour cette séance, <name> ! », what was practised, what was harder, and that the answers were aided and are not proof of mastery. « Réécouter » replays it; « Arrêter la voix » stops it.
    **Reject if:** it says or implies you mastered anything, or that a short name was a problem.
20. « Terminer la séance » → « Mes progrès » → « Télécharger mes progrès ». About 10 observations, `modality: "typed"` on the speaking ones, **no name, no answer text**.
21. Go back into the lesson (« Continuer la leçon » / « Revoir la séance »): **Daniel no longer knows your name.**

### H. Things that go wrong on purpose

| Try                                                                | Expected                                                                                     |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| « Voix » off, then play through a repair                           | Everything is written, nothing is spoken, replay buttons are disabled.                       |
| « Micro », consent box, « Parler en anglais », **Block** in Chrome | One French message, panel closes, « Écrire ma réponse » focuses the field. Nothing recorded. |
| « Caméra », then **Block**                                         | « Vous pouvez continuer sans caméra. » Conversation unaffected.                              |
| Allow the camera, then « Pause »                                   | Camera light goes off; « Reprendre » does not turn it back on.                               |
| Switch to another browser tab for a few seconds                    | The session is **paused** (« Reprendre »). Intentional.                                      |
| Reload in the middle                                               | « Content de vous revoir ! », resumes at the right activity, name forgotten.                 |
| Keyboard only: Tab to an option, **Enter** or **Space**            | Answers once. Arrow keys do not answer. Every control reachable, visible focus ring.         |
| Hold Enter in the answer field                                     | One answer, not several.                                                                     |

### I. Your verdict

(1) Did it feel like _one conversation_ from welcome to goodbye? (2) Would your father know what to do at every step without reading much? (3) Was the amount of French and English speech right, or too long? (4) Did the repair feel like a patient tutor changing approach? (5) Did Maria and Alex feel like other people? (6) Anything too dense, too fast, or too much like a test?

---

## 3. Remaining UX concerns

The refinement fixed the largest ones (every step a form; a silent tutor; no use of the learner’s name; always-first right answer). What is left, most important first:

1. **Spoken sequences can be long.** A new step can be French reaction + lead-in + English line + French instruction (my estimate from the word count is 10–20 s; I have not timed a real voice), and the recap longer still. It can be interrupted at any time and « Voix » mutes it, but a near-beginner may find it a lot. Worth judging with a real voice.
2. **Switching voices mid-sentence.** English phrases inside French sentences use the English voice, which is right for pronunciation but audible. Quality depends entirely on the voices installed.
3. **It is still a card-and-buttons interface.** The tutor is a still photo, the card is in the same place at every step, and there is no turn-taking (that needs the realtime phase). In the densest repair state the card covers the lower half of Daniel’s face.
4. **Speaking is still four steps** (Micro → consent → « Parler en anglais » → « Répondre »), re-asked per exercise.
5. **The meaning checks remain easy** because the French translation is on screen (decision above), and « What is your name? » is still asked twice.
6. **Maria and Alex may only differ by a name chip** if your Mac exposes one English voice (the card says so).
7. **The tab-hidden auto-pause** will surprise anyone who looks something up mid-session.

---

## 4. Defects, privacy, accessibility, Figma

### Defects and untested ground

- **No open functional defect** in tested paths: 116 unit tests, 61 browser tests (305 of 305 passing over five full repeats of the final code), Pages test, lint, typecheck, build, audit. “Tested” means scripted browsers with a **fake voice and fake recognizer**.
- **Found and fixed during this pass:** a double or triple click could land on whatever control moved under the pointer after the first click (for example opening thinking time, or triggering a skip). Every flow button now ignores the extra clicks and a held key never repeats; answers also have a short double-answer guard (whose first version wrongly swallowed a first tap made within 400 ms of page load; the Pages test caught it, it is fixed and has its own regression test).
- **Not verified:** Safari/WebKit (the installed WebKit build does not match this Playwright version and I did not install more), Firefox (no speech recognition), real Mac voices, whether your voices support pitch, real recognition accuracy, VoiceOver, OS capture indicators under live permission revocation.
- If a browser’s speech never reports “ended”, the status can keep saying Daniel is speaking. You are never blocked (stop the voice, « Voix », ask for a moment, type, answer).
- `assess()` still accepts a few non-introductions matching “I am …” (for example “I am fine”), and I deliberately did not change it. The name guard means such an answer never produces « Nice to meet you, Fine ».
- French copy has not had a native-speaker review.

### Privacy

- The app makes **no network requests of its own**; no analytics, no AI.
- Nothing is requested or spoken on page load. Microphone use is opt-in per exercise. **Chrome sends recognised audio to Google’s speech service, and some system or cloud voices may use the network for synthesis.**
- **The first name** exists only in the open session’s memory. It is never in the learner record, evidence, localStorage, sessionStorage or cookies (a browser test checks all four), and it is gone on exit, restart and reload. Answer text, audio and video are never stored.
- Stored, as before: the learner record, plus the optional `modality` label.
- Pause, exit, hidden tab, mute and permission loss release audio, recognition and camera.

### Accessibility

- Measured contrast of the card colours: 6.5:1 to 14.2:1 for every text/background pair (AA needs 4.5:1).
- Tested: keyboard-only answers (Enter and Space; arrows and Tab never answer), a walk through the whole tab order checking every stop has a name and a visible focus ring of at least 2 px, English phrases marked `lang="en"` (including inside French sentences, now generated from the same markup as the speech), heading focus at each step, nothing under the dock or self-view from 360 px up, no horizontal scroll, no new animation.
- **Not tested with a screen reader.** A screen-reader user may hear the page’s live regions **and** Daniel speaking the same text at once. « Voix » is the mitigation, but it is not automatic; whether to mute by default when a screen reader is detected (which browsers do not reliably reveal) is a question for you. Several elements are polite live regions and may feel chatty. « Aide » has `aria-expanded` but no `aria-controls`. On narrow screens the card is a scrolling region.

### Deviations from Figma

I opened frames 13:34 and 6:194 directly; the rest is from the repository’s experience map, so this list is partial.

- **Dock:** Figma has Mic, Cam, CC, Aide, Fin; the app has Micro, Caméra, **Voix** (new), Sous-titres, Aide, Pause, Quitter.
- **Badge and nameplate:** Figma shows « En ligne » and « Daniel · Votre tuteur » (6:194). The app shows « Séance guidée · simulation » and no nameplate; Daniel is a name chip inside the card.
- **Self-view:** Figma labels the tile « Vous »; the app shows the real camera state.
- **Repair (6:194):** closer than before: choices are large tap-to-answer pills like « A · Hello! ». Still different: no « ESSAYONS AUTREMENT » eyebrow, no letter prefixes, no « Écoutez les deux voix », three options for the speaking probe, and the voices depend on the browser.
- **Tutor speaking (13:34):** Figma shows a tutor caption and a « Start conversation » button; the app begins from the French welcome and « Commencer ».
- **Help:** « J’ai besoin d’un moment » and « Passer sans évaluation » sit inside Aide, which Figma does not show.
- **Card size:** Figma’s overlay is compact; the app’s is taller in repair states.
- **Page 04 states 13:47 / 13:60 / 13:73:** a status line and dot, not separate visuals.
- **Portrait:** the Phase 1A stock photo, not the Figma image.
