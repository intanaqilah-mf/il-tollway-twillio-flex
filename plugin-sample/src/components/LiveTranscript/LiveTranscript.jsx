import React, { useRef, useEffect, useState } from 'react';

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
    height: '100%',
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
  headerActions: {
    display: 'flex',
    gap: '6px',
  },
  iconBtn: {
    background: 'rgba(255,255,255,0.15)',
    border: 'none',
    color: colors.white,
    borderRadius: '3px',
    cursor: 'pointer',
    fontSize: '12px',
    padding: '3px 8px',
    fontFamily: 'inherit',
    lineHeight: '1.4',
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
  liveInput: {
    borderTop: `1px solid ${colors.borderColor}`,
    background: colors.white,
    padding: '10px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexShrink: 0,
  },
  liveInputField: {
    flex: 1,
    border: `1px solid ${colors.borderColor}`,
    borderRadius: '4px',
    padding: '7px 12px',
    fontSize: '13px',
    fontFamily: 'inherit',
    color: colors.textPrimary,
    outline: 'none',
    background: colors.bgChat,
  },
  sendBtn: {
    padding: '7px 18px',
    background: '#0070b9',
    color: colors.white,
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    fontFamily: 'inherit',
  },
};

const MOCK_TRANSCRIPT = [
  {
    id: 1,
    speaker: 'Customer',
    text: "Hi, I'm calling because I was charged for a toll, but I have an I-PASS and it should have been automatic. I want to file a complaint.",
    time: '2:14 PM',
  },
  {
    id: 2,
    speaker: 'Agent',
    text: "I understand your frustration. Let me pull up your account. I can see your I-PASS is registered and active. Can you confirm the toll location and approximate date?",
    time: '2:15 PM',
  },
  {
    id: 3,
    speaker: 'Customer',
    text: 'It was on October 26th, 2023 on I-90 heading westbound around 8 AM.',
    time: '2:16 PM',
  },
  {
    id: 4,
    speaker: 'Agent',
    text: "Thank you. I've located the transaction. I've filed the complaint for you. Your case number is C-98765. You'll receive an email confirmation shortly with all the details.",
    time: '2:17 PM',
  },
  {
    id: 5,
    speaker: 'Customer',
    text: 'Thank you.',
    time: '2:18 PM',
  },
];

const LiveTranscript = ({ task }) => {
  const scrollRef = useRef(null);
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState(MOCK_TRANSCRIPT);
  const callEnded = !task;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    const text = inputText.trim();
    if (!text) return;
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages((prev) => [
      ...prev,
      { id: Date.now(), speaker: 'Agent', text, time },
    ]);
    setInputText('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={s.container}>
      {/* ── PULSE ANIMATION ── */}
      <style>{`
        @keyframes saic-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>

      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          {!callEnded && <span style={s.liveDot} />}
          <span>Live Transcript</span>
        </div>
        <div style={s.headerActions}>
          <button style={s.iconBtn} title="Copy transcript">Copy</button>
          <button style={s.iconBtn} title="Expand">⤢</button>
        </div>
      </div>

      {/* Messages */}
      <div style={s.scrollArea} ref={scrollRef}>
        {messages.map((msg) => {
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
                <span
                  style={isAgent ? s.speakerAgent : s.speakerCustomer}
                >
                  {msg.speaker}
                </span>
                <span style={s.timestamp}>{msg.time}</span>
              </div>
              <div style={s.messageText}>{msg.text}</div>
            </div>
          );
        })}

        {callEnded && (
          <div style={s.callEndedBar}>
            Call ended &mdash; Duration: 5m 30s
          </div>
        )}
      </div>

      {/* Input bar (only shown when call is active) */}
      {!callEnded && (
        <div style={s.liveInput}>
          <input
            style={s.liveInputField}
            placeholder="Type a note or response..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button style={s.sendBtn} onClick={handleSend}>Send</button>
        </div>
      )}
    </div>
  );
};

export default LiveTranscript;
