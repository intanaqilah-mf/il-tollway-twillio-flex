import React from 'react';
import CallControlsPanel from '../CallControlsPanel/CallControlsPanel';
import SAICPanel from '../SAICPanel/SAICPanel';
import LiveTranscript from '../LiveTranscript/LiveTranscript';

const ThreeColumnLayout = () => {
  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: '#f0f0ee' }}>

      {/* Column 1 — Call Controls */}
      <div style={{
        width: '190px',
        flexShrink: 0,
        borderRight: '1px solid #d9d9d7',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <CallControlsPanel />
      </div>

      {/* Column 2 — Pre-call + Post-call */}
      <div style={{
        flex: 1,
        borderRight: '1px solid #d9d9d7',
        overflowY: 'auto',
        overflowX: 'hidden',
        minWidth: 0,
      }}>
        <SAICPanel />
      </div>

      {/* Column 3 — Live Transcript */}
      <div style={{
        width: '300px',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <LiveTranscript />
      </div>

    </div>
  );
};

export default ThreeColumnLayout;
