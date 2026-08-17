const axios = require('axios');
const relayConfigPath = Runtime.getFunctions().relayServerConst.path;
const { agentAssist_Stream_URL, call_Events_URL } = require(relayConfigPath);

async function updateCurrentAgentCallSID(client, context, taskSid, workerSid, worker_name, agentAttributes, agentCallSID) {
    console.log("task sid received in updateCurrentAgentCallSID : ", taskSid);
    console.log("currentAgentCallSID received in updateCurrentAgentCallSID : ", agentCallSID);
    try {
        const task = await client.taskrouter.v1
            .workspaces(context.TWILIO_WORKSPACE_SID)
            .tasks(taskSid).fetch();
        const attributes = JSON.parse(task.attributes || "{}");
        attributes.agentCallSids = attributes.agentCallSids || {};
        attributes.agentCallSids[workerSid] = {
            callSid: agentCallSID,
            workerName: worker_name,
            fullName: agentAttributes.full_name,
            email: agentAttributes.email,
            updatedAt: new Date().toISOString()
        };
        await client.taskrouter.v1
            .workspaces(context.TWILIO_WORKSPACE_SID)
            .tasks(taskSid)
            .update({ attributes: JSON.stringify(attributes) });
        console.log(`[SUCCESS] Updated Worker  (${workerSid}) -> ${agentCallSID}`);
        return true;
    }
    catch (error) {
        console.error("[ERROR] updateAgentCallSid:", error);
        return false;
    }
}
async function fetchLatestTaskAttributes(client, context, taskSid) {
    try {
        const task = await client.taskrouter.v1
            .workspaces(context.TWILIO_WORKSPACE_SID)
            .tasks(taskSid)
            .fetch();

        return JSON.parse(task.attributes || "{}");
    } catch (error) {
        console.error("[ERROR] fetchLatestTaskAttributes:", error.message);
        return {};
    }
}

// ── Pre-call attribute inheritance for CSR2 ──────────────────────────────────
//
// When CSR1 warm-transfers to CSR2, Twilio creates a brand-new TaskRouter task
// for CSR2.  That task only carries standard Twilio call attributes (from, to,
// conference, …); the IVR / pre-call fields (authenticationStatus, lastOpenIntent,
// IVRPathSummary, statedReason, sentimentAnalysis) are NOT copied automatically.
//
// This helper searches for another active task that shares the same customer
// call SID — that is CSR1's original task — and returns its pre-call fields so
// the conference-events handler can graft them onto CSR2's new task before
// forwarding to the relay.
// ─────────────────────────────────────────────────────────────────────────────
async function fetchPreCallAttrsFromOriginalTask(client, context, customerCallSID, excludeTaskSid) {
    if (!customerCallSID) return null;
    try {
        // Fetch recent tasks (assigned / wrapping) — CSR1's task is likely still wrapping
        const tasks = await client.taskrouter.v1
            .workspaces(context.TWILIO_WORKSPACE_SID)
            .tasks.list({ limit: 20 });

        for (const t of tasks) {
            if (t.sid === excludeTaskSid) continue;

            let attrs;
            try { attrs = JSON.parse(t.attributes || '{}'); } catch { continue; }

            // Match on customer call SID stored in either location
            const taskCustomerSid =
                attrs.conversations?.conversation_attribute_1 ||
                attrs.conference?.participants?.customer ||
                null;

            if (taskCustomerSid !== customerCallSID) continue;

            // Only return if the matched task actually has pre-call data
            const hasData =
                attrs.authenticationStatus ||
                attrs.lastOpenIntent ||
                attrs.IVRPathSummary ||
                attrs.statedReason ||
                attrs.sentimentAnalysis;

            if (!hasData) continue;

            console.log(`[fetchPreCallAttrs] ✅ Found original task ${t.sid} with pre-call data`);
            return {
                authenticationStatus: attrs.authenticationStatus || null,
                lastOpenIntent:       attrs.lastOpenIntent       || null,
                intentIdentified:     attrs.intentIdentified     || null,
                IVRPathSummary:       attrs.IVRPathSummary       || null,
                statedReason:         attrs.statedReason         || null,
                sentimentAnalysis:    attrs.sentimentAnalysis    || null,
                AccountNumber:        attrs.AccountNumber        || null,
                accountName:          attrs.accountName          || null,
            };
        }

        console.log('[fetchPreCallAttrs] No original task with pre-call data found for customer SID:', customerCallSID);
        return null;
    } catch (err) {
        console.error('[fetchPreCallAttrs] Error searching for original task:', err.message);
        return null;
    }
}

function getLatestAgentDetails(taskAttributes) {
    const agentCallSids = taskAttributes?.agentCallSids || {};

    console.log(
        "Available agentCallSids:",
        JSON.stringify(agentCallSids, null, 2)
    );

    const agentEntries = Object.values(agentCallSids);

    if (!agentEntries.length) {
        console.log("No agentCallSids found in task attributes");
        return null;
    }

    agentEntries.sort((a, b) => {
        return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
    });

    const latestAgent = agentEntries[0];

    console.log("Latest Agent Details:", latestAgent);

    return latestAgent || null;
}
exports.handler = async function (context, event, callback) {
    console.log("---------------------------Hitting conference-events--------------------------");
    const client = context.getTwilioClient();

    // Guard: some event types (e.g. heartbeats, delivery receipts) arrive without the
    // standard data.payload structure.  Without this check, payload.task_sid throws
    // "Cannot read properties of undefined (reading 'task_sid')".
    const eventData = event[0]?.data;
    if (!eventData) {
        console.log('[conference-events] event[0].data is missing — skipping');
        return callback(null, {});
    }

    let payload = eventData.payload;
    let publisher_metadata = eventData.publisher_metadata;

    if (typeof publisher_metadata === 'string') {
        publisher_metadata = JSON.parse(publisher_metadata);
    }
    if (typeof payload === 'string') {
        payload = JSON.parse(payload);
    }
    const eventName = event[0].data.name;
    console.log("Event Name:", eventName);
    if (!payload) {
        console.log('[conference-events] payload is undefined — skipping event:', event[0]?.data?.name);
        return callback(null, {});
    }
    let taskSid = payload.task_sid;
    console.log("TaskSID in payload", taskSid);
    let workerSid = payload.worker_sid;
    let taskAttributes = payload.task_attributes;
    let agentAttributes = payload.worker_attributes;

    if (typeof taskAttributes === 'string') {
        taskAttributes = JSON.parse(taskAttributes);
    }
    if (typeof agentAttributes === 'string') {
        agentAttributes = JSON.parse(agentAttributes);
    }

    const transferType = payload?.transfer_type ?? 'unknown';
    console.log(`transfer_type: ${transferType}`);
    const transfer_to = payload?.transfer_to ?? 'unknown';
    console.log(`transfer_to: ${transfer_to}`);

    const customerCallSID = taskAttributes?.conversations?.conversation_attribute_1 || taskAttributes?.conference?.participants?.customer || null;

    console.log("Customer Call SID:", customerCallSID);

    event.authenticationStatus = taskAttributes.authenticationStatus;
    event.intentIdentified = taskAttributes.intentIdentified;
    event.IVRPathSummary = taskAttributes.IVRPathSummary;
    event.sentimentAnalysis = taskAttributes.sentimentAnalysis;
    event.statedReason = taskAttributes.statedReason;
    event.isAgentAssistEnabled = taskAttributes.isAgentAssistEnabled;

    const func = Runtime.getFunctions()['getAuthToken'];
    let authHandler;
    if (func && func.path) {
        authHandler = require(func.path);
    } else {
        console.log('getAuthToken function not found or path is undefined');
        return callback('getAuthToken function not found');
    }

    console.log("Moving to GetAuthToken function");

    const getToken = (callSid) => {
        event.CallSid = callSid;
        return new Promise((resolve, reject) => {
            authHandler.handler(context, event, (err, res) => {
                if (err) {
                    console.error('Error from authHandler:', err);
                    reject(err);
                } else {
                    resolve(res);
                }
            });
        });
    };

    const url = call_Events_URL;
    let data;
    

    if (eventName === 'TaskTransferCompleted') {
        console.log("TaskTransferCompleted — original session will be closed from ReservationAccepted");

        return callback(null, {});
    }
    else if (eventName === "ReservationAccepted") {
        console.log("conference-events: publisher Callsid:", publisher_metadata?.call_sid);
        let workerName = payload.worker_name;
        const conference = taskAttributes?.conference ?? {};
        console.log(`conference: ${JSON.stringify(conference)}`);
        const agentCallSID = taskAttributes?.conference?.participants?.worker;
        console.log(`agentCallSID: ${agentCallSID}`);

        // Callback tasks (type:'callback') have no voice conference at reservation time.
        // Skip them here — the associated outbound task fires its own ReservationAccepted.
        if (!agentCallSID) {
            console.log("ReservationAccepted: no agentCallSID — skipping callback/non-voice task");
            return callback(null, {});
        }

        const conference_sid = conference.sid;
        console.log("conference_sid:", conference_sid);

        data = {
            event: "agent_accepted",
            workerSid: payload.worker_sid,
            workerFriendlyName: payload.worker_name,
            callSid: agentCallSID,
            authenticationStatus: taskAttributes.authenticationStatus,
            intentIdentified: taskAttributes.intentIdentified,
            IVRPathSummary: taskAttributes.IVRPathSummary,
            sentimentAnalysis: taskAttributes.sentimentAnalysis,
            statedReason: taskAttributes.statedReason,
            agentFullName: agentAttributes.full_name,
            agentEmailID: agentAttributes.email,
            isAgentAssistEnabled: taskAttributes.isAgentAssistEnabled,
            callersPhoneNumber: taskAttributes.from,
            lastOpenIntent: taskAttributes.lastOpenIntent,
            AccountNumber: taskAttributes.AccountNumber,
            accountName: taskAttributes.accountName
        };

        if (transferType !== 'unknown' && transfer_to !== 'unknown') {
            console.log("transferred call");

            const participants = await client.conferences(conference_sid).participants.list();
            participants.forEach(p => {
                console.log({
                    participantSid: p.callSid,
                    muted: p.muted,
                    hold: p.hold,
                    label: p.label
                });
            });

            const newAgentDetails = participants.find(
                p => p.callSid !== customerCallSID && p.callSid !== agentCallSID
            );
            const newAgentCallSID = newAgentDetails?.callSid || 'unknown';
            console.log("New Agent Call SID:", newAgentCallSID);

            if (!newAgentDetails || newAgentCallSID === 'unknown') {
                console.log("No new agent found — skipping for this ReservationAccepted");
                return callback(null, {});
            }

            // Step 1: close original agent's session
            try {
                const originalToken = await getToken(agentCallSID);
                await axios.post(url, {
                    event: 'TaskTransferCompleted',
                    callSid: agentCallSID,
                    workerFriendlyName: payload.worker_name,
                    isAgentAssistEnabled: taskAttributes.isAgentAssistEnabled,
                }, {
                    headers: { 'Authorization': `Bearer ${originalToken.streamToken}` },
                    timeout: 5000
                });
                console.log("✅ Original session closed");
            } catch (err) {
                console.error("❌ Failed to close original session:", err.response?.data || err.message);
            }

            // Step 2: re-generate token for new agent
            let transferResult;
            try {
                transferResult = await getToken(newAgentCallSID);
            } catch (err) {
                console.log("Failed to get transfer auth token:", err);
                return callback(err);
            }

            data.callSid = newAgentCallSID;
            const transferHeaders = { 'Authorization': `Bearer ${transferResult.streamToken}` };

            try {
                await new Promise(resolve => setTimeout(resolve, 1000));
                console.log("Starting stream for:", newAgentCallSID);
                const stream = await client.calls(newAgentCallSID).streams.create({
                    url: agentAssist_Stream_URL,
                    track: "both_tracks",
                    "parameter1.name": "token",
                    "parameter1.value": transferResult.streamToken,
                    "parameter2.name": "CallSid",
                    "parameter2.value": newAgentCallSID,
                    "parameter3.name": "sessionType",
                    "parameter3.value": "start",
                    "parameter4.name": "authenticationStatus",
                    "parameter4.value": taskAttributes.authenticationStatus,
                    "parameter5.name": "intentIdentified",
                    "parameter5.value": taskAttributes.intentIdentified,
                    "parameter6.name": "IVRPathSummary",
                    "parameter6.value": taskAttributes.IVRPathSummary,
                    "parameter7.name": "sentimentAnalysis",
                    "parameter7.value": taskAttributes.sentimentAnalysis,
                    "parameter8.name": "statedReason",
                    "parameter8.value": taskAttributes.statedReason,
                    "parameter9.name": "trackSwap",
                    "parameter9.value": "true",
                    "parameter10.name": "customerCallSid",
                    "parameter10.value": customerCallSID,
                    "parameter11.name": "language",
                    "parameter11.value": taskAttributes.language,
                });
                console.log("✅ Stream started | StreamSid:", stream.sid);
            } catch (error) {
                console.error("❌ Error starting stream");
                if (error.code) {
                    console.error(`Twilio Error Code: ${error.code} | ${error.message}`);
                } else {
                    console.error(error);
                }
                return callback(null, {});
            }


            await new Promise(resolve => setTimeout(resolve, 500));
            let updateTaskAttrTrans = await updateCurrentAgentCallSID(client, context, taskSid, workerSid, workerName, agentAttributes, newAgentCallSID)
            console.log("updateTaskAttrTrans", updateTaskAttrTrans);
            // agent_accepted uses transfer headers (newAgentCallSID token)
            const response = await axios.post(url, data, { headers: transferHeaders, timeout: 5000 });
            console.log("response.data:", data.event, ":", response.data);
            return callback(null, {});

        } else {
            console.log("new call");

            // ── CSR2 pre-call inheritance ─────────────────────────────────────
            // If the new task has no pre-call IVR data, this is likely CSR2's task
            // created by Twilio during a warm transfer from CSR1.  Search for the
            // original task (CSR1's) via the shared customer call SID and copy
            // its pre-call attributes so the relay and UI receive the correct context.
            // ─────────────────────────────────────────────────────────────────────
            const hasPreCallData =
                taskAttributes.authenticationStatus ||
                taskAttributes.lastOpenIntent ||
                taskAttributes.IVRPathSummary ||
                taskAttributes.statedReason ||
                taskAttributes.sentimentAnalysis;

            if (!hasPreCallData && customerCallSID) {
                console.log('[ReservationAccepted] Pre-call data missing on new task — searching for original CSR1 task');
                const inherited = await fetchPreCallAttrsFromOriginalTask(
                    client, context, customerCallSID, taskSid
                );
                if (inherited) {
                    console.log('[ReservationAccepted] ✅ Inherited pre-call attrs from CSR1 task:', JSON.stringify(inherited));
                    // Merge into local taskAttributes so stream params below pick them up
                    Object.assign(taskAttributes, inherited);
                    // Also patch the already-built data object
                    Object.assign(data, {
                        authenticationStatus: inherited.authenticationStatus,
                        intentIdentified:     inherited.intentIdentified,
                        IVRPathSummary:       inherited.IVRPathSummary,
                        sentimentAnalysis:    inherited.sentimentAnalysis,
                        statedReason:         inherited.statedReason,
                        lastOpenIntent:       inherited.lastOpenIntent,
                    });
                    // Persist to TaskRouter so TaskWrapup and future events also have the data
                    try {
                        const freshAttrs = await fetchLatestTaskAttributes(client, context, taskSid);
                        await client.taskrouter.v1
                            .workspaces(context.TWILIO_WORKSPACE_SID)
                            .tasks(taskSid)
                            .update({ attributes: JSON.stringify({ ...freshAttrs, ...inherited }) });
                        console.log('[ReservationAccepted] ✅ Pre-call attrs persisted to CSR2 task in TaskRouter');
                    } catch (persistErr) {
                        console.error('[ReservationAccepted] Failed to persist pre-call attrs to task:', persistErr.message);
                    }
                } else {
                    console.log('[ReservationAccepted] No original task found — proceeding with empty pre-call data');
                }
            }
            // ─────────────────────────────────────────────────────────────────

            let agentResult;
            try {
                agentResult = await getToken(agentCallSID);
            } catch (err) {
                console.log("Failed to get agent auth token:", err);
                return callback(err);
            }

            const agentHeaders = { 'Authorization': `Bearer ${agentResult.streamToken}` };

            try {
                await new Promise(resolve => setTimeout(resolve, 1000));
                console.log("Starting stream for:", agentCallSID);
                const stream = await client.calls(agentCallSID).streams.create({
                    url: agentAssist_Stream_URL,
                    track: "both_tracks",
                    "parameter1.name": "token",
                    "parameter1.value": agentResult.streamToken,
                    "parameter2.name": "CallSid",
                    "parameter2.value": agentCallSID,
                    "parameter3.name": "sessionType",
                    "parameter3.value": "start",
                    "parameter4.name": "authenticationStatus",
                    "parameter4.value": taskAttributes.authenticationStatus,
                    "parameter5.name": "intentIdentified",
                    "parameter5.value": taskAttributes.intentIdentified,
                    "parameter6.name": "IVRPathSummary",
                    "parameter6.value": taskAttributes.IVRPathSummary,
                    "parameter7.name": "sentimentAnalysis",
                    "parameter7.value": taskAttributes.sentimentAnalysis,
                    "parameter8.name": "statedReason",
                    "parameter8.value": taskAttributes.statedReason,
                    "parameter9.name": "trackSwap",
                    "parameter9.value": "true",
                    "parameter10.name": "customerCallSid",
                    "parameter10.value": customerCallSID,
                    "parameter11.name": "language",
                    "parameter11.value": taskAttributes.language,
                });

                console.log("✅ Stream started | StreamSid:", stream.sid);
            } catch (error) {
                console.error("❌ Error starting stream");
                if (error.code) {
                    console.error(`Twilio Error Code: ${error.code} | ${error.message}`);
                } else {
                    console.error(error);
                }
                return callback(null, {});
            }

            await new Promise(resolve => setTimeout(resolve, 500));
            let updateTaskAttr = await updateCurrentAgentCallSID(client, context, taskSid, workerSid, workerName, agentAttributes, agentCallSID)
            console.log("updateTaskAttr", updateTaskAttr);

            // For outbound callback calls, store the customer call SID on the callback task
            // so that outbound-stream-start.js (AMD callback handler) can locate the callback
            // task by customer call SID when Twilio reports the AMD/call-status result.
            // customerCallSID is conference.participants.customer — only present after the
            // customer joins the conference (i.e. they picked up).  If it's null here the
            // customer hasn't answered yet; outbound-stream-start.js handles that via the
            // no-answer / call-status webhook path instead.
            if (taskAttributes.callbackTaskSid && customerCallSID) {
                try {
                    const cbTask = await client.taskrouter
                        .workspaces(context.TWILIO_WORKSPACE_SID)
                        .tasks(taskAttributes.callbackTaskSid)
                        .fetch();
                    const cbAttrs = JSON.parse(cbTask.attributes || '{}');
                    if (!cbAttrs.customerCallSid) {
                        cbAttrs.customerCallSid = customerCallSID;
                        await client.taskrouter
                            .workspaces(context.TWILIO_WORKSPACE_SID)
                            .tasks(taskAttributes.callbackTaskSid)
                            .update({ attributes: JSON.stringify(cbAttrs) });
                        console.log(`[conference-events] stored customerCallSid=${customerCallSID} on callback task ${taskAttributes.callbackTaskSid}`);
                    }
                } catch (cbErr) {
                    console.error('[conference-events] failed to update callback task with customerCallSid:', cbErr.message);
                }
            }

            // agent_accepted uses agent headers (agentCallSID token)
            const response = await axios.post(url, data, { headers: agentHeaders, timeout: 5000 });
            console.log("response.data:", data.event, ":", response.data);
            return callback(null, {});
        }
    }
    else if (eventName === "TaskWrapup") {

        let wrapupWorkerSid = payload.worker_sid;

        console.log("Wrapup Worker SID:", wrapupWorkerSid);

        console.log(
            "Payload Task Attributes agentCallSids:",
            JSON.stringify(taskAttributes?.agentCallSids, null, 2)
        );

        // Fetch latest task attributes because wrapup payload can be stale
        const latestTaskAttributes = await fetchLatestTaskAttributes(
            client,
            context,
            taskSid
        );

        console.log(
            "Latest Task Attributes agentCallSids:",
            JSON.stringify(latestTaskAttributes?.agentCallSids, null, 2)
        );

        // ── TAKEOVER wrapup: use customerCallSID as the relay session key ────────
        //
        // WHY: In the TaskUpdated takeover handler, the relay session was registered
        // under customerCallSID (not the supervisor's call SID) so that the plugin's
        // WebSocket subscription (which keys on the task's call_sid = customerCallSID)
        // matches the session.  Using the supervisor's call SID here would cause
        // getToken to return a token for an unknown session and the relay would fail
        // to find and process the wrapup.
        //
        // HOW: Detect takeover via monitoring_status='takeover' (set by
        // add-supervisor-to-conference.js when mode='takeover') and, when present,
        // replace the effective callSid with customerCallSID throughout this handler.
        // ─────────────────────────────────────────────────────────────────────────
        const isTakeoverWrapup =
            (latestTaskAttributes?.conversations?.monitoring_status === 'takeover' ||
             taskAttributes?.conversations?.monitoring_status === 'takeover') &&
            !!customerCallSID;

        console.log("[TaskWrapup] isTakeoverWrapup:", isTakeoverWrapup, "| customerCallSID:", customerCallSID);

        const latestAgent = getLatestAgentDetails(latestTaskAttributes) || getLatestAgentDetails(taskAttributes);
        console.log(" Latest Agent Object:", JSON.stringify(latestAgent, null, 2));

        const wrapupAgentCallSID =
            latestAgent?.callSid ||
            publisher_metadata?.worker_call_sid ||
            publisher_metadata?.conference_worker_call_sid ||
            taskAttributes?.conference?.participants?.worker;

        // For takeover tasks the relay session is keyed under customerCallSID;
        // for all other tasks use the standard agent call SID.
        const effectiveCallSid = isTakeoverWrapup ? customerCallSID : wrapupAgentCallSID;

        console.log("Final Wrapup Agent Call SID (raw):", wrapupAgentCallSID);
        console.log("Effective Wrapup Call SID (used for relay):", effectiveCallSid);

        if (!effectiveCallSid) {
            console.log("No effectiveCallSid found. Skipping TaskWrapup.");
            return callback(null, {});
        }

        let wrapupResult;
        try {
            wrapupResult = await getToken(effectiveCallSid);
        } catch (err) {
            console.log("Failed to get wrapup auth token:", err);
            return callback(err);
        }

        const wrapupHeaders = { 'Authorization': `Bearer ${wrapupResult.streamToken}` };
        const latestWorkerSid = latestAgent?.workerSid || null;
        const latestWorkerName = latestAgent?.workerName || payload.worker_name;
        const latestWorkerEmail = latestAgent?.email || null;
        const latestFullName = latestAgent?.fullName || agentAttributes?.full_name;

        console.log("Effective Call SID:", effectiveCallSid);
        console.log("Worker SID:", latestWorkerSid);
        console.log("Worker Name:", latestWorkerName);
        console.log("Email:", latestWorkerEmail);
        console.log("latestFullName:", latestFullName);

        // Prefer latestTaskAttributes (freshly fetched) over the stale payload
        // taskAttributes — the wrapup payload is often a snapshot from before the
        // task's IPASS/agentAssist attributes were written, so fields like
        // authenticationStatus, intentIdentified, etc. show up as undefined there
        // even though they are present on the live task record.
        const ta = latestTaskAttributes;
        const tap = taskAttributes; // payload fallback only

        data = {
            event: eventName,
            callSid: effectiveCallSid,
            workerFriendlyName: latestWorkerName,
            authenticationStatus: ta.authenticationStatus ?? tap.authenticationStatus,
            intentIdentified:     ta.intentIdentified     ?? tap.intentIdentified,
            IVRPathSummary:       ta.IVRPathSummary       ?? tap.IVRPathSummary,
            sentimentAnalysis:    ta.sentimentAnalysis    ?? tap.sentimentAnalysis,
            statedReason:         ta.statedReason         ?? tap.statedReason,
            agentFullName:        latestFullName,
            agentEmailID:         latestWorkerEmail,
            isAgentAssistEnabled: ta.isAgentAssistEnabled ?? tap.isAgentAssistEnabled,
            callersPhoneNumber:   ta.from                 ?? tap.from,
            lastOpenIntent:       ta.lastOpenIntent        ?? tap.lastOpenIntent,
            AccountNumber:        ta.AccountNumber         ?? tap.AccountNumber,
            accountName:          ta.accountName           ?? tap.accountName,
        };

        // ── Takeover wrapup: 10-second delay before notifying the relay ──────────
        // WHY: For normal CSR1 tasks the Flex plugin's Redux subscriber schedules
        // CompleteTask 10 seconds after the task enters wrapping, giving SAICPanel
        // time to auto-submit the post-call summary.  For supervisor/CSR2 tasks
        // created by the takeover conference-participant call, the workflow may have
        // wrapupTime=0, causing Flex (or TaskRouter) to complete the task immediately.
        // Adding a 10-second hold here ensures the relay does not close the session
        // before SAICPanel has had a chance to receive and submit the summary.
        // The plugin-side replaceAction('CompleteTask') guard is the primary defence
        // for Flex-triggered completions; this delay is the server-side backstop for
        // TaskRouter-triggered completions that bypass the Flex plugin entirely.
        // ─────────────────────────────────────────────────────────────────────────
        if (isTakeoverWrapup) {
            console.log("[TaskWrapup] Takeover task — holding 10 s before relay notification (supervisor/CSR2 wrapup window)");
            await new Promise(resolve => setTimeout(resolve, 10000));
        }

        console.log("data passing to the endpoint:", data);
        try {
            const response = await axios.post(url, data, { headers: wrapupHeaders, timeout: 15000 });
            console.log("response.data:", data.event, ":", response.data);
            return callback(null, {});
        } catch (error) {
            console.log("error occurred:", error.response?.data || error.response?.message);
            return callback(error.message);
        }
    }
    // else if(eventName === "afterHoldCall")    
    // {
        
    //     console.log("[HE] Conference-events : eventName", event.data.eventName);
    //     console.log("[HE] Conference-events : workerSid", event.data.workerSid);
    //     console.log("[HE] Conference-events : workerName", event.data.workerName);
    //     console.log("[HE] Conference-events : taskSid", event.data.taskSid);
    //     console.log("[HE] Conference-events : agentCallSid", event.data.agentCallSid);
    //     let holdEventResult;
    //     try {
    //         holdEventResult = await getToken(event.agentCallSid);
    //     } catch (err) {
    //         console.log("Failed to get wrapup auth token:", err);
    //         return callback(err);
    //     }

    //     const holdHeaders = { 'Authorization': `Bearer ${holdEventResult.streamToken}` };
    //     data = {
    //         event: eventName,
    //         callSid: event.agentCallSid,
    //         workerFriendlyName: event.workerName,
    //         authenticationStatus: taskAttributes.authenticationStatus,
    //         intentIdentified: taskAttributes.intentIdentified,
    //         IVRPathSummary: taskAttributes.IVRPathSummary,
    //         sentimentAnalysis: taskAttributes.sentimentAnalysis,
    //         statedReason: taskAttributes.statedReason,
    //         // agentFullName: latestFullName,
    //         // agentEmailID: latestWorkerEmail,
    //         //isAgentAssistEnabled: taskAttributes.isAgentAssistEnabled,
    //         callersPhoneNumber: taskAttributes.from,
    //         lastOpenIntent: taskAttributes.lastOpenIntent
    //     };
    //     console.log("data passing to the endpoint:", data);
    //     try {
    //         const response = await axios.post(url, data, { headers: holdHeaders, timeout: 5000 });
    //         console.log("response.data:", data.event, ":", response.data);
    //         return callback(null, {});
    //     } catch (error) {
    //         console.log("error occurred:", error.response?.data || error.response?.message);
    //         return callback(error.message);
    //     }
    // }
    // else if(eventName === "afterUnholdCall")
    // {
    //     console.log("[UHE] Conference-events : eventName", event.eventName);
    //     console.log("[UHE] Conference-events : workerSid", event.workerSid);
    //     console.log("[UHE] Conference-events : workerName", event.workerName);
    //     console.log("[UHE] Conference-events : taskSid", event.taskSid);
    //     console.log("[UHE] Conference-events : agentCallSid", event.agentCallSid);
    // }

    else if (eventName === "TaskUpdated") {
        console.log("[TaskUpdated] task attributes changed for task:", taskSid);

        // Ground-truth approach: list the actual conference participants and check
        // their status fields (muted, coaching) rather than relying on a stamped attribute.
        //
        // Supervisor modes:
        //   muted: true  = listen/monitor mode  → monitoring_status: 'monitored'
        //   coaching: true = coaching mode       → monitoring_status: 'coaching'
        //
        // We identify the supervisor as any participant who is NOT the known
        // agent (worker) or customer, AND is either muted or coaching.

        // Restrict to IPASS and Violations queues only.
        // payload.task_queue_name matches: IPASS_English_Q, IPASS_Spanish_Q,
        // IPASS_English_L_Q, IPASS_Spanish_L_Q, Violations_English_Q, etc.
        const queueName = payload.task_queue_name || payload.queue_name || '';
        const isTargetQueue = /ipass/i.test(queueName) || /violation/i.test(queueName);
        // When a supervisor takes over, Twilio moves the task from IPASS → Outbound
        // BEFORE the plugin stamps monitoring_status='takeover', so by the time
        // this TaskUpdated fires the queue name is already 'Outbound' — which would
        // cause the check above to skip it.  Bypass the queue gate for takeover events.
        const isTakeoverEvent = taskAttributes?.conversations?.monitoring_status === 'takeover';
        if (!isTargetQueue && !isTakeoverEvent) {
            console.log("[TaskUpdated] skipping — not an IPASS/Violations queue and not a takeover. Queue:", queueName || '(empty)');
            return callback(null, {});
        }
        if (isTakeoverEvent && !isTargetQueue) {
            console.log("[TaskUpdated] queue is", queueName, "but monitoring_status=takeover — bypassing queue gate");
        } else {
            console.log("[TaskUpdated] queue matched:", queueName);
        }

        // Voice task check — non-voice tasks have no conference object
        const conferenceSid = taskAttributes?.conference?.sid;
        if (!conferenceSid) {
            console.log("[TaskUpdated] no conference SID in task attributes — skipping");
            return callback(null, {});
        }

        // Known agent + customer call SIDs — anything else is a 3rd participant (supervisor)
        const agentCallSID =
            taskAttributes?.conference?.participants?.worker || null;
        const customerCallSID =
            taskAttributes?.conference?.participants?.customer || null;

        console.log("[TaskUpdated] listing participants for conference:", conferenceSid);

        let participants = [];
        try {
            participants = await client
                .conferences(conferenceSid)
                .participants.list({ limit: 20 });
        } catch (listErr) {
            console.error("[TaskUpdated] failed to list participants:", listErr.message);
            return callback(null, {});
        }

        console.log("[TaskUpdated] total participants:", participants.length);
        participants.forEach(p => {
            console.log("[TaskUpdated] participant —", JSON.stringify({
                callSid:       p.callSid,
                label:         p.label,
                muted:         p.muted,
                hold:          p.hold,
                status:        p.status,
                coaching:      p.coaching,
                callSidToCoach: p.callSidToCoach,
            }));
        });

        // Known agent call SIDs — agentCallSids is a map of workerSid → { callSid, ... }
        // stamped by updateCurrentAgentCallSID. Use it to tell supervisors apart from
        // transfer agents (who ARE in agentCallSids; supervisors are NOT).
        const knownAgentCallSids = Object.values(taskAttributes?.agentCallSids || {})
            .map(a => a.callSid)
            .filter(Boolean);

        console.log("[TaskUpdated] knownAgentCallSids:", knownAgentCallSids);

        // Find supervisor across ALL modes:
        //   1. label === 'supervisor'  → set by add-supervisor-to-conference (most reliable)
        //   2. muted: true             → listen/monitor mode fallback
        //   3. coaching: true          → coaching mode fallback
        //   4. 3rd participant not in knownAgentCallSids and not customer → barge-in fallback
        const supervisorParticipant =
            participants.find(p => p.label === 'supervisor') ||
            participants.find(p => p.muted === true || p.coaching === true) ||
            participants.find(p =>
                p.callSid !== agentCallSID &&
                p.callSid !== customerCallSID &&
                !knownAgentCallSids.includes(p.callSid)
            );

        if (!supervisorParticipant) {
            console.log("[TaskUpdated] no supervisor participant detected — skipping");
            return callback(null, {});
        }

        // Determine monitoring mode from participant state
        let monitoringStatus;
        if (supervisorParticipant.coaching)    monitoringStatus = 'coaching';
        else if (supervisorParticipant.muted)  monitoringStatus = 'monitored';
        else                                   monitoringStatus = 'barge_in';
        console.log("[TaskUpdated] ✅ supervisor detected — callSid:", supervisorParticipant.callSid, "| mode:", monitoringStatus);

        // ── TAKEOVER: replicate the transfer stream flow ──────────────────────
        // When a supervisor takes over, a new task is created whose call_sid
        // resolves to the CUSTOMER's call (customerCallSID).  The plugin will
        // subscribe to the relay with that callSid, so we must register the new
        // relay session under customerCallSID — not the supervisor's call leg —
        // exactly like the transfer flow does for a new agent callSid.
        const isTakeover = taskAttributes?.conversations?.monitoring_status === 'takeover';

        if (isTakeover) {
            console.log("[TaskUpdated] 🔄 Takeover detected — running transfer-style stream start");
            const supervisorCallSid  = supervisorParticipant.callSid;
            const originalAgentCallSid = agentCallSID;
            // The takeover task's call_sid = customerCallSID; the plugin subscribes
            // with this value, so the relay session must be keyed under it.
            const takeoverSessionSid = customerCallSID;

            if (!takeoverSessionSid) {
                console.error("[TaskUpdated] ❌ no customerCallSID — cannot start takeover stream");
                return callback(null, {});
            }

            // Step 1: close the original agent's relay session (same as transfer)
            if (originalAgentCallSid) {
                try {
                    const originalToken = await getToken(originalAgentCallSid);
                    await axios.post(url, {
                        event: 'TaskTransferCompleted',
                        callSid: originalAgentCallSid,
                        workerFriendlyName: payload.worker_name,
                        isAgentAssistEnabled: taskAttributes.isAgentAssistEnabled,
                    }, {
                        headers: { 'Authorization': `Bearer ${originalToken.streamToken}` },
                        timeout: 5000,
                    });
                    console.log("[TaskUpdated] ✅ Original agent session closed (takeover)");
                } catch (err) {
                    console.error("[TaskUpdated] ❌ Failed to close original session:", err.response?.data || err.message);
                }
            }

            // Step 2: open a new relay session keyed under takeoverSessionSid
            let takeoverToken;
            try {
                takeoverToken = await getToken(takeoverSessionSid);
            } catch (err) {
                console.error("[TaskUpdated] failed to get takeover auth token:", err.message);
                return callback(null, {});
            }

            // Step 3: start stream on supervisor's call leg, session registered
            //         under takeoverSessionSid so the plugin's subscribe matches
            try {
                await new Promise(resolve => setTimeout(resolve, 1000));
                console.log("[TaskUpdated] Starting stream — supervisor leg:", supervisorCallSid, "| session:", takeoverSessionSid);
                const stream = await client.calls(supervisorCallSid).streams.create({
                    url: agentAssist_Stream_URL,
                    track: "both_tracks",
                    "parameter1.name":  "token",
                    "parameter1.value": takeoverToken.streamToken,
                    "parameter2.name":  "CallSid",
                    "parameter2.value": takeoverSessionSid,
                    "parameter3.name":  "sessionType",
                    "parameter3.value": "start",
                    "parameter4.name":  "authenticationStatus",
                    "parameter4.value": taskAttributes.authenticationStatus,
                    "parameter5.name":  "intentIdentified",
                    "parameter5.value": taskAttributes.intentIdentified,
                    "parameter6.name":  "IVRPathSummary",
                    "parameter6.value": taskAttributes.IVRPathSummary,
                    "parameter7.name":  "sentimentAnalysis",
                    "parameter7.value": taskAttributes.sentimentAnalysis,
                    "parameter8.name":  "statedReason",
                    "parameter8.value": taskAttributes.statedReason,
                    "parameter9.name":  "trackSwap",
                    "parameter9.value": "true",
                    "parameter10.name": "customerCallSid",
                    "parameter10.value": customerCallSID,
                    "parameter11.name": "language",
                    "parameter11.value": taskAttributes.language,
                });
                console.log("[TaskUpdated] ✅ Stream started for takeover | StreamSid:", stream.sid);
            } catch (error) {
                console.error("[TaskUpdated] ❌ Error starting takeover stream:", error.code || error.message);
                return callback(null, {});
            }

            // Step 4: send agent_accepted so the relay activates the session and
            //         the plugin receives pre-call data
            try {
                await new Promise(resolve => setTimeout(resolve, 500));
                const takeoverData = {
                    event: 'agent_accepted',
                    callSid: takeoverSessionSid,
                    workerFriendlyName: payload.worker_name,
                    authenticationStatus: taskAttributes.authenticationStatus,
                    intentIdentified: taskAttributes.intentIdentified,
                    IVRPathSummary: taskAttributes.IVRPathSummary,
                    sentimentAnalysis: taskAttributes.sentimentAnalysis,
                    statedReason: taskAttributes.statedReason,
                    agentFullName: agentAttributes?.full_name,
                    agentEmailID: agentAttributes?.email,
                    isAgentAssistEnabled: taskAttributes.isAgentAssistEnabled,
                    callersPhoneNumber: taskAttributes.from,
                    lastOpenIntent: taskAttributes.lastOpenIntent,
                    AccountNumber: taskAttributes.AccountNumber,
                    accountName: taskAttributes.accountName,
                };
                const relayResp = await axios.post(url, takeoverData, {
                    headers: { 'Authorization': `Bearer ${takeoverToken.streamToken}` },
                    timeout: 5000,
                });
                console.log("[TaskUpdated] ✅ agent_accepted sent for takeover:", relayResp.data);
            } catch (err) {
                console.error("[TaskUpdated] ❌ Failed to send agent_accepted for takeover:", err.response?.data || err.message);
            }

            return callback(null, {});
        }
        // ─────────────────────────────────────────────────────────────────────

        // Notify relay so the plugin receives a supervisor_monitoring event
        if (!agentCallSID) {
            console.log("[TaskUpdated] no agentCallSID — cannot notify relay");
            return callback(null, {});
        }

        let supervisorToken;
        try {
            supervisorToken = await getToken(agentCallSID);
        } catch (err) {
            console.error("[TaskUpdated] failed to get auth token:", err.message);
            return callback(null, {});
        }

        const supervisorData = {
            event: "supervisor_monitoring",
            callSid: agentCallSID,
            taskSid,
            supervisorStatus: monitoringStatus,
            supervisorCallSid: supervisorParticipant.callSid,
            isAgentAssistEnabled: taskAttributes.isAgentAssistEnabled,
        };

        try {
            const relayResponse = await axios.post(url, supervisorData, {
                headers: { 'Authorization': `Bearer ${supervisorToken.streamToken}` },
                timeout: 5000,
            });
            console.log("[TaskUpdated] relay notified of supervisor_monitoring:", relayResponse.data);
        } catch (err) {
            console.error("[TaskUpdated] failed to notify relay:", err.response?.data || err.message);
        }

        return callback(null, {});
    }

    console.log("Unhandled event:", eventName);
    return callback(null, {});
};