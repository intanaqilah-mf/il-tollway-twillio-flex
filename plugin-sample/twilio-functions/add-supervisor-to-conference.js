/**
 * Twilio Function: add-supervisor-to-conference
 *
 * Adds a supervisor to an in-progress Flex conference in one of three modes:
 *   full    — regular participant, can speak to everyone
 *   listen  — muted participant, hears everything but cannot speak
 *   coach   — coaching mode, only the agent (callSidToCoach) can hear the supervisor
 *
 * Receives application/x-www-form-urlencoded POST (no JSON / no Authorization header
 * so no CORS preflight is required — the browser sends it as a simple request).
 *
 * Required env vars (set in Twilio Console → Functions → your service → Environment Variables):
 *   TWILIO_NUMBER   — E.164 Twilio number used as caller ID, e.g. +16505551234
 *
 * Expected POST fields:
 *   conferenceSid  — task.conference.sid
 *   to             — supervisor's contact_uri, e.g. "client:sindhuja.ravindran"
 *   mode           — "full" | "listen" | "coach"
 *   agentCallSid   — required for coach: task.conference.participants.worker.callSid
 */
exports.handler = function (context, event, callback) {
  const response = new Twilio.Response();
  response.appendHeader('Access-Control-Allow-Origin', '*');
  response.appendHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.appendHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.appendHeader('Content-Type', 'application/json');

  const { conferenceSid, to, mode, agentCallSid } = event;

  console.log('[add-supervisor] received params:', JSON.stringify({ conferenceSid, to, mode, agentCallSid }));
  console.log('[add-supervisor] TWILIO_NUMBER env:', context.TWILIO_NUMBER);

  if (!conferenceSid || !to || !mode) {
    console.error('[add-supervisor] missing required params');
    response.setStatusCode(400);
    response.setBody(JSON.stringify({ error: 'conferenceSid, to, and mode are required' }));
    return callback(null, response);
  }

  if ((mode === 'coach' || mode === 'takeover') && !agentCallSid) {
    console.error('[add-supervisor] coach/takeover mode missing agentCallSid');
    response.setStatusCode(400);
    response.setBody(JSON.stringify({ error: 'agentCallSid is required for coach and takeover modes' }));
    return callback(null, response);
  }

  const client = context.getTwilioClient();

  const participantConfig = {
    to,
    from: context.TWILIO_NUMBER,
    earlyMedia: true,
  };

  if (mode === 'listen') {
    participantConfig.muted = true;
  } else if (mode === 'coach') {
    participantConfig.coaching = true;
    participantConfig.callSidToCoach = agentCallSid;
  }
  // 'full' and 'takeover' both join as regular full participant

  console.log('[add-supervisor] creating participant with config:', JSON.stringify(participantConfig));
  console.log('[add-supervisor] targeting conference:', conferenceSid);

  client.conferences(conferenceSid)
    .participants
    .create(participantConfig)
    .then(async participant => {
      console.log('[add-supervisor] supervisor joined — participantCallSid:', participant.callSid);

      if (mode === 'takeover') {
        // Remove the original agent from the conference so the supervisor takes over.
        // We add the supervisor first so the conference stays alive when the agent leaves.
        console.log('[add-supervisor] takeover — removing agent callSid:', agentCallSid);
        try {
          await client.conferences(conferenceSid).participants(agentCallSid).remove();
          console.log('[add-supervisor] takeover — agent removed successfully');
        } catch (kickErr) {
          // Log but don't fail the whole request — supervisor is already in
          console.error('[add-supervisor] takeover — failed to remove agent:', kickErr.message);
        }
      }

      // Start live transcription on the supervisor's call leg (full/coach only).
      // Transcription events hit TRANSCRIPT_WEBHOOK_URL which forwards them to the
      // relay so supervisor speech surfaces as "Supervisor" in the transcript panel.
      // Listen-only supervisors are muted so transcription is unnecessary.
      if ((mode === 'full' || mode === 'coach') && context.TRANSCRIPT_WEBHOOK_URL) {
        try {
          await client.calls(participant.callSid).transcriptions.create({
            statusCallback: context.TRANSCRIPT_WEBHOOK_URL,
            statusCallbackMethod: 'POST',
          });
          console.log('[add-supervisor] live transcription started on supervisor call');
        } catch (transcriptErr) {
          // Non-fatal — supervisor is already in the call; transcription is best-effort
          console.warn('[add-supervisor] could not start transcription:', transcriptErr.message);
        }
      }

      response.setStatusCode(200);
      response.setBody(JSON.stringify({ success: true, participantCallSid: participant.callSid }));
      callback(null, response);
    })
    .catch(err => {
      console.error('[add-supervisor] Twilio API error:', err.code, err.message);
      response.setStatusCode(500);
      response.setBody(JSON.stringify({ error: err.message, code: err.code }));
      callback(null, response);
    });
};
