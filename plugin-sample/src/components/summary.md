# Ilt3ColumnLayoutPlugin — how it works

A Twilio Flex 2.x plugin that replaces the default agent desktop with a 3‑column layout for a contact-center demo: call controls on the left, pre/post‑call info in the middle, live transcript on the right.

Everything lives in one file: `src/Ilt3ColumnLayoutPlugin.js`. This document explains what each part does and why.

---

## Runtime environment (the mental model)

Flex UI is a React app. It exposes three integration surfaces this plugin uses:

1. **Programmable components** — Flex renders named containers (`AgentDesktopView`, `AgentDesktopView.Panel1`, `TaskList`, `TaskCanvas`, `CallCanvas`, …). Each has a `.Content` collection you can `.add(node)`, `.remove(key)`, or `.replace(node)` to inject/replace children. Each has `.defaultProps` you can override to tweak its behavior.
2. **Redux store** — Flex keeps all live state (worker tasks, mute state, conference participants, hold state, etc.) in a Redux store. You read it via the `useFlexSelector` hook. Never mirror it in local `useState` — it will desync with keyboard shortcuts, other plugins, and Studio flows.
3. **Actions framework** — everything a user can do (mute, hold, transfer, accept task, …) is dispatched through `Actions.invokeAction(name, payload)`. Action names are strict — the wrong name silently no-ops.

The plugin's job is to (a) hide the default UI it doesn't want, and (b) mount its own React tree into `AgentDesktopView.Panel1`.

---

## File structure

```
src/Ilt3ColumnLayoutPlugin.js
├── Helpers
│   ├── useActiveVoiceTask()          — Redux hook: current accepted voice task
│   ├── getCustomerParticipantSid()   — pulls customer callSid off a task
│   └── isCustomerOnHold()            — reads hold flag off a task
├── CallControlsPanel   (left column, 220px)
├── PreCallInfoPanel    (middle column, flex:1) + <Field/> helper
├── LiveTranscriptPanel (right column, 380px)
├── ThreeColumnLayout   — flex row of the three panels
└── class Ilt3ColumnLayoutPlugin extends FlexPlugin
    └── init(flex, manager)
```

---

## Helpers — reading Flex's Redux state

### `useActiveVoiceTask()`
```js
useFlexSelector((state) => {
  const tasks = state.flex.worker.tasks;
  for (const task of tasks.values()) {
    if (task.taskChannelUniqueName === "voice" && task.status === "accepted") return task;
  }
  return null;
});
```
Iterates the worker's task map from Redux and returns the first accepted voice task, or `null`. `useFlexSelector` is Flex's wrapper around `react-redux`'s `useSelector` — it re-renders the component when the selected value changes. Because it reads directly from the store, the return value is always in sync with reality (no drift if hold/mute is toggled from a keyboard shortcut or another plugin).

### `getCustomerParticipantSid(task)`
The Hold action needs the customer's Twilio call SID, not the task SID. That SID lives at `task.conference.participants.customer.callSid`. On some inbound flows the `conference.participants` map isn't populated for a second or two after `status === "accepted"`, so the helper also falls back to `task.attributes.conference.participants.customer` and returns `null` if neither is ready.

### `isCustomerOnHold(task)`
Reads `task.conference.participants.customer.onHold`. Used to flip the Hold button's label between "Hold" and "Resume" without any local state — the source of truth is Redux.

---

## `CallControlsPanel` — left column, 220px

Three buttons, all disabled when there's no active voice task.

| Button | Action fired | Payload |
|---|---|---|
| Mute / Unmute | `ToggleMute` | none |
| Hold / Resume | `HoldParticipant` or `UnholdParticipant` | `{ participantType: "customer", task, targetSid }` |
| Transfer | `ShowDirectory` | `{ task }` |

**Why `HoldParticipant`, not `HoldCall`?** Flex 2.x uses a conference-based voice model. `HoldCall` is the legacy pre-conference action and is a no-op in 2.x. You must dispatch `HoldParticipant`/`UnholdParticipant` and pass the *customer's callSid* (not the task SID) as `targetSid`, plus `participantType: "customer"` and the task object itself.

**Button labels** read from Redux via `useFlexSelector`, so if the caller is put on hold by any other means (keyboard shortcut, Studio flow, another plugin), the button flips automatically.

---

## `PreCallInfoPanel` — middle column

Two stacked sections plus a footer:

- **PRE‑CALL INFORMATION** — reads fields off `task.attributes` (`from`, `accountNumber`, `authStatus`, `sentiment`, `intent`, `reason`, `ivrPath`) with hard-coded fallback strings so the panel still renders during dev without a real IVR handoff.
- **POST‑CALL WRAP‑UP** — static placeholder for real‑time insights, sentiment, and a GenAI session summary. Currently always renders; the follow-up (see below) is to only render on `task.status === "wrapping"`.
- **Footer** — Edit and "Submit to SAP" buttons, currently stubs (`onClick` unwired).

The `<Field label value dot pill />` helper renders a labeled row with optional colored dot (green/red) or pill styling.

---

## `LiveTranscriptPanel` — right column, 380px

Placeholder wired to task presence: shows "Idle" + "No active call" when there's no task, "Connected" + "Connected — waiting for speech…" when there is. The actual transcription source (Voice Intelligence, Media Streams, etc.) is a follow-up.

---

## `init(flex, manager)` — the plugin bootstrap

Three effective operations:

```js
async init(flex, manager) {
  // 1. Kill the default right panel (Panel2 / CRM area).
  flex.AgentDesktopView.defaultProps.showPanel2 = false;

  // 2. Hide TaskList (task cards strip) and TaskCanvas (default task detail
  //    with the built-in Mute/Hold/Transfer bar) via CSS. Simpler than trying
  //    to guess the internal component keys and calling Content.remove(...).
  const style = document.createElement("style");
  style.innerHTML = `.Twilio-TaskList, .Twilio-TaskCanvas { display: none !important; }`;
  document.head.appendChild(style);

  // 3. Mount the custom 3-column layout into Panel1.
  flex.AgentDesktopView.Panel1.Content.add(
    <ThreeColumnLayout key="three-column-layout" />,
    { sortOrder: -1 },
  );
}
```

### Why CSS instead of `Content.remove()`?

`Component.Content.remove(childKey)` removes a *named child* from that component's slot. To remove `TaskList` from the view, you'd call `flex.AgentDesktopView.Panel1.Content.remove('<key>')` — but the key `Panel1` uses to register `TaskList`/`TaskCanvas` isn't stable across Flex minors (we tried `'splitter'` and `'container'` in 2.17.1 without luck). CSS on the class names (`.Twilio-TaskList`, `.Twilio-TaskCanvas`) doesn't depend on knowing those keys.

`showPanel2: false` is fine to use directly because it's a documented `defaultProps` on `AgentDesktopView` — no key guessing.

### Why `sortOrder: -1`?

`Content.add()` accepts a `sortOrder` (integers, lower = earlier). `-1` places the custom layout before any default children. With Panel2 off and TaskList/TaskCanvas CSS-hidden, Panel1 is effectively empty, so the layout takes the full width.

---

## Action-name mapping (the important bit)

This is the piece most likely to bite anyone modifying the plugin. Flex 2.x conference-mode action names differ from the older direct-call actions:

| User need | Wrong (Flex 1.x / legacy) | Correct (Flex 2.x conference) |
|---|---|---|
| Mute | — | `ToggleMute` |
| Hold | `HoldCall`, `{ sid }` | `HoldParticipant`, `{ participantType: "customer", task, targetSid }` |
| Unhold | `UnholdCall` | `UnholdParticipant`, same payload |
| Transfer picker | `ShowDirectory` still works in 2.17.x | `SetComponentState { name: "CallCanvas", state: { isTransferPanelOpen: true } }` also works |
| Direct transfer | — | `TransferTask`, `{ task, targetSid, options: { mode: "WARM" \| "COLD" } }` |

`targetSid` for Hold/Unhold is the **customer's callSid**, not the task SID.

---

## Known gotchas

- **First-call Hold no-op.** For ~1 second after a task hits `status === "accepted"`, `task.conference.participants` may not be populated. The Hold handler guards against this by early-returning when `getCustomerParticipantSid()` is `null`. If Hold does nothing, verify `task.conference?.participants?.customer` in the console.
- **CSS depends on class names.** `.Twilio-TaskList` and `.Twilio-TaskCanvas` are stable public class names, but if a future Flex minor renames them, replace the CSS selectors. To find current names: DevTools → inspect the strip / center pane.
- **`state.flex.phone?.isMuted`** path holds as of Flex UI 2.17.x. If the mute label stops toggling, check this selector.
- **Local state for hold/mute is a trap.** Always read via `useFlexSelector` — otherwise the UI desyncs with keyboard shortcuts or other plugins.

---

## Running locally

```bash
npm install
twilio flex:plugins:start
```

Open `http://localhost:3000`, log in as a worker, place a test inbound call.

Verify:
1. **No default Flex chrome visible** — no left task strip, no bottom Mute/Hold bar, no right CRM panel.
2. **Mute** — click, hear silence to caller. Redux `flex.phone.isMuted` flips → button label toggles.
3. **Hold** — click, caller hears hold audio. Redux `task.conference.participants.customer.onHold` flips → button label becomes "Resume".
4. **Transfer** — click, native Flex transfer directory slides in.

---

## Open follow-ups

- Wire the middle panel's **Edit** / **Submit to SAP** buttons to real handlers.
- Wire the **Live Transcript** panel to the actual transcription source.
- Only render the **Post‑Call Wrap‑Up** section when `task.status === "wrapping"`.
- Consider replacing `ShowDirectory` with a custom directory that fires `TransferTask` directly, if the native transfer panel is ever hidden by TaskCanvas being CSS‑hidden.
