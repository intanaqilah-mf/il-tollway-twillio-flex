/**
 * Twilio Function: supervisor-transcript-webhook
 *
 * Receives Twilio real-time call transcription callbacks for the supervisor's
 * call leg and forwards final utterances to the relay server so they appear in
 * the agent's Live Transcript panel labelled as "Supervisor".
 *
 * Wire this function's URL as the TRANSCRIPT_WEBHOOK_URL env var in
 * add-supervisor-to-conference.js, and add it to Twilio → Functions → your
 * service → Function Paths.
 *
 * Required env vars (set in Twilio Console → Functions → Environment Variables):
 *   RELAY_SUPERVISOR_WEBHOOK_URL — relay HTTP endpoint that accepts supervisor
 *     transcript pushes, e.g.:
 *     https://gapi.getipass.com/ai/agent-assist/supervisor-transcript
 *
 * ── What the relay server must implement ─────────────────────────────────────
 *
 *   1. Handle the "supervisor_joined" WebSocket message sent by the plugin after
 *      a supervisor joins:
 *        { type: "supervisor_joined", supervisorCallSid: "CA..." }
 *      Store the mapping: supervisorCallSid → session/subscriber.
 *
 *   2. Expose a new HTTP endpoint:
 *        POST /ai/agent-assist/supervisor-transcript
 *        Body: { callSid: string, transcript: string, ts: number }
 *      Look up the subscriber registered for that callSid and broadcast:
 *        { type: "transcript", speaker: "supervisor", transcript, ts }
 *      via the existing WebSocket connection to the agent's browser.
 *
 * The frontend (LiveTranscript.jsx) already renders any speaker that is not
 * "agent" or "customer" as a green supervisor bubble — no frontend changes needed.
 * ─────────────────────────────────────────────────────────────────────────────
 */
exports.handler = async function (context, event, callback) {
  const { TranscriptionEvent, TranscriptionData, CallSid } = event;

  // Only forward final transcript content; ignore started/stopped events and partials
  if (TranscriptionEvent !== 'transcription-content' || !TranscriptionData || !CallSid) {
    return callback(null, '');
  }

  let transcript;
  try {
    const data = JSON.parse(TranscriptionData);
    // speech_final: false means a partial (in-progress) utterance — skip to avoid
    // duplicate entries when the final version arrives a moment later
    if (data.speech_final === false) return callback(null, '');
    transcript = data?.channel?.alternatives?.[0]?.transcript?.trim();
  } catch {
    console.error('[sv-webhook] could not parse TranscriptionData:', TranscriptionData);
    return callback(null, '');
  }

  if (!transcript) return callback(null, '');

  const relayUrl = context.RELAY_SUPERVISOR_WEBHOOK_URL;
  if (!relayUrl) {
    console.error('[sv-webhook] RELAY_SUPERVISOR_WEBHOOK_URL is not configured');
    return callback(null, '');
  }

  const payload = JSON.stringify({ callSid: CallSid, transcript, ts: Date.now() });

  try {
    const res = await fetch(relayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    console.log('[sv-webhook] forwarded to relay — HTTP', res.status, '| callSid:', CallSid, '| text:', transcript.slice(0, 60));
  } catch (err) {
    console.error('[sv-webhook] failed to forward to relay:', err.message);
  }

  callback(null, '');
};
