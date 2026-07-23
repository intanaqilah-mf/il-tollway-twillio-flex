import { FlexPlugin } from '@twilio/flex-plugin';
import { Manager, Actions } from '@twilio/flex-ui';
import React from 'react';
import SAICPanel from './components/SAICPanel/SAICPanel';
import LiveTranscript from './components/LiveTranscript/LiveTranscript';

const PLUGIN_NAME = 'IsthaAgentAssistPlugin';

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

    // Remove the Complete button from the UI so agents cannot manually complete tasks
    try { flex.TaskListButtons.Content.remove('wrapup'); } catch {}
    try { flex.TaskCanvasHeader.Content.remove('actions'); } catch {}

    // Auto-complete tasks when they enter wrap-up (triggered by either party hanging up).
    // The 3-second delay gives SAICPanel time to submit the summary first.
    const autoCompleted = new Set();
    Manager.getInstance().store.subscribe(() => {
      const tasks = Manager.getInstance().store.getState()?.flex?.worker?.tasks;
      if (!tasks) return;
      for (const task of tasks.values()) {
        const sid = task.taskSid || task.sid;
        if (task.status === 'wrapping' && !autoCompleted.has(sid)) {
          autoCompleted.add(sid);
          console.log('[IsthaAgentAssistPlugin] Task', sid, 'entering wrap-up — auto-completing in 3s');
          setTimeout(() => {
            Actions.invokeAction('CompleteTask', { task })
              .catch((e) => console.error('[IsthaAgentAssistPlugin] CompleteTask failed:', e));
          }, 3000);
        }
      }
    });
  }
}
