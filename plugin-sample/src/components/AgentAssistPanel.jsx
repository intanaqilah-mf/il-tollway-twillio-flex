import React, { useRef, useEffect } from 'react';
import { withTaskContext } from '@twilio/flex-ui';
import { useAgentAssistWebSocket } from '../hooks/useAgentAssistWebSocket';
import './AgentAssistPanel.css';

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

const AgentAssistPanel = ({ task }) => {
  const { transcript } = useAgentAssistWebSocket(task);
  const transcriptEndRef = useRef(null);

  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcript]);

  return (
    <div className="aap-container">
      {/* Live Transcript — chat bubbles only */}
      <div className="aap-section">
        <div className="aap-section-header">
          <span>Live Transcript</span>
        </div>

        <div className="aap-transcript-list">
          {transcript.length === 0 ? (
            <div className="aap-transcript-empty">
              {task ? 'Waiting for transcript...' : 'No active call'}
            </div>
          ) : (
            transcript.map((entry, i) => {
              const isAgent = entry.speaker === 'agent';
              return (
                <div
                  key={i}
                  className={`aap-bubble ${isAgent ? 'aap-bubble--agent' : 'aap-bubble--customer'}`}
                >
                  <div className="aap-bubble-meta">
                    <span className="aap-bubble-speaker">
                      {isAgent ? 'Agent' : 'Customer'}
                    </span>
                    <span className="aap-bubble-time">{formatTime(entry.ts)}</span>
                  </div>
                  <div className="aap-bubble-text">{entry.transcript}</div>
                </div>
              );
            })
          )}
          <div ref={transcriptEndRef} />
        </div>
      </div>
    </div>
  );
};

export default withTaskContext(AgentAssistPanel);
