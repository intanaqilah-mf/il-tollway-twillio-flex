import React, { useRef, useEffect, useState } from 'react';
import { Manager, withTaskContext } from '@twilio/flex-ui';
import { useAgentAssistWebSocket } from '../../hooks/useAgentAssistWebSocket';
import { CallFailedIcon } from '@twilio-paste/icons/esm/CallFailedIcon';

function getFlexTask() {
  try {
    const flex = Manager.getInstance().store.getState()?.flex;
    const sid = flex?.view?.selectedTaskSid;
    const tasks = flex?.worker?.tasks;
    if (sid && tasks?.get) return tasks.get(sid) || null;
    if (tasks?.size > 0) return tasks.values().next().value || null;
  } catch {}
  return null;
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
  supervisorLabel: '#107869',
  bubbleAgent: '#e8f2ff',
  bubbleCustomer: '#ffffff',
  bubbleSupervisor: '#e8f8ef',
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
  supervisorBubble: {
    background: colors.bubbleSupervisor,
    alignSelf: 'flex-end',
    borderColor: '#a3d9b8',
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
  speakerSupervisor: {
    fontWeight: '700',
    color: colors.supervisorLabel,
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

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(seconds) {
  if (seconds == null) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

/**
 * Redacts payment card PII from a transcript string.
 * Covers:
 *   - Credit/debit card numbers (Visa/MC/Discover 4×4, Amex 4-6-5, or 13–19 raw digits)
 *   - Expiry dates  (MM/YY, MM/YYYY, MM-YY, MM-YYYY)
 *   - CVV/CVC/security codes (keyword + 3–4 digits)
 */
function redactPII(text) {
  if (!text) return text;
  let out = text;

  // Standard 4×4 card format: 4532 1234 5678 9012 or 4532-1234-5678-9012
  out = out.replace(/\b\d{4}[\s\-]\d{4}[\s\-]\d{4}[\s\-]\d{3,4}\b/g, '[REDACTED]');

  // Amex 4-6-5 format: 3782 822463 10005
  out = out.replace(/\b\d{4}[\s\-]\d{6}[\s\-]\d{5}\b/g, '[REDACTED]');

  // Raw continuous card digits (13–19 digits not already replaced)
  out = out.replace(/\b\d{13,19}\b/g, '[REDACTED]');

  // Expiry date: MM/YY, MM/YYYY, MM-YY, MM-YYYY
  out = out.replace(/\b(0[1-9]|1[0-2])[\/\-]\d{2}(\d{2})?\b/g, '[REDACTED]');

  // CVV / CVC / security code followed by 3–4 digits
  out = out.replace(/\b(?:cvv|cvc|security\s+code)\s*[:\-]?\s*\d{3,4}\b/gi, '[REDACTED]');

  // SSN: XXX-XX-XXXX, XXX XX XXXX, or 9 raw digits
  out = out.replace(/\b\d{3}[\s\-]\d{2}[\s\-]\d{4}\b/g, '[REDACTED]');
  out = out.replace(/\b(?:ssn|social\s+security(?:\s+number)?)\s*[:\-]?\s*\d{9}\b/gi, '[REDACTED]');

  return out;
}


const LiveTranscript = ({ task: taskProp }) => {
  // withTaskContext may not inject task in Panel2 (deployed) — fall back to Flex store
  const [task, setTask] = useState(() => taskProp || getFlexTask());
  // true only before we've had a chance to read the store — prevents "call ended" flash
  const [loading, setLoading] = useState(!taskProp && !getFlexTask());

  useEffect(() => {
    console.log('[LiveTranscript] mount — taskProp:', taskProp?.taskSid ?? null, '| storeTask:', getFlexTask()?.taskSid ?? null);
    if (taskProp) {
      setTask(taskProp);
      setLoading(false);
      return;
    }
    const fromStore = getFlexTask();
    setTask(fromStore);
    setLoading(false);
    try {
      return Manager.getInstance().store.subscribe(() => {
        const t = getFlexTask();
        setTask(t);
        setLoading(false);
      });
    } catch { return undefined; }
  }, [taskProp]);

  const { transcript: wsTranscript, postCall, connected, error, supervisorBarged } = useAgentAssistWebSocket(task);
  const scrollRef = useRef(null);
  const callEnded = !loading && !task;

  const messages = wsTranscript.map((entry) => {
    const raw = (entry.speaker || '').toLowerCase();
    // 'agent' → agent lane; 'customer' → customer lane;
    // anything else (supervisor, external, unknown) → supervisor lane
    const speakerType = raw === 'agent' ? 'agent' : raw === 'customer' ? 'customer' : 'supervisor';
    const speakerLabel = speakerType === 'agent' ? 'Agent' : speakerType === 'customer' ? 'Customer' : 'Supervisor';
    return { id: entry.ts, speakerType, speaker: speakerLabel, text: redactPII(entry.transcript), time: formatTime(entry.ts) };
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const callDuration = formatDuration(postCall?.callDurationSeconds);

  return (
    <div style={s.container}>
      {/* ── PULSE ANIMATION + ICON SIZING ── */}
      <style>{`
        @keyframes saic-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .saic-call-failed-icon svg {
          width: 40px;
          height: 40px;
          color: #6a6d70;
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
            const isAgent = msg.speakerType === 'agent';
            const isSupervisor = msg.speakerType === 'supervisor';
            const bubbleStyle = isAgent ? s.agentBubble : isSupervisor ? s.supervisorBubble : s.customerBubble;
            const labelStyle = isAgent ? s.speakerAgent : isSupervisor ? s.speakerSupervisor : s.speakerCustomer;
            return (
              <div key={msg.id} style={{ ...s.messageBubble, ...bubbleStyle }}>
                <div style={s.speakerRow}>
                  <span style={labelStyle}>{msg.speaker}</span>
                  <span style={s.timestamp}>{msg.time}</span>
                </div>
                <div style={s.messageText}>{msg.text}</div>
              </div>
            );
          })
        )}

        {/* Supervisor barge-in banner — shown when relay stops transcripts */}
        {supervisorBarged && (
          <div style={{
            margin: '4px 0',
            padding: '12px 14px',
            background: '#fff8e1',
            border: '1px solid #f0a500',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            fontSize: '12px',
            color: '#7a5000',
            lineHeight: '1.5',
          }}>
            <span style={{ fontSize: '16px', flexShrink: 0 }}>⚠️</span>
            <div>
              <div style={{ fontWeight: '700', marginBottom: '2px' }}>Supervisor has joined the call</div>
              <div>Live transcript and post-call summary have been paused for this call.</div>
            </div>
          </div>
        )}

        {callEnded && (
          <div style={{ ...s.callEndedBar, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '20px 14px' }}>
            <span className="saic-call-failed-icon" style={{ display: 'inline-flex' }}>
              <CallFailedIcon decorative size="sizeIcon70" />
            </span>
            {callDuration ? `Call ended — Duration: ${callDuration}` : 'Awaiting your next call'}
          </div>
        )}
      </div>

    </div>
  );
};

export default withTaskContext(LiveTranscript);
