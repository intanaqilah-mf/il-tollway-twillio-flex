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
    // Token sanity check — must log "string eyJ..." to confirm raw JWT
    const t = Manager.getInstance().store.getState().flex.session.ssoTokenPayload;
    console.log('[AA] token type on load:', typeof t, String(t).slice(0, 15));

    // LEFT PANEL: pre-call + post-call wrap-up (mock UI)
    flex.AgentDesktopView.Panel1.Content.add(
      <SAICPanel key="saic-panel" />,
      { sortOrder: -1 }
    );

    // CRM CONTAINER: live transcript (mock UI)
    flex.CRMContainer.defaultProps.uriCallback = () => '';
    flex.CRMContainer.Content.add(
      <LiveTranscript key="live-transcript" />,
      { sortOrder: -1 }
    );

    // RIGHT PANEL 2: WebSocket-driven agent assist
    flex.AgentDesktopView.Panel2.Content.add(
      <AgentAssistPanel key="istha-agent-assist" />,
      {
        sortOrder: -1,
        if: (props) => props.task !== undefined,
      }
    );
  }
}
