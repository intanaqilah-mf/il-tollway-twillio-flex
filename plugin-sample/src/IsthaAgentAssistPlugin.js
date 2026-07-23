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
    // *:has(> .Twilio-CRMContainer)          = Panel2 wrapper → flex: 4
    // *:has(~ *:has(> .Twilio-CRMContainer)) = Panel1 wrapper (the sibling BEFORE Panel2) → flex: 1
    const style = document.createElement('style');
    style.innerHTML = `
      *:has(> .Twilio-CRMContainer) {
        flex: 4 1 0% !important;
        min-width: 0 !important;
        overflow: hidden !important;
      }
      *:has(~ *:has(> .Twilio-CRMContainer)) {
        flex: 1 1 0% !important;
        min-width: 0 !important;
        overflow: hidden !important;
      }
      .Twilio-CRMContainer {
        display: none !important;
      }
    `;
    document.head.appendChild(style);

    // Force Panel2 to always render — in deployed Flex, Panel2 only exists in the DOM
    // when there is an active task, so Panel2.Content.add() never mounts without this.
    // Localhost always renders Panel2 (dev mode default), which is why it works there.
    flex.AgentDesktopView.defaultProps.showPanel2 = true;

    flex.AgentDesktopView.Panel2.Content.add(
      <RightPanel key="right-panel" />,
      { sortOrder: -1 }
    );

    console.log('[IsthaAgentAssistPlugin] RightPanel registered in Panel2');

    // Block manual task completion — the system auto-completes tasks after the call ends.
    // This prevents agents from clicking "Complete" early and stealing wrap-up time.
    Actions.replaceAction('CompleteTask', async () => {
      console.log('[IsthaAgentAssistPlugin] Manual CompleteTask blocked — system handles task completion');
    });
  }
}
