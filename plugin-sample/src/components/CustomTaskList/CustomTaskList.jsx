import React, { useState } from 'react';

const CustomTaskList = () => {
  const [isOpen, setIsOpen] = useState(true);
  if (!isOpen) return null;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 16px',
      background: '#f5f6f7',
      border: '1px solid #e0e0e0',
      borderRadius: '4px',
      fontSize: '13px',
      color: '#32363a',
      fontFamily: '"72", "72full", Arial, Helvetica, sans-serif',
    }}>
      <span>This is a dismissible demo component.</span>
      <button
        onClick={() => setIsOpen(false)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: '16px',
          color: '#6a6d70',
          lineHeight: 1,
          padding: '0 0 0 12px',
        }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
};

export default CustomTaskList;
