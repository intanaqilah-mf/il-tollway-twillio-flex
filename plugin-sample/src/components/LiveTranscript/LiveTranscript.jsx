import React, { useRef, useEffect, useState } from 'react';
import { useAgentAssistWebSocket } from '../../hooks/useAgentAssistWebSocket';

// SAP UI5 host sets window.ISTHA_AGENT_CONFIG before React loads.
function getAgentConfig() {
  const w = (typeof window !== 'undefined' && window.ISTHA_AGENT_CONFIG) || {};
  const p = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const get = (key) => w[key] || p.get(key) || null;
  return {
    callSid: get('callSid'),
    taskSid: get('taskSid'),
    from: get('from'),
    authenticationStatus: get('authenticationStatus'),
    lastOpenIntent: get('lastOpenIntent'),
    IVRPathSummary: get('IVRPathSummary'),
    statedReason: get('statedReason'),
    sentimentAnalysis: get('sentimentAnalysis'),
    accountNumber: get('accountNumber'),
    accountName: get('accountName'),
  };
}

function buildTaskFromConfig(cfg) {
  if (!cfg.callSid && !cfg.taskSid) return null;
  const sid = cfg.taskSid || cfg.callSid;
  return {
    sid,
    taskSid: sid,
    attributes: {
      call_sid: cfg.callSid,
      callSid: cfg.callSid,
      from: cfg.from,
      authenticationStatus: cfg.authenticationStatus,
      lastOpenIntent: cfg.lastOpenIntent,
      IVRPathSummary: cfg.IVRPathSummary,
      statedReason: cfg.statedReason,
      sentimentAnalysis: cfg.sentimentAnalysis,
      accountNumber: cfg.accountNumber,
      accountName: cfg.accountName,
    },
  };
}

const colors = {
  navyHeader: '#1a3352',
  white: '#ffffff',
  bgChat: '#f5f6f7',
  borderColor: '#e0e0e0',
  textPrimary: '#32363a',
  textSecondary: '#6a6d70',
  agentLabel: '#0070b9',
  customerLabel: '#32363a',
  bubbleAgent: '#e8f2ff',
  bubbleCustomer: '#ffffff',
  borderBubble: '#e0e0e0',
  callEndedText: '#6a6d70',
  liveIndicator: '#bb0000',
};

const s = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    height: '100%',
    minHeight: 0,
    fontFamily: '"72", "72full", Arial, Helvetica, sans-serif',
    fontSize: '13px',
    background: colors.white,
    overflow: 'hidden',
  },
  header: {
    background: colors.navyHeader,
    color: colors.white,
    padding: '10px 16px',
    fontWeight: '700',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
    gap: '8px',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  liveDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  scrollArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
    background: colors.bgChat,
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  emptyState: {
    color: colors.textSecondary,
    fontSize: '13px',
    textAlign: 'center',
    padding: '24px 16px',
    fontStyle: 'italic',
  },
  messageBubble: {
    maxWidth: '90%',
    padding: '10px 13px',
    borderRadius: '6px',
    lineHeight: '1.55',
    fontSize: '13px',
    border: `1px solid ${colors.borderBubble}`,
  },
  agentBubble: {
    background: colors.bubbleAgent,
    alignSelf: 'flex-end',
    borderColor: '#b8d4f5',
  },
  customerBubble: {
    background: colors.bubbleCustomer,
    alignSelf: 'flex-start',
  },
  speakerRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
    marginBottom: '3px',
  },
  speakerAgent: {
    fontWeight: '700',
    color: colors.agentLabel,
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  speakerCustomer: {
    fontWeight: '700',
    color: colors.customerLabel,
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  timestamp: {
    fontSize: '10px',
    color: colors.textSecondary,
    fontWeight: '400',
  },
  messageText: {
    color: colors.textPrimary,
  },
  callEndedBar: {
    margin: '4px 0 0 0',
    padding: '20px 14px',
    background: 'transparent',
    fontSize: '12px',
    color: colors.callEndedText,
    fontStyle: 'italic',
    textAlign: 'center',
    alignSelf: 'stretch',
  },
};

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(seconds) {
  if (seconds == null) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

// Inline SVG phone-with-slash icon
const CallEndedIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#6a6d70" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.42 19.42 0 0 1 4.43 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.34 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.31 9.9" />
    <line x1="23" y1="1" x2="1" y2="23" />
  </svg>
);

const LiveTranscript = ({ task: taskProp }) => {
  // In SAP UI5 there is no Twilio Flex store — build task from window.ISTHA_AGENT_CONFIG.
  const [task] = useState(() => {
    if (taskProp) return taskProp;
    return buildTaskFromConfig(getAgentConfig());
  });

  const { transcript: wsTranscript, postCall, connected, error } = useAgentAssistWebSocket(task);
  const scrollRef = useRef(null);
  const callEnded = !task;

  const messages = wsTranscript.map((entry) => ({
    id: entry.ts,
    speaker: entry.speaker === 'agent' ? 'Agent' : 'Customer',
    text: entry.transcript,
    time: formatTime(entry.ts),
  }));

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const callDuration = formatDuration(postCall?.callDurationSeconds);

  return (
    <div style={s.container}>
      <style>{`
        @keyframes saic-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>

      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <span style={{
            ...s.liveDot,
            background: callEnded
              ? '#888780'
              : connected
                ? colors.liveIndicator
                : (error ? '#bb0000' : '#f0a500'),
            animation: connected && !callEnded ? 'saic-pulse 1.4s ease-in-out infinite' : 'none',
          }} />
          <span>Live Transcript</span>
        </div>
      </div>

      {/* Messages */}
      <div style={s.scrollArea} ref={scrollRef}>
        {messages.length === 0 ? (
          <div style={s.emptyState}>
            {callEnded
              ? ''
              : error
                ? `WebSocket error: ${error}`
                : connected
                  ? 'Connected — waiting for speech...'
                  : 'Connecting the call...'}
          </div>
        ) : (
          messages.map((msg) => {
            const isAgent = msg.speaker === 'Agent';
            return (
              <div
                key={msg.id}
                style={{
                  ...s.messageBubble,
                  ...(isAgent ? s.agentBubble : s.customerBubble),
                }}
              >
                <div style={s.speakerRow}>
                  <span style={isAgent ? s.speakerAgent : s.speakerCustomer}>
                    {msg.speaker}
                  </span>
                  <span style={s.timestamp}>{msg.time}</span>
                </div>
                <div style={s.messageText}>{msg.text}</div>
              </div>
            );
          })
        )}

        {(callEnded || postCall) && (
          <div style={{ ...s.callEndedBar, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <CallEndedIcon />
            {callDuration ? `Call ended — Duration: ${callDuration}` : 'Awaiting your next call'}
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveTranscript;
