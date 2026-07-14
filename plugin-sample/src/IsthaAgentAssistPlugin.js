import { FlexPlugin } from '@twilio/flex-plugin';
import { Manager } from '@twilio/flex-ui';
import React from 'react';
import SAICPanel from './components/SAICPanel/SAICPanel';
import LiveTranscript from './components/LiveTranscript/LiveTranscript';

const PLUGIN_NAME = 'IsthaAgentAssistPlugin';

const RightPanel = () => (
  <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
    <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', borderRight: '1px solid #e0e0e0' }}>
      <SAICPanel />
    </div>
    <div style={{ width: 380, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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

    // Panel2 (right side) shows SAICPanel + LiveTranscript side by side.
    // Panel1 (left/centre) is untouched — native TaskCanvas renders at full size
    // with its built-in Mute, Transfer, Hang Up controls.
    flex.CRMContainer.Content.replace(
      <RightPanel key="right-panel" />,
      { sortOrder: -Infinity }
    );

    console.log('[IsthaAgentAssistPlugin] RightPanel registered in Panel2');
  }
}
