import React, { useState, useEffect, useRef } from 'react';
import { useFlexSelector } from '@twilio/flex-ui';
import SAICPanel from '../SAICPanel/SAICPanel';
import LiveTranscript from '../LiveTranscript/LiveTranscript';

const DIVIDER_PX = 5;
const MIN_COL3 = 180;
const MAX_COL3 = 700;

const ThreeColumnLayout = () => {
  const task = useFlexSelector((state) => {
    const tasks = state.flex.worker.tasks;
    for (const t of tasks.values()) {
      if (t.taskChannelUniqueName === 'voice' && t.status === 'accepted') return t;
    }
    return null;
  });

  const [col3Width, setCol3Width] = useState(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef(null);
  const col3Ref = useRef(null);

  useEffect(() => {
    const onMove = (e) => {
      if (!drag.current) return;
      const dx = e.clientX - drag.current.startX;
      setCol3Width(Math.max(MIN_COL3, Math.min(MAX_COL3, drag.current.startW - dx)));
    };
    const onUp = () => {
      drag.current = null;
      setDragging(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const startDrag = (e) => {
    e.preventDefault();
    const startW = col3Ref.current?.offsetWidth ?? MIN_COL3;
    drag.current = { startX: e.clientX, startW };
    if (col3Width === null) setCol3Width(startW);
    setDragging(true);
  };

  const dividerStyle = (hovered) => ({
    width: `${DIVIDER_PX}px`,
    flexShrink: 0,
    cursor: 'col-resize',
    background: hovered ? '#0070b9' : '#d9d9d7',
    transition: 'background 0.15s',
    zIndex: 1,
  });

  return (
    <div style={{
      display: 'flex',
      height: '100%',
      overflow: 'hidden',
      background: '#f0f0ee',
      userSelect: dragging ? 'none' : 'auto',
    }}>

      {/* Column 1 — Pre-call + Post-call */}
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', overflowX: 'hidden' }}>
        <SAICPanel task={task} />
      </div>

      <DividerHandle onMouseDown={startDrag} dividerStyle={dividerStyle} />

      {/* Column 2 — Live Transcript */}
      <div
        ref={col3Ref}
        style={col3Width !== null
          ? { width: col3Width, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }
          : { flex: 1, minWidth: MIN_COL3, display: 'flex', flexDirection: 'column', overflow: 'hidden' }
        }
      >
        <LiveTranscript task={task} />
      </div>

    </div>
  );
};

function DividerHandle({ onMouseDown, dividerStyle }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={dividerStyle(hovered)}
    />
  );
}

export default ThreeColumnLayout;
