import React, { useState } from 'react';

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
    background: colors.authGreen,
    flexShrink: 0,
  },
  authText: {
    color: colors.authGreen,
    fontWeight: '600',
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
    background: colors.sentimentRed,
    flexShrink: 0,
  },
  sentimentText: {
    color: colors.sentimentRed,
    fontWeight: '700',
    fontSize: '13px',
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
};

const MOCK_INTENTS = ['Toll Complaint', 'I-PASS Inquiry', 'Refund Request'];

const DEFAULT_SUMMARY =
  'A customer complaint regarding a toll charge on 10/26/2023 despite having an I-PASS. Agent confirmed I-PASS was in vehicle and filed a formal complaint (Case C-98765). Customer advised to monitor email.';

const SAICPanel = ({ task }) => {
  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState(DEFAULT_SUMMARY);
  const [submitted, setSubmitted] = useState(false);

  const callerId =
    (task && task.attributes && task.attributes.from) || '+1 (555) 234-5678';

  const handleSubmit = () => {
    setEditing(false);
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  };

  return (
    <div style={s.container}>

      {/* ── PRE-CALL SECTION ── */}
      <div style={s.sectionBar}>
        <span>Pre-Call Information</span>
        <span style={s.sectionBarMeta}>CA123456789 | 3m 42s</span>
      </div>

      <div style={s.fieldRow}>
        <div style={s.fieldLabel}>Caller ID</div>
        <div style={s.fieldValue}>{callerId}</div>
      </div>

      <div style={s.fieldRow}>
        <div style={s.fieldLabel}>Authentication Status</div>
        <div style={{ ...s.fieldValue, ...s.authRow }}>
          <span style={s.authDot} />
          <span style={s.authText}>Verified</span>
        </div>
      </div>

      <div style={s.fieldRow}>
        <div style={s.fieldLabel}>Intents Identified</div>
        <div style={s.tagWrap}>
          {MOCK_INTENTS.map((intent) => (
            <span key={intent} style={s.tag}>{intent}</span>
          ))}
        </div>
      </div>

      <div style={s.fieldRow}>
        <div style={s.fieldLabel}>Stated Reason</div>
        <div style={s.fieldValue}>
          Charged for toll despite active I-PASS — wants to file a complaint
        </div>
      </div>

      <div style={s.fieldRow}>
        <div style={s.fieldLabel}>IVR Path</div>
        <div style={s.fieldValue}>
          Main Menu &rsaquo; Billing &rsaquo; Toll Dispute &rsaquo; Agent Transfer
        </div>
      </div>

      {/* ── POST-CALL WRAP-UP SECTION ── */}
      <div style={s.sectionBar}>
        <span>Post-Call Wrap-Up</span>
        <span style={s.sectionBarMeta}>CA123456789 | 5m 30s</span>
      </div>
      <div style={s.sectionSubtitle}>Pre-populated information from an IVR handoff</div>

      {/* Real-time Insights */}
      <div style={s.insightsBox}>
        <div style={s.insightTitle}>Real-time Insights</div>
        <div style={s.sentimentLine}>Sentiment Analysis:</div>
        <div style={s.sentimentValue}>
          <span style={s.sentimentDot} />
          <span style={s.sentimentText}>Negative (Frustrated)</span>
        </div>
      </div>

      {/* AI Summary */}
      <div style={s.summaryBox}>
        <div style={s.summaryLabel}>Generative AI Session Summarization</div>
        {editing ? (
          <textarea
            style={s.summaryTextarea}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            autoFocus
          />
        ) : (
          <div style={s.summaryText}>{summary}</div>
        )}
      </div>

      {/* Action buttons */}
      <div style={s.btnRow}>
        <button
          style={s.btnEdit}
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? 'Cancel' : 'Edit'}
        </button>
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
      </div>
    </div>
  );
};

export default SAICPanel;
