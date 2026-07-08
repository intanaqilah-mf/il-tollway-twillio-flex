import React, { useRef, useEffect } from 'react';
import { useCallContext } from '../../context/CallContext';
import { useAgentAssistWebSocket } from '../../hooks/useAgentAssistWebSocket';

// Inline SVG replacing @twilio-paste/icons CallFailedIcon
const CallEndedIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="40"
    height="40"
    fill="none"
    stroke="#6a6d70"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.42 19.42 0 0 1 4.26 9.91a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 3.17 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.15 8.91" />
    <line x1="23" y1="1" x2="1" y2="23" />
  </svg>
);

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
  callEndedBg: '#eef0f2',
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
    background: colors.liveIndicator,
    flexShrink: 0,
    animation: 'saic-pulse 1.4s ease-in-out infinite',
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
    padding: '10px 14px',
    background: colors.callEndedBg,
    border: `1px solid ${colors.borderColor}`,
    borderRadius: '6px',
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
  const sec = seconds % 60;
  return `${m}m ${sec}s`;
}

const LiveTranscript = () => {
  const { task, user } = useCallContext();
  const { transcript: wsTranscript, postCall } = useAgentAssistWebSocket(task, user);
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

      <div style={s.header}>
        <div style={s.headerLeft}>
          {!callEnded && <span style={s.liveDot} />}
          <span>Live Transcript</span>
        </div>
      </div>

      <div style={s.scrollArea} ref={scrollRef}>
        {messages.length === 0 ? (
          <div style={s.emptyState}>
            {callEnded ? 'No transcript available.' : 'Waiting for transcript...'}
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

        {callEnded && (
          <div style={{ ...s.callEndedBar, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '20px 14px' }}>
            <CallEndedIcon />
            {callDuration ? `Call ended — Duration: ${callDuration}` : 'Call ended'}
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveTranscript;
