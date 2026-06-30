import { FlexPlugin } from '@twilio/flex-plugin';
import { Manager } from '@twilio/flex-ui';
import React from 'react';
import SAICPanel from './components/SAICPanel/SAICPanel';
import LiveTranscript from './components/LiveTranscript/LiveTranscript';
import AgentAssistPanel from './components/AgentAssistPanel';

const PLUGIN_NAME = 'IsthaAgentAssistPlugin';

export default class IsthaAgentAssistPlugin extends FlexPlugin {
  constructor() {
    super(PLUGIN_NAME);
  }

  async init(flex, manager) {
    console.log('[IsthaAgentAssistPlugin] init called');

    // Force Panel2 visible by default — agents shouldn't need to toggle it manually
    flex.AgentDesktopView.defaultProps = {
      ...flex.AgentDesktopView.defaultProps,
      showPanel2: true,
    };

    // Token sanity check — logs "string eyJ..." to confirm raw JWT
    const t = Manager.getInstance().user?.token;
    console.log('[AA] token type on load:', typeof t, String(t).slice(0, 15));

    // LEFT PANEL: pre-call + post-call wrap-up
    flex.AgentDesktopView.Panel1.Content.add(
      <SAICPanel key="saic-panel" />,
      { sortOrder: -1 }
    );
    console.log('[IsthaAgentAssistPlugin] SAICPanel registered in Panel1');

    // PANEL 2: live transcript — withTaskContext injects task reliably
    // no if() condition — withTaskContext + internal check handles empty state
    flex.AgentDesktopView.Panel2.Content.add(
      <LiveTranscript key="live-transcript" />,
      { sortOrder: 0 }
    );
    console.log('[IsthaAgentAssistPlugin] LiveTranscript registered in Panel2');

    // PANEL 2: agent assist — no if() condition per Twilio support guidance
    flex.AgentDesktopView.Panel2.Content.add(
      <AgentAssistPanel key="istha-agent-assist" />,
      { sortOrder: 1 }
    );
    console.log('[IsthaAgentAssistPlugin] AgentAssistPanel registered in Panel2');
  }
}
