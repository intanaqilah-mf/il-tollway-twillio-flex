import { FlexPlugin } from '@twilio/flex-plugin';
import { Manager } from '@twilio/flex-ui';
import React from 'react';
import ThreeColumnLayout from './components/ThreeColumnLayout/ThreeColumnLayout';

const PLUGIN_NAME = 'IsthaAgentAssistPlugin';

export default class IsthaAgentAssistPlugin extends FlexPlugin {
  constructor() {
    super(PLUGIN_NAME);
  }

  async init(flex, manager) {
    console.log('[IsthaAgentAssistPlugin] init called');

    // Hide Panel2 — everything lives in the 3-column layout inside Panel1
    flex.AgentDesktopView.defaultProps = {
      ...flex.AgentDesktopView.defaultProps,
      showPanel2: false,
    };

    // Token sanity check — logs "string eyJ..." to confirm raw JWT
    const t = Manager.getInstance().user?.token;
    console.log('[AA] token type on load:', typeof t, String(t).slice(0, 15));

    // Suppress the Unified Profiles promo that Flex shows in Panel2 by default.
    flex.CRMContainer.Content.replace(
      <div key="crm-suppressed" />,
      { sortOrder: -Infinity }
    );

    // Suppress the native CallCanvas (the bottom call control bar) —
    // we render our own call controls in the left column.
    try {
      flex.CallCanvas.defaultProps = { ...flex.CallCanvas.defaultProps, hidden: true };
    } catch {}
    try {
      flex.AgentDesktopView.Panel2.Content.replace(
        <div key="panel2-empty" style={{ display: 'none' }} />,
        { sortOrder: -Infinity }
      );
    } catch {}

    // PANEL 1: 3-column layout — [Call Controls | Pre+Post Call | Live Transcript]
    flex.AgentDesktopView.Panel1.Content.add(
      <ThreeColumnLayout key="three-column-layout" />,
      { sortOrder: -1 }
    );
    console.log('[IsthaAgentAssistPlugin] ThreeColumnLayout registered in Panel1');
  }
}
