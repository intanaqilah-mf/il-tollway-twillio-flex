import React, { createContext, useContext, useState, useEffect } from 'react';

const CallContext = createContext({ task: null, user: { token: '', email: '' } });

// Seed initial state from URL query params so the parent frame can pass
// call data to the iframe via: ?taskSid=...&callSid=...&token=...&agentEmail=...
function parseUrlParams() {
  const p = new URLSearchParams(window.location.search);
  const taskSid = p.get('taskSid');
  return {
    task: taskSid
      ? {
          taskSid,
          sid: taskSid,
          status: p.get('status') || 'accepted',
          attributes: {
            call_sid: p.get('callSid') || null,
            from: p.get('from') || null,
            authenticationStatus: p.get('authStatus') || null,
            lastOpenIntent: p.get('intent') || null,
            statedReason: p.get('reason') || null,
            IVRPathSummary: p.get('ivrPath') || null,
            sentimentAnalysis: p.get('sentiment') || null,
            accountNumber: p.get('accountNumber') || null,
            accountName: p.get('accountName') || null,
            callerName: p.get('callerName') || null,
          },
        }
      : null,
    user: {
      token: p.get('token') || '',
      email: p.get('agentEmail') || '',
    },
  };
}

// Parent frame can push updates via postMessage:
//   window.frames[0].postMessage({ type: 'CALL_CONTEXT_UPDATE', payload: { task: {...}, user: {...} } }, '*')
export function CallProvider({ children }) {
  const [state, setState] = useState(parseUrlParams);

  useEffect(() => {
    const handler = (event) => {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'CALL_CONTEXT_UPDATE') {
        setState((prev) => ({ ...prev, ...msg.payload }));
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  return (
    <CallContext.Provider value={state}>
      {children}
    </CallContext.Provider>
  );
}

export function useCallContext() {
  return useContext(CallContext);
}
