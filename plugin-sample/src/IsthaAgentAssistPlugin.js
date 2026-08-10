import { FlexPlugin } from '@twilio/flex-plugin';
import { Manager, Actions } from '@twilio/flex-ui';
import React from 'react';
import SAICPanel from './components/SAICPanel/SAICPanel';
import LiveTranscript from './components/LiveTranscript/LiveTranscript';
import SupervisorJoinModal, { openSupervisorModal } from './components/SupervisorJoin/SupervisorJoinModal';
import AddSupervisorButton from './components/SupervisorJoin/AddSupervisorButton';

const PLUGIN_NAME = 'IsthaAgentAssistPlugin';

// SupervisorJoinModal uses position:fixed so it renders over the whole page
// regardless of where in the tree it lives. Placing it here keeps it
// co-located with the panel it relates to.
const RightPanel = () => (
  <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
    {/* 2 parts — pre/post call summary */}
    <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', borderRight: '1px solid #e0e0e0' }}>
      <SAICPanel />
    </div>
    {/* 2 parts — live transcript */}
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <LiveTranscript />
    </div>
    {/* Modal mounts here but renders via position:fixed, so placement is irrelevant */}
    <SupervisorJoinModal />
  </div>
);

export default class IsthaAgentAssistPlugin extends FlexPlugin {
  constructor() {
    super(PLUGIN_NAME);
  }

  async init(flex, manager) {
    console.log('[IsthaAgentAssistPlugin] init called');

    const t = Manager.getInstance().user?.token;
    console.log('[AA] token type on load:', typeof t, String(t).slice(0, 15));

    // Layout proportions: control panel (1/5) | SAIC (2/5) | transcript (2/5)
    const style = document.createElement('style');
    style.innerHTML = `
      .Twilio-CRMContainer {
        display: none !important;
      }
      /* Hide the wrap-up Complete button */
      .Twilio-TaskListButtons-WrapUp,
      .Twilio-TaskCanvasHeader-EndTask,
      [data-testid="complete-task-button"],
      [data-testid="wrapup-complete-task-button"] {
        display: none !important;
      }
      /* Hide the native Flex transfer button in the active call canvas.
         Flex 2.x renders it with data-testid and aria-label — target both. */
      [data-testid="transfer-button"],
      [data-testid="call-canvas-transfer-button"],
      button[aria-label="Transfer"],
      button[aria-label="Open transfer directory"],
      button[title="Transfer"],
      button[title="Open transfer directory"] {
        display: none !important;
      }
    `;
    document.head.appendChild(style);

    // Panel sizing: control panel 1/5, SAIC+transcript 4/5.
    //
    // Why JS instead of CSS :has():
    //   .Twilio-CRMContainer sits several <div> levels inside Panel2's wrapper,
    //   so the CSS direct-child combinator (>) never matched the right element.
    //
    // Why >= 2, not === 2:
    //   Twilio Flex injects a draggable resize handle as a 3rd sibling between
    //   Panel1 and Panel2, making kids.length === 3.  We skip it via width check.
    //
    // Why we also stamp `width` and `flex-basis`:
    //   Flex's resize library tracks Panel1's size as a pixel `width` inline style,
    //   not a flex ratio.  Overriding only `flex` leaves the pixel value winning.
    //
    // Why the guard observer:
    //   The resize library re-stamps Panel1's inline width on every mouse-move.
    //   We watch for that mutation and immediately re-apply our constraint.
    //   `isSized()` prevents the observer from looping on its own writes.

    const P1_PROPS = [
      ['flex', '0 0 20%'],
      ['flex-basis', '20%'],
      ['width', '20%'],
      ['max-width', '20%'],
      ['min-width', '0'],
      ['overflow', 'hidden'],
    ];
    const P2_PROPS = [
      ['flex', '1 1 80%'],
      ['flex-basis', '80%'],
      ['min-width', '0'],
      ['overflow', 'hidden'],
    ];

    let panel1El = null;
    let panel2El = null;

    // Sentinel: returns true only when OUR max-width is already stamped.
    const isSized = () =>
      panel1El &&
      panel1El.style.getPropertyValue('max-width') === '20%' &&
      panel1El.style.getPropertyPriority('max-width') === 'important';

    const stampSizes = () => {
      if (panel1El) P1_PROPS.forEach(([p, v]) => panel1El.style.setProperty(p, v, 'important'));
      if (panel2El) P2_PROPS.forEach(([p, v]) => panel2El.style.setProperty(p, v, 'important'));
    };

    const findAndApplyPanelSizing = () => {
      const crm = document.querySelector('.Twilio-CRMContainer');
      if (!crm) return false;

      let el = crm;
      while (el && el.parentElement) {
        const parent = el.parentElement;
        const kids = Array.from(parent.children);
        if (kids.length >= 2) {
          const cs = window.getComputedStyle(parent);
          if (cs.display === 'flex' && cs.flexDirection !== 'column') {
            const p2 = kids.find(k => k === el || k.contains(crm));
            // Panel1 = widest non-p2 child; skip tiny resize handles (≤ 20 px)
            const nonP2 = kids.filter(k => k !== p2);
            const p1 = nonP2.find(k => k.getBoundingClientRect().width > 20) ?? nonP2[0];

            if (p1 && p2) {
              panel1El = p1;
              panel2El = p2;
              stampSizes();

              // Re-apply whenever the resize lib mutates Panel1's style attribute
              const guard = new MutationObserver(() => {
                if (!isSized()) stampSizes();
              });
              guard.observe(p1, { attributes: true, attributeFilter: ['style'] });

              console.log('[IsthaAgentAssistPlugin] Panel sizing applied (1:4), kids:', kids.length);
              return true;
            }
          }
        }
        el = parent;
      }
      return false;
    };

    // Flex mounts panels asynchronously — observe until they appear, then stop.
    if (!findAndApplyPanelSizing()) {
      const initObs = new MutationObserver(() => {
        if (findAndApplyPanelSizing()) initObs.disconnect();
      });
      initObs.observe(document.body, { childList: true, subtree: true });
    }

    // Force Panel2 to always render — in deployed Flex, Panel2 only exists in the DOM
    // when there is an active task, so Panel2.Content.add() never mounts without this.
    // Localhost always renders Panel2 (dev mode default), which is why it works there.
    flex.AgentDesktopView.defaultProps.showPanel2 = true;

    flex.AgentDesktopView.Panel2.Content.add(
      <RightPanel key="right-panel" />,
      { sortOrder: -1 }
    );

    console.log('[IsthaAgentAssistPlugin] RightPanel registered in Panel2');

    // ── Supervisor join ───────────────────────────────────────────────────────
    //
    // Injects the "Add Supervisor" button into Flex's native call canvas so it
    // appears alongside the built-in call controls. The button opens the
    // SupervisorJoinModal which shows a live list of supervisor workers.
    flex.CallCanvas.Content.add(
      <AddSupervisorButton key="add-supervisor-btn" />,
      { sortOrder: 100 }
    );

    // Override the native warm-transfer action when it's triggered WITHOUT a
    // pre-selected destination (i.e. the user clicked the "+" add-participant
    // button rather than picking someone from the transfer directory).
    // When a destination IS already set (e.g. directory transfer), we let the
    // original action proceed unchanged so regular transfers still work.
    flex.Actions.replaceAction('StartExternalWarmTransfer', (payload, original) => {
      if (!payload.to && !payload.contact && !payload.targetSid) {
        // No destination yet — this came from the bare "+" button; show our modal
        openSupervisorModal(payload.task);
        return Promise.resolve();
      }
      // Directory-initiated transfer — let Flex handle it normally
      return original(payload);
    });
    // ─────────────────────────────────────────────────────────────────────────

    // Remove the Complete button from the UI so agents cannot manually complete tasks
    try { flex.TaskListButtons.Content.remove('wrapup'); } catch {}
    try { flex.TaskCanvasHeader.Content.remove('actions'); } catch {}

    // ── Single Redux subscriber handles two jobs ──────────────────────────────
    //
    // 1. STICKY CALL CANVAS  — whenever a voice task is active but the canvas
    //    is not showing (flex.view.selectedTaskSid is empty), click the task
    //    list row to flip the task-list component into canvas-view.
    //
    //    WHY DOM CLICK (not SelectTask):
    //    The Flex TaskList component uses internal React state to toggle between
    //    list-view and canvas-view.  SelectTask only updates Redux; it does NOT
    //    trigger the component's internal transition.  A DOM click on the task
    //    row is the only reliable trigger (confirmed: class = Twilio-TaskListBaseItem).
    //
    //    WHY REACTIVE (not one-shot):
    //    Flex's conference setup ("endConferenceOnExit") briefly removes the
    //    task from the Redux store during call initialisation, which collapses
    //    the canvas.  A one-shot click misses the re-open.  Instead we watch
    //    the store on every update: if the task is active but nothing is
    //    selected, we click again.  The `clickCooldown` flag (400 ms) prevents
    //    rapid-fire clicks during bursts of store updates.
    //
    // 2. AUTO-COMPLETE  — tasks that reach 'wrapping' are completed after 10 s
    //    so SAICPanel has time to submit the post-call summary first.
    // ─────────────────────────────────────────────────────────────────────────
    const autoCompleted = new Set();
    let clickCooldown = false;

    manager.store.subscribe(() => {
      const state = manager.store.getState()?.flex;
      const tasks = state?.worker?.tasks;
      if (!tasks) return;

      // ── job 1: sticky call canvas ─────────────────────────────────────────
      let activeSid = null;
      for (const task of tasks.values()) {
        if (['assigned', 'accepted'].includes(task.status)) {
          activeSid = task.taskSid || task.sid;
          break;
        }
      }

      // Click when: task is active AND canvas not currently selected AND no
      // cooldown.  After the click, Flex sets selectedTaskSid so subsequent
      // updates find it truthy and skip the click.  If conference setup later
      // clears selectedTaskSid, the next store update re-clicks automatically
      // once the cooldown has expired — this is the "sticky" behaviour.
      if (activeSid && !clickCooldown && !state?.view?.selectedTaskSid) {
        clickCooldown = true;
        setTimeout(() => { clickCooldown = false; }, 400);

        setTimeout(() => {
          const el =
            document.querySelector('.Twilio-TaskListBaseItem') ||
            document.querySelector('.Twilio-TaskListItem') ||
            document.querySelector('[class*="TaskListBaseItem"]') ||
            document.querySelector('[class*="TaskListItem"]:not([class*="WrapUp"])') ||
            document.querySelector('[data-testid="task-list-item"]');

          if (el) {
            console.log('[IsthaAgentAssistPlugin] Sticky-click task row → Call|Info:', el.className);
            el.click();
          }
        }, 150); // let the task row finish rendering
      }

      // ── job 2: auto-complete on wrap-up ───────────────────────────────────
      for (const task of tasks.values()) {
        const sid = task.taskSid || task.sid;
        if (task.status === 'wrapping' && !autoCompleted.has(sid)) {
          autoCompleted.add(sid);
          console.log('[IsthaAgentAssistPlugin] Task', sid, 'entering wrap-up — auto-completing in 10 s');
          setTimeout(() => {
            Actions.invokeAction('CompleteTask', { task })
              .catch((e) => console.error('[IsthaAgentAssistPlugin] CompleteTask failed:', e));
          }, 10000);
        }
      }
    });
  }
}
