import { FlexPlugin } from '@twilio/flex-plugin';
import { Manager } from '@twilio/flex-ui';
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
    `;
    document.head.appendChild(style);

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
