import { FlexPlugin } from '@twilio/flex-plugin';
import { Manager, Actions } from '@twilio/flex-ui';
import React from 'react';
import SAICPanel from './components/SAICPanel/SAICPanel';
import LiveTranscript from './components/LiveTranscript/LiveTranscript';
import { CallbackComponent } from './components/callback';
import reducers, { namespace } from './states';
import { hadAgentSpeech } from './hooks/useAgentAssistWebSocket';

const PLUGIN_NAME = 'IsthaAgentAssistPlugin';

const RightPanel = () => (
  <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
    {/* pre/post call summary */}
    <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', borderRight: '1px solid #e0e0e0' }}>
      <SAICPanel />
    </div>
    {/* live transcript */}
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

    // ── Redux (must be first so CallbackContainer can connect) ──────────────
    this.registerReducers(manager);

    // ── Callback channel + UI ────────────────────────────────────────────────
    this.registerCallbackChannel(flex, manager);

    flex.Actions.addListener('beforeCompleteTask', (payload) => {
      const attrs = payload.task.attributes || {};
      if (attrs.type === 'outbound' && attrs.callbackTaskSid) {
        const tasks = manager.store.getState()?.flex?.worker?.tasks;
        if (tasks) {
          const cbTask = [...tasks.values()].find(
            (t) => (t.taskSid || t.sid) === attrs.callbackTaskSid
          );
          if (cbTask) {
            const outboundSid = payload.task.taskSid || payload.task.sid;
            // hadAgentSpeech checks the AI WebSocket transcript registry: if the agent
            // spoke during the call, the customer picked up (voicemail only generates
            // [customer] speech, never [agent] speech).  If the AI service is down and
            // no transcripts arrived, wasAnswered safely defaults to false — the task
            // stays and the agent can complete it manually via "Callback Complete".
            const wasAnswered = hadAgentSpeech(outboundSid);
            const currentAttempts = parseInt(cbTask.attributes?.placeCallRetry || 1, 10);
            console.log('[IsthaAgentAssistPlugin] outbound done — attempt', currentAttempts, 'of 3 | wasAnswered:', wasAnswered);

            // Complete the callback task if:
            //   • customer actually picked up (agent speech detected in transcript), OR
            //   • max attempts (3) exhausted regardless of outcome
            // Otherwise increment the counter and re-enable the call button for the next retry.
            if (wasAnswered || currentAttempts >= 3) {
              const reason = wasAnswered ? 'customer answered' : 'max attempts reached';
              console.log('[IsthaAgentAssistPlugin] completing callback task —', reason, '| attempt:', currentAttempts, '| sid:', attrs.callbackTaskSid);
              setTimeout(async () => {
                // Callback task is in 'assigned' state — must WrapUp before Complete.
                try {
                  await Actions.invokeAction('WrapUpTask', { task: cbTask });
                  console.log('[IsthaAgentAssistPlugin] WrapUpTask (callback) done, completing in 300ms…');
                } catch (e) {
                  console.warn('[IsthaAgentAssistPlugin] WrapUpTask (callback) skipped (may already be wrapping):', e?.message);
                }
                await new Promise((r) => setTimeout(r, 300));
                try {
                  await Actions.invokeAction('CompleteTask', { task: cbTask });
                  console.log('[IsthaAgentAssistPlugin] callback task completed successfully');
                } catch (e) {
                  console.error('[IsthaAgentAssistPlugin] CompleteTask (callback) failed:', e);
                }
              }, 1500);
            } else {
              // No answer yet and retries remain — increment and re-enable call button.
              console.log('[IsthaAgentAssistPlugin] no answer on attempt', currentAttempts, '— incrementing to', currentAttempts + 1, ', re-enabling button');
              cbTask.setAttributes({
                ...cbTask.attributes,
                placeCallRetry: currentAttempts + 1,
                ui_plugin: { ...(cbTask.attributes?.ui_plugin || {}), cbCallButtonAccessibility: false },
              }).catch((e) =>
                console.error('[IsthaAgentAssistPlugin] setAttributes (increment+re-enable) failed:', e)
              );
            }
          }
        }
      }
    });

    // Update callback task attributes for reporting before the task completes
    flex.Actions.addListener('beforeCompleteTask', (payload) => {
      const taskType = payload.task.attributes.taskType || payload.task.attributes.type;
      if (taskType !== 'callback') return;

      const attr = payload.task.attributes;
      console.log('[IsthaAgentAssistPlugin] beforeCompleteTask callback', attr);

      const alreadyRequeued =
        attr.taskAttribute_updateMode === 'CALLBACKREQUEUED' ||
        attr.taskAttribute_updateMode === 'CALLBACKATTEMPTSEXCEEDED';

      if (!alreadyRequeued || (attr.taskAttribute_updateMode === 'CALLBACKREQUEUED' && attr.placeCallRetry == 1)) {
        attr.taskAttribute_updateMode = 'CALLBACKSUCCESS';
        attr.taskAttribute_callbackCurrentAttempt = parseInt(attr.placeCallRetry, 10) + 1;
        payload.task.setAttributes(attr);
      }
    });

    // ── Layout & styles ──────────────────────────────────────────────────────
    const style = document.createElement('style');
    style.innerHTML = `
      .Twilio-CRMContainer {
        display: none !important;
      }
      .Twilio-TaskListButtons-WrapUp,
      .Twilio-TaskCanvasHeader-EndTask,
      [data-testid="complete-task-button"],
      [data-testid="wrapup-complete-task-button"] {
        display: none !important;
      }
      [data-testid="task-transfer-button"],
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

    // ── Panel sizing: Panel1 = 20%, Panel2 = 80% ────────────────────────────
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
            const nonP2 = kids.filter(k => k !== p2);
            const p1 = nonP2.find(k => k.getBoundingClientRect().width > 20) ?? nonP2[0];

            if (p1 && p2) {
              panel1El = p1;
              panel2El = p2;
              stampSizes();

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

    if (!findAndApplyPanelSizing()) {
      const initObs = new MutationObserver(() => {
        if (findAndApplyPanelSizing()) initObs.disconnect();
      });
      initObs.observe(document.body, { childList: true, subtree: true });
    }

    flex.AgentDesktopView.defaultProps.showPanel2 = true;

    flex.AgentDesktopView.Panel2.Content.add(
      <RightPanel key="right-panel" />,
      { sortOrder: -1 }
    );

    console.log('[IsthaAgentAssistPlugin] RightPanel registered in Panel2');

    try { flex.TaskListButtons.Content.remove('wrapup'); } catch {}
    try { flex.TaskCanvasHeader.Content.remove('actions'); } catch {}

    // ── Auto-complete non-callback wrapping tasks ───────────────────────────
    // Callback tasks are excluded — they are completed by the beforeCompleteTask
    // listener above (triggered when the linked outbound task completes).
    const autoCompleted = new Set();
    Manager.getInstance().store.subscribe(() => {
      const tasks = Manager.getInstance().store.getState()?.flex?.worker?.tasks;
      if (!tasks) return;
      for (const task of tasks.values()) {
        const sid = task.taskSid || task.sid;
        const attrs = task.attributes || {};
        const isCallback = attrs.taskType === 'callback' || attrs.type === 'callback';

        if (task.status === 'wrapping' && !autoCompleted.has(sid) && !isCallback) {
          autoCompleted.add(sid);
          console.log('[IsthaAgentAssistPlugin] Task', sid, 'entering wrap-up — auto-completing in 10s');
          setTimeout(() => {
            Actions.invokeAction('CompleteTask', { task })
              .catch((e) => console.error('[IsthaAgentAssistPlugin] CompleteTask failed:', e));
          }, 10000);
        }
      }
    });
  }

  // ── Callback channel registration ────────────────────────────────────────
  registerCallbackChannel(flex, manager) {
    console.log('[IsthaAgentAssistPlugin] registering callback channel');

    const isCallbackTask = (task) =>
      task.taskChannelUniqueName === 'callback' &&
      (task.attributes.taskType === 'callback' || task.attributes.type === 'callback');

    const CallbackChannel = flex.DefaultTaskChannels.createDefaultTaskChannel(
      'callback',
      isCallbackTask,
      'CallbackIcon',
      'CallbackIcon',
      'palegreen',
    );

    CallbackChannel.templates.TaskListItem.firstLine = (task) => `Callback: ${task.queueName}`;
    CallbackChannel.templates.TaskCanvasHeader.title = (task) => `Callback: ${task.queueName}`;
    CallbackChannel.templates.IncomingTaskCanvas.firstLine = (task) => task.queueName;

    flex.TaskChannels.register(CallbackChannel);

    // Replace the TaskInfoPanel with the callback UI for callback tasks
    flex.TaskInfoPanel.Content.replace(
      <CallbackComponent key="callback-component" manager={manager} />,
      {
        sortOrder: -1,
        if: (props) =>
          props.task &&
          (props.task.attributes.taskType === 'callback' || props.task.attributes.type === 'callback'),
      }
    );

    console.log('[IsthaAgentAssistPlugin] Callback channel registered');
  }

  // ── Redux registration ───────────────────────────────────────────────────
  registerReducers(manager) {
    if (!manager.store.addReducer) {
      console.error(`[IsthaAgentAssistPlugin] FlexUI > 1.9.0 required for built-in Redux`);
      return;
    }
    manager.store.addReducer(namespace, reducers);
    console.log('[IsthaAgentAssistPlugin] Redux reducers registered — namespace:', namespace);
  }
}
