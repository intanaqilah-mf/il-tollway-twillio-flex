import React from 'react';
import SAICPanel from './components/SAICPanel/SAICPanel';
import LiveTranscript from './components/LiveTranscript/LiveTranscript';

// 2-panel layout: SAICPanel (pre/post call) on the left, LiveTranscript on the right.
// Rendered directly by index.js — no Twilio Flex plugin framework required.
const IsthaAgentAssistPlugin = () => (
  <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: '"72", "72full", Arial, Helvetica, sans-serif' }}>
    <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', borderRight: '1px solid #e0e0e0' }}>
      <SAICPanel />
    </div>
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <LiveTranscript />
    </div>
  </div>
);

export default IsthaAgentAssistPlugin;
