import React, { useState, useEffect } from 'react';
import { Manager } from '@twilio/flex-ui';
import { useAgentAssistWebSocket } from '../../hooks/useAgentAssistWebSocket';

// Flex Panel1.Content and CRMContainer.Content do not always inject the `task`
// prop the same way Panel2 does. Read directly from the Flex Redux store as a fallback.
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

  // ── Section headers ──────────────────────────────────────────────
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
  sectionSubtitle: {
    background: '#eef0f2',
    color: colors.textSecondary,
    padding: '5px 16px',
    fontSize: '11px',
    fontStyle: 'italic',
    borderBottom: `1px solid ${colors.borderColor}`,
  },

  // ── Field rows ───────────────────────────────────────────────────
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

  // ── Auth status ──────────────────────────────────────────────────
  authRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
  },
  authDot: {
    width: '9px',
    height: '9px',
    borderRadius: '50%',
    flexShrink: 0,
  },

  // ── Intent tags ──────────────────────────────────────────────────
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

  // ── Insights ─────────────────────────────────────────────────────
  insightsBox: {
    padding: '10px 16px',
    borderBottom: `1px solid ${colors.borderColor}`,
    background: colors.sectionBg,
  },
  insightTitle: {
    fontSize: '11px',
    color: colors.textLabel,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    marginBottom: '8px',
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

  // ── Summary ───────────────────────────────────────────────────────
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
  summaryTextarea: {
    width: '100%',
    boxSizing: 'border-box',
    color: colors.textPrimary,
    lineHeight: '1.6',
    background: colors.white,
    border: `2px solid ${colors.sapBlue}`,
    borderRadius: '4px',
    padding: '10px 12px',
    minHeight: '90px',
    fontSize: '13px',
    fontFamily: 'inherit',
    resize: 'vertical',
    outline: 'none',
  },

  // ── Structured summary ────────────────────────────────────────────
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

  // ── Buttons ───────────────────────────────────────────────────────
  btnRow: {
    display: 'flex',
    gap: '10px',
    padding: '12px 16px',
    borderTop: `1px solid ${colors.borderColor}`,
    background: colors.sectionBg,
    flexShrink: 0,
  },
  btnEdit: {
    flex: 1,
    padding: '8px 0',
    background: colors.white,
    color: colors.navyHeader,
    border: `1px solid ${colors.navyHeader}`,
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    fontFamily: 'inherit',
    transition: 'background 0.15s',
  },
  btnSubmit: {
    flex: 2,
    padding: '8px 0',
    background: colors.sapBlue,
    color: colors.white,
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    fontFamily: 'inherit',
    transition: 'background 0.15s',
  },

  // ── Two-column field rows ─────────────────────────────────────────
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

// Regex patterns for each key — customer_satisfaction may appear as "customer satisfaction" (space) in AI output
const SUMMARY_KEY_PATTERNS = {
  situation: 'situation',
  action: 'action',
  resolution: 'resolution',
  customer_satisfaction: 'customer[_ ]satisfaction',
};

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
  return matched ? result : null;
}

function AutoTextarea({ value, onChange }) {
  const ref = React.useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = 'auto';
    ref.current.style.height = ref.current.scrollHeight + 'px';
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      rows={1}
      style={{
        width: '100%',
        boxSizing: 'border-box',
        color: colors.textPrimary,
        lineHeight: '1.6',
        background: colors.white,
        border: `1px solid ${colors.sapBlue}`,
        borderRadius: '3px',
        padding: '4px 6px',
        fontSize: '13px',
        fontFamily: 'inherit',
        outline: 'none',
        overflow: 'hidden',
        resize: 'none',
        minHeight: '24px',
      }}
    />
  );
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

// Alias so the existing <StatedReasonValue> JSX is untouched
const StatedReasonValue = ({ value }) => <CopyableValue value={value} />;

// Copy-on-click for values inside the dark navy header (white text styling)
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
  // Resolve task — use Flex-injected prop when available, otherwise fall back
  // to the Flex Redux store. Panel1.Content doesn't always inject the task prop.
  const [task, setTask] = useState(() => taskProp || getFlexTask());

  useEffect(() => {
    if (taskProp) {
      setTask(taskProp);
      return;
    }
    setTask(getFlexTask());
    try {
      return Manager.getInstance().store.subscribe(() => setTask(getFlexTask()));
    } catch { return undefined; }
  }, [taskProp]);

  const { preCall: wsPreCall, sentiment, postCall } = useAgentAssistWebSocket(task);

  // Cache last known preCall so fields stay visible after the task is removed (post-call)
  const [cachedPreCall, setCachedPreCall] = useState(null);
  useEffect(() => {
    if (wsPreCall) setCachedPreCall(wsPreCall);
  }, [wsPreCall]);

  const preCall = wsPreCall || cachedPreCall;

  const [editing, setEditing] = useState(false);
  const [editFields, setEditFields] = useState({});
  const [summary, setSummary] = useState('');
  const [summaryEdited, setSummaryEdited] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const taskSid = task?.taskSid || task?.sid || null;

  // Populate summary from postCall when it arrives, unless user already edited it
  useEffect(() => {
    if (postCall?.summary && !summaryEdited) {
      setSummary(postCall.summary);
    }
  }, [postCall?.summary, summaryEdited]);

  // Reset on new task
  useEffect(() => {
    setSummary('');
    setSummaryEdited(false);
    setEditing(false);
    setSubmitted(false);
    setCachedPreCall(null);
  }, [taskSid]);

  // Direct task-attribute fallbacks so pre-call section populates even when
  // the WebSocket hasn't delivered a pre_call_summary message yet.
  const attrs = task?.attributes || {};

  const callerId =
    preCall?.callersPhoneNumber ||
    attrs.from ||
    attrs.caller ||
    null;

  const accountNumber =
    preCall?.accountNumber ||
    attrs.accountNumber ||
    attrs.account_number ||
    attrs.AccountNumber ||
    null;

  const callerName = preCall?.callerName || attrs.callerName || attrs.name || null;
  const accountName = preCall?.accountName || attrs.accountName || null;

  const authStatus = preCall?.authenticationStatus || attrs.authenticationStatus || null;
  const isVerified = authStatus === 'AUTHENTICATED' || authStatus === 'Verified' || authStatus === 'true';
  const authDotColor = authStatus
    ? (isVerified ? colors.authGreen : colors.sentimentRed)
    : '#cccccc';
  const authTextColor = authStatus
    ? (isVerified ? colors.authGreen : colors.sentimentRed)
    : colors.textSecondary;
  const authLabel = authStatus
    ? (isVerified ? 'Authenticated' : 'Not Authenticated')
    : null;

  const intentVal =
    preCall?.lastOpenIntent ||
    attrs.lastOpenIntent ||
    attrs.intentIdentified ||
    null;
  const intents = intentVal ? [intentVal] : [];

  const statedReason = preCall?.statedReason || attrs.statedReason || null;
  const ivrPath = preCall?.IVRPathSummary || attrs.IVRPathSummary || null;

  // Pre-call sentiment — static from IVR handoff, shown in pre-call section
  const preCallSentiment = preCall?.sentimentAnalysis || attrs.sentimentAnalysis || null;

  // Live sentiment — dynamic, updated during the call, shown in post-call section
  const sentimentLabel = sentiment?.sentimentLabel || preCallSentiment || null;
  const sentimentColor = getSentimentColor(sentimentLabel);

  const postCallDuration = formatDuration(postCall?.callDurationSeconds);

  const handleEnterEdit = () => {
    const parsed = parseSummaryFields(summary) || {};
    setEditFields({
      situation: parsed.situation || '',
      action: parsed.action || '',
      resolution: parsed.resolution || '',
      customer_satisfaction: parsed.customer_satisfaction || '',
    });
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setEditFields({});
  };

  const handleSave = () => {
    const rebuilt = SUMMARY_KEYS
      .filter((k) => editFields[k])
      .map((k) => `${k}\n${editFields[k]}`)
      .join('\n');
    setSummary(rebuilt || summary);
    setSummaryEdited(true);
    setEditFields({});
    setEditing(false);
  };

  const handleSubmit = () => {
    if (editing) {
      const rebuilt = SUMMARY_KEYS
        .filter((k) => editFields[k])
        .map((k) => `${k}\n${editFields[k]}`)
        .join('\n');
      setSummary(rebuilt || summary);
      setSummaryEdited(true);
      setEditFields({});
    }
    setEditing(false);
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  };

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
            <CopyableValue value={callerId} placeholder="Waiting..." />
          </div>
        </div>
        <div style={s.fieldColRight}>
          <div style={s.fieldLabel}>Account Number</div>
          <div style={s.fieldValue}>
            <CopyableValue value={accountNumber} />
          </div>
        </div>
      </div>

      {/* Authentication Status | Sentiment Analysis (Pre-Call) */}
      <div style={s.fieldRowDouble}>
        <div style={s.fieldColLeft}>
          <div style={s.fieldLabel}>Authentication Status</div>
          <div style={{ ...s.fieldValue, ...s.authRow }}>
            <span style={{ ...s.authDot, background: authDotColor }} />
            <span style={{ color: authTextColor, fontWeight: '600' }}>
              {authLabel || <Placeholder text="—" />}
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
              <Placeholder text="—" />
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
              : <Placeholder text="—" />
            }
          </div>
        </div>
        <div style={s.fieldColRight}>
          <div style={s.fieldLabel}>Stated Reason</div>
          <StatedReasonValue value={statedReason} />
        </div>
      </div>

      <div style={s.fieldRow}>
        <div style={s.fieldLabel}>IVR Path</div>
        <div style={s.fieldValue}>
          {ivrPath || <Placeholder text="—" />}
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
      <div style={s.sectionSubtitle}>Pre-populated information from an IVR handoff</div>

      {/* Real-time Insights */}
      <div style={s.insightsBox}>
        <div style={s.insightTitle}>Real-time Insights</div>
        <div style={s.sentimentLine}>Sentiment Analysis</div>
        <div style={s.sentimentValue}>
          {sentimentLabel ? (
            <>
              <span style={{ ...s.sentimentDot, background: sentimentColor }} />
              <span style={{ color: sentimentColor, fontWeight: '700', fontSize: '13px' }}>
                {normalizeSentiment(sentimentLabel)}
              </span>
            </>
          ) : (
            <Placeholder text="Waiting for live data..." />
          )}
        </div>
      </div>

      {/* AI Summary */}
      <div style={s.summaryBox}>
        <div style={s.summaryLabel}>Generative AI Session Summarization</div>
        {editing ? (
          <div style={{ ...s.summaryText, padding: '10px 12px', background: colors.white, border: `2px solid ${colors.sapBlue}` }}>
            {SUMMARY_DISPLAY_KEYS.map((k, idx) => (
              <div key={k} style={{ ...s.summaryField, marginBottom: '10px' }}>
                <div style={s.summaryFieldLabel}>{SUMMARY_LABELS[k]}</div>
                <AutoTextarea
                  value={editFields[k] || ''}
                  onChange={(e) => { setEditFields((prev) => ({ ...prev, [k]: e.target.value })); setSummaryEdited(true); }}
                />
              </div>
            ))}
          </div>
        ) : (() => {
          const parsed = parseSummaryFields(summary);
          if (parsed) {
            return (
              <div style={{ ...s.summaryText, padding: '10px 12px' }}>
                {SUMMARY_DISPLAY_KEYS.map((k) => (
                  <div key={k} style={s.summaryField}>
                    <div style={s.summaryFieldLabel}>{SUMMARY_LABELS[k]}</div>
                    <div style={parsed[k] ? s.summaryFieldValue : { ...s.summaryFieldValue, color: colors.textSecondary, fontStyle: 'italic' }}>
                      {parsed[k] || '—'}
                    </div>
                  </div>
                ))}
              </div>
            );
          }
          return (
            <div style={{ ...s.summaryText, color: summary ? colors.textPrimary : colors.textSecondary }}>
              {summary || 'Waiting for session summary...'}
            </div>
          );
        })()}
      </div>

      {/* Action buttons */}
      <div style={s.btnRow}>
        <button
          style={s.btnEdit}
          onClick={editing ? handleCancelEdit : handleEnterEdit}
        >
          {editing ? 'Cancel' : 'Edit'}
        </button>
        {editing ? (
          <button style={s.btnSubmit} onClick={handleSave}>
            Save
          </button>
        ) : (
          <button
            style={{
              ...s.btnSubmit,
              background: submitted ? '#107e3e' : colors.sapBlue,
            }}
            onClick={handleSubmit}
            disabled={submitted}
          >
            {submitted ? 'Submitted!' : 'Submit to SAP'}
          </button>
        )}
      </div>
    </div>
  );
};

export default SAICPanel;
