import React, { useState, useEffect, useRef } from 'react';
import { useAgentAssistWebSocket } from '../../hooks/useAgentAssistWebSocket';

// SAP UI5 host sets window.ISTHA_AGENT_CONFIG before React loads.
// URL query params are used as fallback for local dev / testing.
function getAgentConfig() {
  const w = (typeof window !== 'undefined' && window.ISTHA_AGENT_CONFIG) || {};
  const p = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const get = (key) => w[key] || p.get(key) || null;
  return {
    token: get('token'),
    callSid: get('callSid'),
    taskSid: get('taskSid'),
    agentEmail: get('agentEmail'),
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

// Build a task-like object from config so useAgentAssistWebSocket gets callSid + attributes.
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
  sapBlue: '#0070b9',
  sapBlueDark: '#005a94',
  sectionBg: '#f5f6f7',
  borderColor: '#e0e0e0',
  textPrimary: '#32363a',
  textSecondary: '#6a6d70',
  textLabel: '#8c8c8c',
  sentimentRed: '#bb0000',
  sentimentGreen: '#107e3e',
  authGreen: '#107e3e',
  intentBlue: '#0a6ed1',
  intentBlueBg: '#e8f2ff',
  white: '#ffffff',
};

const s = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    fontFamily: '"72", "72full", Arial, Helvetica, sans-serif',
    fontSize: '13px',
    background: colors.white,
    overflowY: 'auto',
    overflowX: 'hidden',
  },
  sectionBar: {
    background: colors.navyHeader,
    color: colors.white,
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: '700',
    letterSpacing: '0.6px',
    textTransform: 'uppercase',
    userSelect: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
  },
  sectionBarMeta: {
    fontSize: '11px',
    fontWeight: '400',
    letterSpacing: '0.2px',
    opacity: 0.85,
    whiteSpace: 'nowrap',
    textTransform: 'none',
  },
  fieldRow: {
    padding: '10px 16px',
    borderBottom: `1px solid ${colors.borderColor}`,
    background: colors.white,
  },
  fieldLabel: {
    fontSize: '11px',
    color: colors.textLabel,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    marginBottom: '4px',
  },
  fieldValue: {
    color: colors.textPrimary,
    fontWeight: '500',
    lineHeight: '1.4',
  },
  fieldPlaceholder: {
    color: colors.textSecondary,
    fontWeight: '400',
    fontStyle: 'italic',
  },
  authRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
  },
  tagWrap: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginTop: '4px',
  },
  tag: {
    background: colors.intentBlueBg,
    color: colors.intentBlue,
    padding: '3px 10px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '600',
    border: `1px solid #b8d4f5`,
  },
  insightsBox: {
    padding: '10px 16px',
    borderBottom: `1px solid ${colors.borderColor}`,
    background: colors.sectionBg,
  },
  sentimentLine: {
    fontSize: '11px',
    color: colors.textSecondary,
    marginBottom: '5px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
  },
  sentimentValue: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
  },
  sentimentDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  summaryBox: {
    padding: '10px 16px',
    borderBottom: `1px solid ${colors.borderColor}`,
    flex: 1,
  },
  summaryLabel: {
    fontSize: '11px',
    color: colors.textLabel,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    marginBottom: '8px',
  },
  summaryText: {
    color: colors.textPrimary,
    lineHeight: '1.6',
    background: colors.sectionBg,
    border: `1px solid ${colors.borderColor}`,
    borderRadius: '4px',
    padding: '10px 12px',
    minHeight: '90px',
    fontSize: '13px',
  },
  summaryField: {
    marginBottom: '8px',
  },
  summaryFieldLabel: {
    fontSize: '10px',
    color: colors.textLabel,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    marginBottom: '2px',
  },
  summaryFieldValue: {
    color: colors.textPrimary,
    lineHeight: '1.5',
    fontSize: '13px',
  },
  statusRow: {
    padding: '10px 16px',
    borderTop: `1px solid ${colors.borderColor}`,
    background: colors.sectionBg,
    flexShrink: 0,
    minHeight: '42px',
    display: 'flex',
    alignItems: 'center',
  },
  fieldRowDouble: {
    padding: '10px 16px',
    borderBottom: `1px solid ${colors.borderColor}`,
    background: colors.white,
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
  },
  fieldColLeft: {
    paddingRight: '12px',
    borderRight: `1px solid ${colors.borderColor}`,
  },
  fieldColRight: {
    paddingLeft: '12px',
  },
};

function getSentimentColor(label) {
  const l = (label || '').toLowerCase();
  if (l.startsWith('pos')) return colors.sentimentGreen;
  if (l.startsWith('neg')) return colors.sentimentRed;
  return '#888780';
}

function normalizeSentiment(label) {
  const l = (label || '').toLowerCase().trim();
  if (l.startsWith('pos')) return 'Positive';
  if (l.startsWith('neg')) return 'Negative';
  if (l.startsWith('neu')) return 'Neutral';
  return label;
}

function formatDuration(seconds) {
  if (seconds == null) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

const SUMMARY_KEYS = ['situation', 'action', 'resolution', 'customer_satisfaction'];
const SUMMARY_LABELS = {
  situation: 'Situation',
  action: 'Action',
  resolution: 'Resolution',
  customer_satisfaction: 'Customer Satisfaction',
};
const SUMMARY_DISPLAY_KEYS = ['situation', 'action', 'resolution', 'customer_satisfaction'];

const SUMMARY_KEY_PATTERNS = {
  situation: 'situation',
  action: 'action',
  resolution: 'resolution',
  customer_satisfaction: 'customer[_ ]satisfaction',
};

function parseEmbeddedProse(text) {
  if (!text) return null;
  const cleaned = text.replace(/^[A-Z]\s+/, '');
  const labels = [
    { key: 'resolution', re: /\bresolution\b/i },
    { key: 'customer_satisfaction', re: /\bcustomer\s+satisfaction\b/i },
    { key: 'situation', re: /\bsituation\b/i },
    { key: 'action', re: /\baction\b/i },
  ];
  const positions = [];
  for (const label of labels) {
    const m = label.re.exec(cleaned);
    if (m) positions.push({ key: label.key, start: m.index, end: m.index + m[0].length });
  }
  if (positions.length < 2) return null;
  positions.sort((a, b) => a.start - b.start);
  const result = {};
  for (let i = 0; i < positions.length; i++) {
    const { key, end } = positions[i];
    const nextStart = positions[i + 1]?.start ?? cleaned.length;
    const value = cleaned.slice(end, nextStart).trim().replace(/^[:\s.,]+/, '').replace(/[.,\s]+$/, '');
    if (value) result[key] = value;
  }
  return Object.keys(result).length >= 2 ? result : null;
}

function parseSummaryFields(text) {
  if (!text) return null;
  const result = {};
  let matched = false;
  for (let i = 0; i < SUMMARY_KEYS.length; i++) {
    const key = SUMMARY_KEYS[i];
    const nextKey = SUMMARY_KEYS[i + 1];
    const keyPat = SUMMARY_KEY_PATTERNS[key];
    const nextPat = nextKey ? SUMMARY_KEY_PATTERNS[nextKey] : null;
    const pattern = nextPat
      ? new RegExp(`${keyPat}\\s+(.+?)\\s+${nextPat}`, 'is')
      : new RegExp(`${keyPat}\\s+(.+?)$`, 'is');
    const m = text.match(pattern);
    if (m) { result[key] = m[1].trim(); matched = true; }
  }
  if (!matched) return null;
  const embedded = parseEmbeddedProse(result.customer_satisfaction);
  if (embedded) {
    const firstLabel = result.customer_satisfaction?.search(/\b(situation|action|resolution)\b/i) ?? -1;
    if (firstLabel !== -1) {
      result.customer_satisfaction = result.customer_satisfaction.slice(0, firstLabel).trim().replace(/[.,\s]+$/, '');
    }
    Object.assign(result, embedded);
  }
  return result;
}

function CopyableValue({ value, placeholder }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  if (!value) return <span style={{ color: colors.textSecondary, fontWeight: '400', fontStyle: 'italic' }}>{placeholder || '—'}</span>;
  return (
    <span
      onClick={handleCopy}
      title={copied ? 'Copied!' : 'Click to copy'}
      style={{
        color: copied ? colors.authGreen : colors.textPrimary,
        fontWeight: '500',
        lineHeight: '1.4',
        cursor: 'pointer',
        borderBottom: `1px dashed ${copied ? colors.authGreen : colors.borderColor}`,
        transition: 'color 0.2s',
        display: 'inline-block',
      }}
    >
      {copied ? 'Copied!' : value}
    </span>
  );
}

const StatedReasonValue = ({ value }) => <CopyableValue value={value} placeholder="Caller's reason to call" />;

function CopyableHeaderMeta({ value }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <span
      onClick={handleCopy}
      title={copied ? 'Copied!' : 'Click to copy'}
      style={{
        fontSize: '11px',
        fontWeight: '400',
        letterSpacing: '0.2px',
        opacity: copied ? 1 : 0.85,
        whiteSpace: 'nowrap',
        textTransform: 'none',
        cursor: 'pointer',
        borderBottom: '1px dashed rgba(255,255,255,0.5)',
        color: copied ? '#7ecfb3' : 'inherit',
        transition: 'color 0.2s',
      }}
    >
      {copied ? 'Copied!' : value}
    </span>
  );
}

const SAICPanel = ({ task: taskProp }) => {
  // In SAP UI5 there is no Twilio Flex store — build task from window.ISTHA_AGENT_CONFIG.
  // taskProp is accepted for testing/embedding flexibility.
  const [task] = useState(() => {
    if (taskProp) return taskProp;
    return buildTaskFromConfig(getAgentConfig());
  });

  const { preCall: wsPreCall, sentiment, postCall, sendMessage, transferSummary } = useAgentAssistWebSocket(task);

  // Cache last known preCall so fields stay visible after the call ends
  const [cachedPreCall, setCachedPreCall] = useState(null);
  useEffect(() => {
    if (wsPreCall) setCachedPreCall(wsPreCall);
  }, [wsPreCall]);

  const preCall = wsPreCall || cachedPreCall;

  const [summary, setSummary] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [originalAiSummary, setOriginalAiSummary] = useState('');
  const hasSubmittedRef = useRef(false);
  const callEndedRef = useRef(false);

  // Stopwatch: counts seconds this tab is active during the call.
  const tabFocusStartRef = useRef(document.visibilityState === 'visible' ? Date.now() : null);
  const tabFocusSecondsRef = useRef(0);
  const windowBlurredRef = useRef(false);

  const taskSid = task?.taskSid || task?.sid || null;

  useEffect(() => {
    if (!postCall?.summary) return;
    setSummary(postCall.summary);
    setOriginalAiSummary((prev) => prev || postCall.summary);
  }, [postCall?.summary]);

  // Tab active-time tracking
  useEffect(() => {
    const onBlur = () => { windowBlurredRef.current = true; };
    const onFocus = () => { windowBlurredRef.current = false; };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (!windowBlurredRef.current && tabFocusStartRef.current !== null) {
          tabFocusSecondsRef.current += (Date.now() - tabFocusStartRef.current) / 1000;
          tabFocusStartRef.current = null;
        }
      } else {
        tabFocusStartRef.current = Date.now();
      }
    };
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Reset on new task
  useEffect(() => {
    setSummary('');
    setSubmitted(false);
    setOriginalAiSummary('');
    hasSubmittedRef.current = false;
    callEndedRef.current = false;
    setCachedPreCall(null);
    tabFocusSecondsRef.current = 0;
    tabFocusStartRef.current = document.visibilityState === 'visible' ? Date.now() : null;
  }, [taskSid]);

  // Derive call context — prefer live WebSocket data, fall back to initial config
  const cfg = getAgentConfig();
  const attrs = task?.attributes || {};

  const callSid = attrs.callSid || attrs.call_sid || cfg.callSid || null;
  const agentEmail = cfg.agentEmail || null;
  const sentimentScore = sentiment?.sentimentScore ?? null;

  const callerId = preCall?.callersPhoneNumber || attrs.from || cfg.from || null;
  const accountNumber = preCall?.accountNumber || attrs.accountNumber || cfg.accountNumber || null;
  const accountName = preCall?.accountName || attrs.accountName || cfg.accountName || null;

  const authStatus = preCall?.authenticationStatus || attrs.authenticationStatus || cfg.authenticationStatus || null;
  const isVerified = authStatus === 'AUTHENTICATED' || authStatus === 'Verified' || authStatus === 'true';
  const authTextColor = authStatus ? (isVerified ? colors.authGreen : colors.sentimentRed) : colors.textSecondary;
  const authLabel = authStatus ? (isVerified ? 'Authenticated' : 'Not Authenticated') : null;

  const intentVal = preCall?.lastOpenIntent || attrs.lastOpenIntent || cfg.lastOpenIntent || null;
  const intents = intentVal ? [intentVal] : [];

  const statedReason = preCall?.statedReason || attrs.statedReason || cfg.statedReason || null;
  const ivrPath = preCall?.IVRPathSummary || attrs.IVRPathSummary || cfg.IVRPathSummary || null;

  const preCallSentiment = preCall?.sentimentAnalysis || attrs.sentimentAnalysis || cfg.sentimentAnalysis || null;
  const sentimentLabel = sentiment?.sentimentLabel || null;
  const sentimentColor = getSentimentColor(sentimentLabel);

  const postCallDuration = formatDuration(postCall?.callDurationSeconds);

  const getTabFocusSeconds = () => {
    const live = tabFocusStartRef.current !== null ? (Date.now() - tabFocusStartRef.current) / 1000 : 0;
    return Math.round(tabFocusSecondsRef.current + live);
  };

  function buildSummaryPayload() {
    return {
      type: 'agent_summary_submit',
      callSid,
      taskSid,
      agentEmail,
      submittedAt: new Date().toISOString(),
      callersPhoneNumber: callerId,
      authenticationStatus: isVerified ? 'AUTHENTICATED' : 'UNAUTHENTICATED',
      lastOpenIntent: intentVal,
      IVRPathSummary: ivrPath,
      statedReason,
      preCallSentiment,
      accountNumber,
      sentimentLabel,
      sentimentScore,
      callDurationSeconds: postCall?.callDurationSeconds ?? null,
      overallSentiment: postCall?.overallSentiment || sentimentLabel,
      aiSummary: originalAiSummary,
      agentAssistTabActiveDurationInSecs: getTabFocusSeconds(),
    };
  }

  const buildPayloadRef = useRef(buildSummaryPayload);
  buildPayloadRef.current = buildSummaryPayload;

  // Auto-submit when postCall arrives — that signals the call has ended in the backend.
  // (No Twilio task.status === 'wrapping' available in SAP UI5.)
  useEffect(() => {
    if (postCall) callEndedRef.current = true;
    if (!callEndedRef.current || !originalAiSummary || hasSubmittedRef.current) return;
    const payload = buildPayloadRef.current();
    if (!payload.callSid || !payload.taskSid) {
      console.error('[AA wrapup] missing callSid or taskSid — not submitting');
      return;
    }
    const sent = sendMessage(payload);
    if (sent) { hasSubmittedRef.current = true; setSubmitted(true); }
  }, [postCall, originalAiSummary, sendMessage]); // eslint-disable-line react-hooks/exhaustive-deps

  const Placeholder = ({ text }) => (
    <span style={s.fieldPlaceholder}>{text || '—'}</span>
  );

  return (
    <div style={s.container}>

      {/* ── PRE-CALL SECTION ── */}
      <div style={s.sectionBar}>
        <span>Pre-Call Information</span>
        {accountName && <CopyableHeaderMeta value={accountName} />}
      </div>

      {/* Caller ID | Account Number */}
      <div style={s.fieldRowDouble}>
        <div style={s.fieldColLeft}>
          <div style={s.fieldLabel}>Caller ID</div>
          <div style={s.fieldValue}>
            <CopyableValue value={callerId} placeholder="Incoming phone number" />
          </div>
        </div>
        <div style={s.fieldColRight}>
          <div style={s.fieldLabel}>Account Number</div>
          <div style={s.fieldValue}>
            <CopyableValue value={accountNumber} placeholder="Caller's account number" />
          </div>
        </div>
      </div>

      {/* Authentication Status | Sentiment Analysis (Pre-Call) */}
      <div style={s.fieldRowDouble}>
        <div style={s.fieldColLeft}>
          <div style={s.fieldLabel}>Authentication Status</div>
          <div style={{ ...s.fieldValue, ...s.authRow }}>
            <span style={{ color: authTextColor, fontWeight: '600' }}>
              {authLabel || <Placeholder text="Awaiting caller verification" />}
            </span>
          </div>
        </div>
        <div style={s.fieldColRight}>
          <div style={s.fieldLabel}>Sentiment Analysis</div>
          <div style={s.sentimentValue}>
            {preCallSentiment ? (
              <>
                <span style={{ ...s.sentimentDot, background: getSentimentColor(preCallSentiment) }} />
                <span style={{ color: getSentimentColor(preCallSentiment), fontWeight: '700', fontSize: '13px' }}>
                  {normalizeSentiment(preCallSentiment)}
                </span>
              </>
            ) : (
              <Placeholder text="Detected during IVR interaction" />
            )}
          </div>
        </div>
      </div>

      <div style={s.fieldRowDouble}>
        <div style={s.fieldColLeft}>
          <div style={s.fieldLabel}>Intents Identified</div>
          <div style={s.tagWrap}>
            {intents.length > 0
              ? intents.map((intent) => (
                  <span key={intent} style={s.tag}>{intent}</span>
                ))
              : <Placeholder text="Caller intent to call" />
            }
          </div>
        </div>
        <div style={s.fieldColRight}>
          <div style={s.fieldLabel}>Stated Reason</div>
          {transferSummary ? (
            <div>
              <div style={{ color: colors.textSecondary, fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' }}>Previous Agent</div>
              {transferSummary.sections ? (
                Object.entries(transferSummary.sections).map(([key, val]) => (
                  <div key={key} style={{ marginBottom: '4px' }}>
                    <div style={{ fontSize: '10px', color: colors.textLabel, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '1px' }}>{key}</div>
                    <div style={{ color: colors.textPrimary, fontSize: '12px', lineHeight: '1.4' }}>{val}</div>
                  </div>
                ))
              ) : (
                <div style={{ color: colors.textPrimary, fontWeight: '500', lineHeight: '1.4', marginBottom: '6px', fontSize: '12px' }}>{transferSummary.text}</div>
              )}
              <div style={{ borderTop: `1px solid ${colors.borderColor}`, margin: '6px 0' }} />
              <div style={{ color: colors.textSecondary, fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '3px' }}>Stated Reason</div>
              <StatedReasonValue value={statedReason} />
            </div>
          ) : (
            <StatedReasonValue value={statedReason} />
          )}
        </div>
      </div>

      <div style={s.fieldRow}>
        <div style={s.fieldLabel}>IVR Path</div>
        <div style={s.fieldValue}>
          {ivrPath || <Placeholder text="Menu path before reaching you" />}
        </div>
      </div>

      {/* ── POST-CALL WRAP-UP SECTION ── */}
      <div style={s.sectionBar}>
        <span>Post-Call Wrap-Up</span>
        <span style={s.sectionBarMeta}>
          {accountName
            ? <><CopyableHeaderMeta value={accountName} />{postCallDuration ? ` | ${postCallDuration}` : ''}</>
            : (postCallDuration || '')}
        </span>
      </div>

      {/* Real-time Insights */}
      <div style={s.insightsBox}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          <div style={s.fieldColLeft}>
            <div style={s.sentimentLine}>Sentiment Real-time</div>
            <div style={s.sentimentValue}>
              {sentimentLabel ? (
                <>
                  <span style={{ ...s.sentimentDot, background: sentimentColor }} />
                  <span style={{ color: sentimentColor, fontWeight: '700', fontSize: '13px' }}>
                    {normalizeSentiment(sentimentLabel)}
                  </span>
                </>
              ) : (
                <Placeholder text="Real time update sentiment" />
              )}
            </div>
          </div>
          <div style={s.fieldColRight}>
            <div style={s.sentimentLine}>Overall Sentiment</div>
            <div style={s.sentimentValue}>
              {postCall?.overallSentiment ? (
                <>
                  <span style={{ ...s.sentimentDot, background: getSentimentColor(postCall.overallSentiment) }} />
                  <span style={{ color: getSentimentColor(postCall.overallSentiment), fontWeight: '700', fontSize: '13px' }}>
                    {normalizeSentiment(postCall.overallSentiment)}
                  </span>
                </>
              ) : (
                <Placeholder text="Overall sentiment when call ends" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* AI Summary — read-only, auto-submitted when postCall arrives */}
      <div style={s.summaryBox}>
        <div style={s.summaryLabel}>Generative AI Session Summarization</div>
        {(() => {
          const parsed = parseSummaryFields(summary);
          if (parsed) {
            return (
              <div style={{ ...s.summaryText, padding: '10px 12px' }}>
                {SUMMARY_DISPLAY_KEYS.map((k) => (
                  <div key={k} style={s.summaryField}>
                    <div style={s.summaryFieldLabel}>{SUMMARY_LABELS[k]}</div>
                    <div style={parsed[k] ? s.summaryFieldValue : { ...s.summaryFieldValue, color: colors.textSecondary, fontStyle: 'italic' }}>
                      {parsed[k] || 'Not captured'}
                    </div>
                  </div>
                ))}
              </div>
            );
          }
          return (
            <div style={{ ...s.summaryText, color: summary ? colors.textPrimary : colors.textSecondary }}>
              {summary || 'AI summary auto-generates when call ends.'}
            </div>
          );
        })()}
      </div>

      {/* Submission status */}
      <div style={s.statusRow}>
        {submitted ? (
          <span style={{ color: colors.authGreen, fontWeight: '700', fontSize: '13px' }}>
            Submitted to SAP
          </span>
        ) : (
          <span style={{ color: colors.textSecondary, fontSize: '12px', fontStyle: 'italic' }}>
            {originalAiSummary ? '' : ''}
          </span>
        )}
      </div>
    </div>
  );
};

export default SAICPanel;
