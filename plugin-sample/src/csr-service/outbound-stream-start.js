/**
 * path: /outbound-stream-start
 *
 * Receives AMD (Answering Machine Detection) status callbacks and outbound call
 * status callbacks for callback-type outbound calls placed by agents via Flex.
 *
 * It writes `customerAnswered: true` (human picked up) or `customerAnswered: false`
 * (no-answer / busy / voicemail) onto the callback task.  The Flex plugin reads
 * this attribute in `wasCallAnswered()` before falling back to transcript heuristics.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW TO WIRE AMD (Answering Machine Detection) — Twilio Console / API
 * ─────────────────────────────────────────────────────────────────────────────
 * AMD must be added to the outbound call placed TO THE CUSTOMER (not the agent leg).
 * How to do this depends on how your Flex installation places the customer call:
 *
 * Option A — Flex Outbound TwiML (most common):
 *   In the Twilio Console → Flex → Settings → Agent Desktop → Outbound Calling,
 *   set the "Outbound Voice URL" to a Twilio Function that builds the <Dial> TwiML
 *   and passes through the machineDetection parameters, e.g.:
 *
 *     const dial = twiml.dial({ callerId: event.CallerId });
 *     dial.number({
 *       machineDetection: 'Enable',
 *       asyncAmdStatusCallback: `https://${context.DOMAIN_NAME}/outbound-stream-start?mode=amdCallback`,
 *       asyncAmdStatusCallbackMethod: 'POST',
 *     }, event.To);
 *
 * Option B — Twilio REST API call (custom outbound flow):
 *   When calling client.calls.create(), add:
 *     machineDetection: 'Enable',                     // or 'DetectMessageEnd' for more detail
 *     asyncAmdStatusCallback: `https://${DOMAIN}/outbound-stream-start?mode=amdCallback`,
 *     asyncAmdStatusCallbackMethod: 'POST',
 *     statusCallback:       `https://${DOMAIN}/outbound-stream-start?mode=callStatus`,
 *     statusCallbackMethod: 'POST',
 *     statusCallbackEvent:  ['no-answer', 'busy', 'failed', 'completed'],
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW TO WIRE CALL STATUS CALLBACKS (no-answer / busy detection without AMD)
 * ─────────────────────────────────────────────────────────────────────────────
 * Add to the customer-facing outbound call:
 *   statusCallback:       `https://${DOMAIN}/outbound-stream-start?mode=callStatus`
 *   statusCallbackMethod: 'POST'
 *   statusCallbackEvent:  ['no-answer', 'busy', 'failed']
 *
 * These definitively mark customerAnswered=false for un-answered calls — even
 * without AMD — complementing the transcript heuristic in the Flex plugin.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW THIS FUNCTION FINDS THE CALLBACK TASK
 * ─────────────────────────────────────────────────────────────────────────────
 * Twilio fires both AMD and status callbacks with the customer's CallSid.
 * conference-events.js stores that SID as `customerCallSid` on the callback task
 * when the customer joins the conference.  This function queries TaskRouter for
 * the task that has that attribute and writes `customerAnswered` onto it.
 *
 * If the attribute isn't set yet (customer never joined), the function falls back
 * to scanning active outbound tasks by `conference.participants.customer` —
 * which works for AMD results that arrive after the call connects.
 */

exports.handler = async function (context, event, callback) {
    const client = context.getTwilioClient();
    const mode = event.mode || 'amdCallback';

    const response = new Twilio.Response();
    response.appendHeader('Content-Type', 'application/json');

    console.log(`[outbound-stream-start] mode=${mode} CallSid=${event.CallSid}`);

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Find the callback task SID that has customerCallSid === customerCallSid.
     * conference-events.js writes this flat attribute when the customer joins.
     */
    async function findCallbackTaskByCustomerCallSid(customerCallSid) {
        try {
            const tasks = await client.taskrouter
                .workspaces(context.TWILIO_WORKSPACE_SID)
                .tasks.list({
                    evaluateTaskAttributes: `customerCallSid='${customerCallSid}'`,
                    limit: 5,
                });
            if (tasks.length > 0) {
                console.log(`[outbound-stream-start] found callback task ${tasks[0].sid} via customerCallSid`);
                return tasks[0].sid;
            }
        } catch (err) {
            console.error('[outbound-stream-start] findCallbackTaskByCustomerCallSid error:', err.message);
        }
        return null;
    }

    /**
     * Fallback: scan assigned/wrapping outbound tasks to find one where
     * conference.participants.customer matches the given call SID.
     * Used when AMD fires before conference-events.js has stored the flat attribute.
     */
    async function findCallbackTaskByScanning(customerCallSid) {
        try {
            const tasks = await client.taskrouter
                .workspaces(context.TWILIO_WORKSPACE_SID)
                .tasks.list({
                    evaluateTaskAttributes: `type='outbound'`,
                    assignmentStatus: ['assigned', 'wrapping'],
                    limit: 20,
                });

            for (const t of tasks) {
                const attrs = JSON.parse(t.attributes || '{}');
                if (attrs.conference?.participants?.customer === customerCallSid) {
                    const callbackTaskSid = attrs.callbackTaskSid;
                    if (callbackTaskSid) {
                        console.log(`[outbound-stream-start] found callback task ${callbackTaskSid} via scan of outbound task ${t.sid}`);
                        return callbackTaskSid;
                    }
                }
            }
        } catch (err) {
            console.error('[outbound-stream-start] findCallbackTaskByScanning error:', err.message);
        }
        return null;
    }

    /**
     * Write customerAnswered on the callback task.
     * Always fetches fresh attributes to avoid stale-write race conditions.
     */
    async function setCustomerAnswered(callbackTaskSid, answered) {
        try {
            const task = await client.taskrouter
                .workspaces(context.TWILIO_WORKSPACE_SID)
                .tasks(callbackTaskSid)
                .fetch();
            const attrs = JSON.parse(task.attributes || '{}');

            // Don't overwrite a true with false if AMD fires after a human answer
            // was already recorded (edge-case: duplicate webhooks)
            if (attrs.customerAnswered === true && answered === false) {
                console.log(`[outbound-stream-start] skipping overwrite — customerAnswered already true on ${callbackTaskSid}`);
                return;
            }

            attrs.customerAnswered = answered;
            await client.taskrouter
                .workspaces(context.TWILIO_WORKSPACE_SID)
                .tasks(callbackTaskSid)
                .update({ attributes: JSON.stringify(attrs) });

            console.log(`[outbound-stream-start] ✅ customerAnswered=${answered} set on callback task ${callbackTaskSid}`);
        } catch (err) {
            console.error(`[outbound-stream-start] setCustomerAnswered error for ${callbackTaskSid}:`, err.message);
        }
    }

    async function resolveAndUpdate(customerCallSid, answered) {
        let callbackTaskSid = await findCallbackTaskByCustomerCallSid(customerCallSid);
        if (!callbackTaskSid) {
            callbackTaskSid = await findCallbackTaskByScanning(customerCallSid);
        }
        if (callbackTaskSid) {
            await setCustomerAnswered(callbackTaskSid, answered);
        } else {
            console.log(`[outbound-stream-start] ⚠️  no callback task found for customerCallSid=${customerCallSid} — customerAnswered not written (transcript heuristic will be used instead)`);
        }
    }

    // ── Mode: amdCallback ─────────────────────────────────────────────────────
    // Twilio fires this asynchronously after AMD detection completes.
    // event.AnsweredBy: 'human' | 'machine_start' | 'machine_end_beep' |
    //                   'machine_end_silence' | 'machine_end_other' | 'fax' | 'unknown'
    if (mode === 'amdCallback') {
        const callSid   = event.CallSid;
        const answeredBy = event.AnsweredBy;
        console.log(`[outbound-stream-start] AMD AnsweredBy=${answeredBy} for CallSid=${callSid}`);

        const isHuman = answeredBy === 'human';
        // 'unknown' is treated as possibly human — safer than always marking false.
        const isDefinitelyMachine = ['machine_start', 'machine_end_beep', 'machine_end_silence', 'machine_end_other', 'fax'].includes(answeredBy);

        if (isHuman || isDefinitelyMachine) {
            await resolveAndUpdate(callSid, isHuman);
        }
        // If answeredBy === 'unknown', leave customerAnswered unset so the
        // transcript heuristic in wasCallAnswered() is used as a fallback.

        return callback(null, response.setBody({ received: true, answeredBy }));
    }

    // ── Mode: callStatus ──────────────────────────────────────────────────────
    // Fires for no-answer / busy / failed — definitively marks customerAnswered=false
    // without needing AMD.  'completed' is ambiguous (human or VM both complete) so
    // we only act on the unambiguous failure states.
    if (mode === 'callStatus') {
        const callSid    = event.CallSid;
        const callStatus = event.CallStatus; // Twilio sends CallStatus, not status
        console.log(`[outbound-stream-start] callStatus=${callStatus} for CallSid=${callSid}`);

        const noAnswer = ['no-answer', 'busy', 'failed', 'canceled'].includes(callStatus);
        if (noAnswer) {
            await resolveAndUpdate(callSid, false);
        }
        // 'completed' with positive duration could be human or VM — AMD handles that.

        return callback(null, response.setBody({ received: true, callStatus }));
    }

    console.log(`[outbound-stream-start] unhandled mode=${mode}`);
    return callback(null, response.setBody({ error: `Unknown mode: ${mode}` }));
};
