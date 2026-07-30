import React from 'react';
import { useFlexSelector } from '@twilio/flex-ui';
import { openSupervisorModal } from './SupervisorJoinModal';

const PlusPersonIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <line x1="19" y1="8" x2="19" y2="14"/>
    <line x1="22" y1="11" x2="16" y2="11"/>
  </svg>
);

// Injected into flex.CallCanvas.Content — replaces the native add-participant flow
// with a supervisor-picker modal. Renders nothing when there is no active voice task.
const AddSupervisorButton = () => {
  const task = useFlexSelector(state => {
    const tasks = state.flex.worker.tasks;
    for (const t of tasks.values()) {
      if (t.taskChannelUniqueName === 'voice' && t.status === 'accepted') return t;
    }
    return null;
  });

  if (!task) return null;

  return (
    <button
      onClick={() => openSupervisorModal(task)}
      title="Add supervisor to call"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '8px 14px',
        margin: '4px 0',
        border: '1px solid #1a3352',
        borderRadius: '4px',
        background: '#ffffff',
        color: '#1a3352',
        fontWeight: '600',
        cursor: 'pointer',
        fontFamily: '"72", "72full", Arial, Helvetica, sans-serif',
        fontSize: '13px',
        width: '100%',
        justifyContent: 'center',
        transition: 'background 0.15s, color 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = '#1a3352';
        e.currentTarget.style.color = '#ffffff';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = '#ffffff';
        e.currentTarget.style.color = '#1a3352';
      }}
    >
      <PlusPersonIcon />
      Add Supervisor
    </button>
  );
};

export default AddSupervisorButton;
