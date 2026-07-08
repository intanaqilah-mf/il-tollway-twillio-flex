import React, { useRef, useEffect } from 'react';
import { Panel } from '@ui5/webcomponents-react';
import { useCallContext } from '../../context/CallContext';
import { useAgentAssistWebSocket } from '../../hooks/useAgentAssistWebSocket';
import './AgentAssistPanel.css';

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

const AgentAssistPanel = () => {
  const { task, user } = useCallContext();
  const { transcript } = useAgentAssistWebSocket(task, user);
  const transcriptEndRef = useRef(null);

  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcript]);

  return (
    <Panel headerText="Live Transcript" style={{ height: '100%', boxSizing: 'border-box' }}>
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
    </Panel>
  );
};

export default AgentAssistPanel;
