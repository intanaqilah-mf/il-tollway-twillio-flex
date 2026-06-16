import React from "react"
import { FlexPlugin } from "@twilio/flex-plugin"

import SAICPanel from "./components/SAICPanel/SAICPanel"
import LiveTranscript from "./components/LiveTranscript/LiveTranscript"

const PLUGIN_NAME = "SamplePlugin"

export default class SamplePlugin extends FlexPlugin {
  constructor() {
    super(PLUGIN_NAME)
  }

  /**
   * @param flex { typeof import('@twilio/flex-ui') }
   * @param manager { import('@twilio/flex-ui').Manager }
   */
  async init(flex, manager) {
    // ── LEFT PANEL: replaces the "No active tasks" blank area ─────────
    // Panel1 is the main left workspace — adding here makes the SAIC panel
    // visible at all times, not just when a task is selected
    flex.AgentDesktopView.Panel1.Content.add(
      <SAICPanel key="saic-panel" />,
      { sortOrder: -1 }
    )

    // ── RIGHT PANEL: Live Transcript (replaces Bing CRM) ─────────────
    flex.CRMContainer.defaultProps.uriCallback = () => ""

    flex.CRMContainer.Content.add(
      <LiveTranscript key="live-transcript" />,
      { sortOrder: -1 }
    )
  }
}
