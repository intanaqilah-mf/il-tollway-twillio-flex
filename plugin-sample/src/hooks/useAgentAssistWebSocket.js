import { useState, useEffect, useRef } from 'react';
import { Manager } from '@twilio/flex-ui';

const WSS_URL = 'wss://gapi.getipass.com/ivr/relay-server-open/dev/browser-ui/streaming';
const MAX_RETRIES = 3;

const MOCK_PRE_CALL = {
  authenticationStatus: 'AUTHENTICATED',
  lastOpenIntent: 'PayToll',
  IVRPathSummary: 'Customer navigated IVR → Billing → Pay Toll',
  statedReason: 'Pay outstanding toll balance',
  sentimentAnalysis: 'Negative',
  callersPhoneNumber: '+16301234567',
};

const MOCK_TRANSCRIPT = [
  { transcript: 'Hi, I need to pay my outstanding toll balance.', speaker: 'customer', ts: new Date().toISOString() },
  { transcript: 'Of course, let me pull up your account.', speaker: 'agent', ts: new Date().toISOString() },
];

const MOCK_SENTIMENT = { sentimentLabel: 'Negative', sentimentScore: -0.62 };

export function useAgentAssistWebSocket(task) {
  const [preCall, setPreCall] = useState(null);
  const [transcript, setTranscript] = useState([]);
  const [sentiment, setSentiment] = useState(null);
  const [postCall, setPostCall] = useState(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const [isMock, setIsMock] = useState(false);

  const wsRef = useRef(null);
  const retryCountRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const mockTimerRef = useRef(null);
  const intentionalCloseRef = useRef(false);

  useEffect(() => {
    if (!task) {
      intentionalCloseRef.current = true;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
      clearTimeout(mockTimerRef.current);
      mockTimerRef.current = null;
      setPreCall(null);
      setTranscript([]);
      setSentiment(null);
      setPostCall(null);
      setConnected(false);
      setError(null);
      setIsMock(false);
      return;
    }

    console.log('[AA] task present:', task.taskSid || task.sid || task);

    // Fall back to mock data if the real WebSocket hasn't delivered pre_call_summary within 1500ms
    mockTimerRef.current = setTimeout(() => {
      setPreCall((prev) => {
        if (prev !== null) return prev;
        setIsMock(true);
        setSentiment(MOCK_SENTIMENT);
        setTranscript(MOCK_TRANSCRIPT);
        return MOCK_PRE_CALL;
      });
    }, 1500);

    const connect = () => {
      let flexToken;
      try {
        // manager.user.token returns the raw JWT string needed for Sec-WebSocket-Protocol
        flexToken = Manager.getInstance().user.token;
      } catch {
        setError('Failed to retrieve Flex token');
        console.error('[AA] token retrieval threw');
        return;
      }

      console.log('[AA] token type:', typeof flexToken);
      console.log('[AA] token starts with:', flexToken?.slice(0, 10));

      if (!flexToken || typeof flexToken !== 'string') {
        setError('No Flex token available');
        console.error('[AA] token invalid:', flexToken);
        return;
      }

      intentionalCloseRef.current = false;
      console.log('[AA] opening WebSocket...');
      // Auth: raw JWT sent as Sec-WebSocket-Protocol header — NOT in the URL
      const ws = new WebSocket(WSS_URL, [`Bearer.${flexToken}`]);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[AA] WebSocket connected');
        setConnected(true);
        setError(null);
        retryCountRef.current = 0;
      };

      ws.onmessage = (event) => {
        let data;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }

        console.log('[AA] message received, type:', data.type);
        switch (data.type) {
          case 'pre_call_summary':
            setIsMock(false);
            setPreCall({
              authenticationStatus: data.authenticationStatus,
              lastOpenIntent: data.lastOpenIntent,
              IVRPathSummary: data.IVRPathSummary,
              statedReason: data.statedReason,
              sentimentAnalysis: data.sentimentAnalysis,
              callersPhoneNumber: data.callersPhoneNumber,
            });
            break;
          case 'transcript':
            setTranscript((prev) => [
              ...prev,
              { transcript: data.transcript, speaker: data.speaker, ts: data.ts },
            ]);
            break;
          case 'sentiment':
            setSentiment({
              sentimentLabel: data.sentimentLabel,
              sentimentScore: data.sentimentScore,
            });
            break;
          case 'post_call_summary':
            setPostCall({
              summary: data.summary,
              overallSentiment: data.overallSentiment,
              callDurationSeconds: data.callDurationSeconds,
            });
            break;
          default:
            break;
        }
      };

      ws.onerror = (e) => {
        console.error('[AA] WebSocket error:', e);
        setConnected(false);
        setError('WebSocket connection error');
        // Schedule reconnect only if one is not already pending
        if (retryCountRef.current < MAX_RETRIES && !reconnectTimerRef.current) {
          retryCountRef.current += 1;
          console.log(`[AA] scheduling reconnect (attempt ${retryCountRef.current}/${MAX_RETRIES}) in 3000ms`);
          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            connect();
          }, 3000);
        }
      };

      ws.onclose = (e) => {
        console.log('[AA] WebSocket closed — code:', e.code, 'intentional:', intentionalCloseRef.current);
        setConnected(false);
        // onerror fires before onclose — only reconnect here for clean unexpected closes
        if (!intentionalCloseRef.current && retryCountRef.current < MAX_RETRIES && !reconnectTimerRef.current) {
          console.log('[AA] scheduling reconnect after unexpected close in 2000ms');
          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            connect();
          }, 2000);
        }
      };
    };

    connect();

    return () => {
      intentionalCloseRef.current = true;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
      clearTimeout(mockTimerRef.current);
      mockTimerRef.current = null;
    };
  }, [task]);

  return { preCall, transcript, sentiment, postCall, connected, error, isMock };
}
