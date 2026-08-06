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
    const eventName = event[0].data.name;
    console.log("Event Name:", eventName);

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

        const latestAgent = getLatestAgentDetails(latestTaskAttributes) || getLatestAgentDetails(taskAttributes); console.log(" Latest Agent Object:", JSON.stringify(latestAgent, null, 2));
        const wrapupAgentCallSID =
            latestAgent?.callSid ||
            publisher_metadata?.worker_call_sid ||
            publisher_metadata?.conference_worker_call_sid ||
            taskAttributes?.conference?.participants?.worker;

        console.log(
            "Final Wrapup Agent Call SID:",
            wrapupAgentCallSID
        );

        if (!wrapupAgentCallSID) {
            console.log("No wrapupAgentCallSID found. Skipping TaskWrapup.");
            return callback(null, {});
        }

        console.log(
            "Wrapup Agent Call SID:",
            wrapupAgentCallSID
        );
        let wrapupResult;
        try {
            wrapupResult = await getToken(wrapupAgentCallSID);
        } catch (err) {
            console.log("Failed to get wrapup auth token:", err);
            return callback(err);
        }

        const wrapupHeaders = { 'Authorization': `Bearer ${wrapupResult.streamToken}` };
        const latestAgentCallSID = latestAgent?.callSid || wrapupAgentCallSID;
        const latestWorkerSid = latestAgent?.workerSid || null;
        const latestWorkerName = latestAgent?.workerName || payload.worker_name;
        const latestWorkerEmail = latestAgent?.email || null;
        const latestFullName = latestAgent?.fullName || agentAttributes?.full_name;

        console.log("Call SID:", latestAgentCallSID);
        console.log("Worker SID:", latestWorkerSid);
        console.log("Worker Name:", latestWorkerName);
        console.log("Email:", latestWorkerEmail);
        console.log("latestFullName:", latestFullName);

        data = {
            event: eventName,
            callSid: wrapupAgentCallSID,
            workerFriendlyName: latestWorkerName,
            authenticationStatus: taskAttributes.authenticationStatus,
            intentIdentified: taskAttributes.intentIdentified,
            IVRPathSummary: taskAttributes.IVRPathSummary,
            sentimentAnalysis: taskAttributes.sentimentAnalysis,
            statedReason: taskAttributes.statedReason,
            agentFullName: latestFullName,
            agentEmailID: latestWorkerEmail,
            isAgentAssistEnabled: taskAttributes.isAgentAssistEnabled,
            callersPhoneNumber: taskAttributes.from,
            lastOpenIntent: taskAttributes.lastOpenIntent
        };

        console.log("data passing to the endpoint:", data);
        try {
            const response = await axios.post(url, data, { headers: wrapupHeaders, timeout: 5000 });
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

    console.log("Unhandled event:", eventName);
    return callback(null, {});
};