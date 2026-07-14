import { FlexPlugin } from '@twilio/flex-plugin';
import { Manager } from '@twilio/flex-ui';
import React from 'react';
import SAICPanel from './components/SAICPanel/SAICPanel';

const PLUGIN_NAME = 'IsthaAgentAssistPlugin';

export default class IsthaAgentAssistPlugin extends FlexPlugin {
  constructor() {
    super(PLUGIN_NAME);
  }

  async init(flex, manager) {
    console.log('[IsthaAgentAssistPlugin] init called');

    const t = Manager.getInstance().user?.token;
    console.log('[AA] token type on load:', typeof t, String(t).slice(0, 15));

    // Panel2 (right side) shows SAICPanel — pre/post call info.
    // Panel1 (left/centre) is left untouched so the native TaskCanvas
    // renders at full size with its built-in Mute, Transfer, Hang Up controls.
    flex.CRMContainer.Content.replace(
      <SAICPanel key="saic-panel" />,
      { sortOrder: -Infinity }
    );

    console.log('[IsthaAgentAssistPlugin] SAICPanel registered in Panel2');
  }
}
