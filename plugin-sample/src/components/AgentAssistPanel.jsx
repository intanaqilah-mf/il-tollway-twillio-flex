import React, { useRef, useEffect } from 'react';
import { useAgentAssistWebSocket } from '../hooks/useAgentAssistWebSocket';
import './AgentAssistPanel.css';

function getSentimentColor(score, label) {
  if (score >= 0.25 || label === 'Positive') return '#1D9E75';
  if (score <= -0.25 || label === 'Negative') return '#D85A30';
  return '#888780';
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function ConnectionDot({ connected, error }) {
  let cls = 'aap-conn-dot aap-conn-dot--grey';
  if (error) cls = 'aap-conn-dot aap-conn-dot--red';
  else if (connected) cls = 'aap-conn-dot aap-conn-dot--green';
  return <span className={cls} />;
}

const AgentAssistPanel = ({ task }) => {
  const { preCall, transcript, sentiment, postCall, connected, error, isMock } = useAgentAssistWebSocket(task);
  const transcriptEndRef = useRef(null);

  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcript]);

  if (!task) {
    return (
      <div className="aap-container">
        <div className="aap-empty-state">No active call</div>
      </div>
    );
  }

  return (
    <div className="aap-container">
      {/* Header */}
      <div className="aap-header">
        <span className="aap-header-title">Agent Assist</span>
        <ConnectionDot connected={connected} error={error} />
      </div>

      {/* Section 1 — Pre-call Context */}
      {preCall && (
        <div className="aap-section">
          <div className="aap-section-header aap-section-header--row">
            <span>Pre-Call Context</span>
            {isMock && <span className="aap-mock-badge">⚠ MOCK DATA</span>}
          </div>
          <div className="aap-field-row">
            <span className="aap-field-label">Authentication</span>
            <span className="aap-field-value">{preCall.authenticationStatus}</span>
          </div>
          <div className="aap-field-row">
            <span className="aap-field-label">Last Intent</span>
            <span className="aap-field-value">{preCall.lastOpenIntent}</span>
          </div>
          <div className="aap-field-row">
            <span className="aap-field-label">IVR Path</span>
            <span className="aap-field-value">{preCall.IVRPathSummary}</span>
          </div>
          <div className="aap-field-row">
            <span className="aap-field-label">Stated Reason</span>
            <span className="aap-field-value">{preCall.statedReason}</span>
          </div>
          <div className="aap-field-row">
            <span className="aap-field-label">Caller Sentiment</span>
            <span className="aap-field-value">{preCall.sentimentAnalysis}</span>
          </div>
          <div className="aap-field-row">
            <span className="aap-field-label">Phone Number</span>
            <span className="aap-field-value">{preCall.callersPhoneNumber}</span>
          </div>
        </div>
      )}

      {/* Section 2 + 3 — Live Transcript with Sentiment indicator */}
      <div className="aap-section">
        <div className="aap-section-header aap-section-header--row">
          <span>Live Transcript</span>
          {sentiment && (
            <span className="aap-sentiment-indicator">
              <span
                className="aap-sentiment-dot"
                style={{ background: getSentimentColor(sentiment.sentimentScore, sentiment.sentimentLabel) }}
              />
              <span
                className="aap-sentiment-label"
                style={{ color: getSentimentColor(sentiment.sentimentScore, sentiment.sentimentLabel) }}
              >
                {sentiment.sentimentLabel}
              </span>
            </span>
          )}
        </div>

        <div className="aap-transcript-list">
          {transcript.length === 0 ? (
            <div className="aap-transcript-empty">Waiting for transcript...</div>
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

      {/* Section 4 — Post-call Summary */}
      {postCall && (
        <div className="aap-section">
          <div className="aap-section-header">Post-Call Summary</div>

          <div className="aap-postcall-body">
            <p className="aap-postcall-summary">{postCall.summary}</p>

            <div className="aap-field-row">
              <span className="aap-field-label">Overall Sentiment</span>
              <span className="aap-sentiment-indicator">
                <span
                  className="aap-sentiment-dot"
                  style={{ background: getSentimentColor(postCall.overallSentiment === 'Positive' ? 1 : postCall.overallSentiment === 'Negative' ? -1 : 0, postCall.overallSentiment) }}
                />
                <span>{postCall.overallSentiment}</span>
              </span>
            </div>

            <div className="aap-field-row">
              <span className="aap-field-label">Duration</span>
              <span className="aap-field-value">{formatDuration(postCall.callDurationSeconds)}</span>
            </div>

            <button
              className="aap-copy-btn"
              onClick={() => navigator.clipboard.writeText(postCall.summary)}
            >
              Copy Summary
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentAssistPanel;
