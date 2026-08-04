/*
    Synopsis:  This function provide complete handling of Flex In-Queue Callback capabilities to include:
        1. Immediate call-back request to originating ANI ( Press 1), and
        2. Request a callback to separate number
        
    Callback task are created and linked to the originating call (Flex Insights reporting). The flex plugin provides 
    a UI for management of the callback request including a re-queueing capability.capability
    
    name: util_InQueueCallBackMenu
    path: /inqueue-callback
    private: CHECKED
    
    Function Methods (mode)
     - main             => main entry point for callback flow
     - mainProcess      => process main menu DTMF selection
     - newNumber        => menu initiating new number capture
     - newNumberProcess => process new number DTMF selection
     - submitCallback   => initiate callback creation ( getTask, cancelTask, createCallback)
     
    Customization:
     - Set TTS voice option
     - Set initial priority of callback task (default: 50)
     - Set timezone configuration ( server_tz )
    Install/Config: See documentation
    Last Updated: 05/06/2025
*/
const callbackConfigPath = Runtime.getFunctions().callbackConfig.path;
const { enSayOptions, speechTimeout, server_tz } = require(callbackConfigPath);
const englishPromptsPath = Runtime.getFunctions().englishCSRHadOffPrompts.path;
const { CSRHandOff1dot4a, CSRHandOff1dot4b, CSRHandOff1dot5, CSRHandOff1dot6, CSRHandOff1dot7a, CSRHandOff1dot7b, CSRHandOff1dot8, CSRHandOff1dot9 } = require(englishPromptsPath);

exports.handler = function (context, event, callback) {
    const client = context.getTwilioClient();

    const moment = require('moment-timezone');
    const maxAttempts = 3;
    let twiml = new Twilio.twiml.VoiceResponse();

    let domain = 'https://' + context.DOMAIN_NAME;

    let mode = event.mode ? event.mode : 'main';
    let phone = event.cbphone ? event.cbphone : event.From;
    let callSid = '';
    let temp = '';
    let i = '';
    let language = event.language ? event.language : 'en-US';
    let isHoliday = event.isHoliday ? event.isHoliday : 'false';
    let isHolidayTomorrow = event.isHolidayTomorrow ? event.isHolidayTomorrow : 'false';

    let endOfDayTime = event.endOfDayTime ? event.endOfDayTime : '';
    let startOfDayTime = event.startOfDayTime ? event.startOfDayTime : '';
    let queueStartTime = event.queueStartTime ? event.queueStartTime : '';
    let attempt = parseInt(event.attempt ? event.attempt : '1');
    let noAttempt = parseInt(event.noAttempt ? event.noAttempt : '1');
    let digits = event.Digits ? event.Digits : event.SpeechResult;
    if (digits) {
        digits = digits.replace(/[^0-9]/g, '');
    } else {
        digits = '';
    }
    let workflowSid = event.workflowSid;
    let fleet = event.fleet ? event.fleet : 'false';

    // Pre-call attributes passed from Studio/IVR flow
    let authenticationStatus = event.authenticationStatus || '';
    let lastOpenIntent       = event.lastOpenIntent       || '';
    let IVRPathSummary       = event.IVRPathSummary       || '';
    let statedReason         = event.statedReason         || '';
    let sentimentAnalysis    = event.sentimentAnalysis    || '';

    console.log(`[inqueue-callback] REQUEST mode=${event.mode || 'main'} attempt=${event.attempt || '1'} callSid=${event.CallSid || 'N/A'} phone=${event.cbphone || event.From || 'N/A'}`);
    console.log("Received EWT is" + event.ewt);
    let ewt = (event.ewt >= 0) ? event.ewt : 0;
    console.log("ewt:" + ewt);

    const alertTone = domain + '/alertTone.mp3';

    //    END CUSTOMIZATIONS
    let command;
    let queryStr = '&language=' + language + '&isHoliday=' + isHoliday + '&isHolidayTomorrow=' + isHolidayTomorrow + '&endOfDayTime=' + endOfDayTime + '&startOfDayTime=' + startOfDayTime + '&queueStartTime=' + queueStartTime + '&workflowSid=' + workflowSid + '&fleet=' + fleet + '&ewt=' + ewt
        + '&authenticationStatus=' + encodeURIComponent(authenticationStatus)
        + '&lastOpenIntent='       + encodeURIComponent(lastOpenIntent)
        + '&IVRPathSummary='       + encodeURIComponent(IVRPathSummary)
        + '&statedReason='         + encodeURIComponent(statedReason)
        + '&sentimentAnalysis='    + encodeURIComponent(sentimentAnalysis);

    //  find the task given the callSid - get TaskSid
    async function getTask(callSid) {
        let attrFilter = `call_sid='${callSid}'`;
        console.log(`[getTask] querying callSid=${callSid} filter="${attrFilter}" workspaceSid=${context.TWILIO_WORKSPACE_SID}`);

        try {
            let task = await client.taskrouter
                .workspaces(context.TWILIO_WORKSPACE_SID)
                .tasks.list({
                    evaluateTaskAttributes: attrFilter,
                    limit: 20,
                });

            console.log(`[getTask] found ${task.length} task(s)`);
            if (task[0]) {
                console.log(`[getTask] task SID=${task[0].sid} status=${task[0].assignmentStatus} channel=${task[0].taskChannelUniqueName}`);
            } else {
                console.log('[getTask] WARNING: no task found — verify call_sid attribute is set on the IVR task and TWILIO_WORKSPACE_SID env var is correct');
            }
            let taskInfo = {
                originalTaskData: task[0],
            };
            return taskInfo;
        } catch (error) {
            console.log('getTask error');
            handleError(error);
        }
    }

    //  cancel the existing task
    //  update ==> assignmentStatus and reason
    async function cancelTask(taskSid) {
        console.log(`[cancelTask] cancelling taskSid=${taskSid}`);
        try {
            await client.taskrouter
                .workspaces(context.TWILIO_WORKSPACE_SID)
                .tasks(taskSid)
                .update({
                    assignmentStatus: 'canceled',
                    reason: 'Callback Requested',
                });
            console.log(`[cancelTask] taskSid=${taskSid} successfully cancelled`);
        } catch (error) {
            console.log(`[cancelTask] ERROR cancelling taskSid=${taskSid}`);
            handleError(error);
        }
    }

    // create the callback task
    async function createCallback(phone, taskInfo) {
        console.log(`[createCallback] creating callback task for phone=${phone}`);
        let time = getTime(server_tz);

        const taskAttributes = {
           // type: 'callback',
            taskType: 'callback',
            ringback: alertTone,
           // outbound_to: phone,
           // callbackNumber: phone,
           callback: phone,
            direction: 'inbound',
            name: 'Callback: ' + phone,
            from: getOrigTaskData(
                taskInfo.originalTaskData,
                'from',
                'getAttribute'
            ),
            to: getOrigTaskData(
                taskInfo.originalTaskData,
                'called',
                'getAttribute'
            ),
            language: getOrigTaskData(
                taskInfo.originalTaskData,
                'language',
                'getAttribute'
            ),
            ExitReason: getOrigTaskData(
                taskInfo.originalTaskData,
                'ExitReason',
                'getAttribute'
            ),
            conversations: getOrigTaskData(
                taskInfo.originalTaskData,
                'conversations',
                'getAttribute'
            ),
            callTime: time,
            queueTargetName: getOrigTaskData(
                taskInfo.originalTaskData,
                'taskQueueFriendlyName',
                ''
            ),
            queueTargetSid: getOrigTaskData(
                taskInfo.originalTaskData,
                'taskQueueSid',
                ''
            ),           
            workflowTargetSid: getOrigTaskData(
                taskInfo.originalTaskData,
                'workflowSid',
                ''
            ),
            ui_plugin: { cbCallButtonAccessibility: false },
            placeCallRetry: 1,
            authenticationStatus: getOrigTaskData(taskInfo.originalTaskData, 'authenticationStatus', 'getAttribute') || authenticationStatus || null,
            lastOpenIntent:       getOrigTaskData(taskInfo.originalTaskData, 'lastOpenIntent', 'getAttribute') || getOrigTaskData(taskInfo.originalTaskData, 'intentIdentified', 'getAttribute') || lastOpenIntent || null,
            IVRPathSummary:       getOrigTaskData(taskInfo.originalTaskData, 'IVRPathSummary', 'getAttribute') || IVRPathSummary || null,
            statedReason:         getOrigTaskData(taskInfo.originalTaskData, 'statedReason', 'getAttribute') || statedReason || null,
            sentimentAnalysis:    getOrigTaskData(taskInfo.originalTaskData, 'sentimentAnalysis', 'getAttribute') || sentimentAnalysis || null,
        };
        try {
            let cbTask = await client.taskrouter
                .workspaces(context.TWILIO_WORKSPACE_SID)
                .tasks.create({
                    attributes: JSON.stringify(taskAttributes),
                    type: 'callback',
                   // taskChannel: 'voice',
                   taskChannel: 'callback',
                    //priority: priority,
                    workflowSid: getOrigTaskData(
                        taskInfo.originalTaskData,
                        'workflowSid',
                        ''
                    ),
                });
            return cbTask;
        } catch (error) {
            console.log('createCallBack error');
            handleError(error);
        }
    }
    //  handler to retrieve Task JSON key evaluateTaskAttributes
    //  lookup ==> 'getAttribute' == get attributes value
    function getOrigTaskData(object, keyname, lookup) {
        let val;
        if (lookup == 'getAttribute') {
            let attr = JSON.parse(object.attributes);
            val = attr[keyname];
        } else {
            val = object[keyname];
        }
        return val;
    }

    //  method to split the phone string - prepare phone string for TTS read-ability
    //  format ==> reture '13035551212'
    //  explode ==> return '1...3...0...3...5...5...5...1...2...1...2'
    //
    function explodePhone(mode, phone) {
        phone = phone.replace('+', '');
        if (mode == 'format') {
            return phone;
        }
        if (mode == 'normalize') {
            if (phone.length === 10) {
                return '+1' + phone;
            } else if (phone.length === 11 && phone.startsWith('1')) {
                return '+' + phone;
            }
            return phone;
        }
        if (mode == 'explode') {

            phone = phone.replace('+', '');
            if (phone.startsWith('1') && phone.length === 11) {
                phone = phone.substring(1);
            }
            var res = phone.split('');
            for (i = 0; i < res.length; i++) {
                temp += res[i] + '...';
            }
            return temp;
        }
    }

    //  get current time adjusted to center timezone
    function getTime(server_tz) {
        const now = new Date();
        var time_recvd = moment(now);
        let time_json = {
            time_recvd: time_recvd,
            server_tz: server_tz,
            server_time_long: time_recvd
                .tz(server_tz)
                .format('MMM Do YYYY, h:mm:ss a z'),
            server_time_short: time_recvd
                .tz(server_tz)
                .format('MM-D-YYYY, h:mm:ss a z'),
        };
        return time_json;
    }

    if (phone) {
        phone = phone.replace(/[^0-9]/g, '');
    } else {
        phone = '';
    }

    if (mode === 'main' && phone.length < 10) {
        //invalid ANI 
        mode = 'newNumber';
    }

    console.log(`[inqueue-callback] resolved mode=${mode} attempt=${attempt}/${maxAttempts} phone=${phone}`);

    if (attempt >= maxAttempts) {
        console.log(`[inqueue-callback] maxAttempts (${maxAttempts}) reached — redirecting back to queue menu`);
        twiml.redirect({ method: 'POST' }, domain + '/queue-menu?mode=main' + queryStr);
        return callback(null, twiml);
    }

    callSid = event.CallSid;
    let gather = null;

    // main logic for callback methods
    switch (mode) {
        //  present main menu options
        case 'main': {
            console.log(`[main] presenting callback menu phone=${phone} callSid=${callSid}`);
            //  get callsid
            let mainMenuOptions = {
                input: 'speech dtmf',
                timeout: speechTimeout,
                language: language,
                numDigits: 1,
                finishOnKey: '',
                //hints: 'Yes, No',
                speechTimeout: 'auto',
                action: domain + '/inqueue-callback?mode=mainProcess&cbphone=' + explodePhone('format', phone) + queryStr + '&attempt=' + attempt,
                actionOnEmptyResult: true,
                method: 'POST'
            };

            // main menu
            gather = twiml.gather(mainMenuOptions);

            gather.say(enSayOptions, CSRHandOff1dot4a);
            gather.say(enSayOptions, explodePhone('explode', phone));
            gather.say(enSayOptions, CSRHandOff1dot4b);
            callback(null, twiml);
            break;
        }
        //  process main menu selections
        case 'mainProcess':
            {
                if (event.SpeechResult) { command = event.SpeechResult.toLowerCase(); }
                else if (event.Digits) { command = event.Digits; }

                console.log(`[mainProcess] command="${command}" SpeechResult="${event.SpeechResult}" Digits="${event.Digits}"`);

                if (command) {
                    if (command.includes("yes") || command == 1) {
                        console.log('[mainProcess] yes/1 — redirecting to submitCallback');
                        temp = event.cbphone;
                        twiml.redirect(
                            domain +
                            '/inqueue-callback?mode=submitCallback&callsid=' +
                            callSid +
                            '&cbphone=' +
                            temp + queryStr + '&attempt=1'
                        );
                    }
                    else if (command.includes("no") || command == 2) {
                        console.log('[mainProcess] no/2 — redirecting to newNumber');
                        twiml.redirect(
                            domain +
                            '/inqueue-callback?mode=newNumber&callsid=' +
                            callSid + queryStr + '&attempt=1'
                        );
                    } else {
                        console.log(`[mainProcess] unrecognized command="${command}" — incrementing attempt to ${attempt + 1}`);
                        temp = event.cbphone;
                        twiml.redirect(
                            domain +
                            '/queue-menu?mode=mainProcess&callsid=' +
                            callSid +
                            '&cbphone=' +
                            temp + queryStr + '&attempt=' + (attempt + 1)
                        );
                    }
                } else {
                    console.log('[mainProcess] no input — redirecting to queue menu');
                    twiml.redirect({
                        method: 'POST'
                    }, 'https://' + context.DOMAIN_NAME + '/queue-menu?mode=mainProcess' + queryStr);
                }
                callback(null, twiml);
                break;
            }
        //  present new number menu selections
        case 'newNumber':
            {
                console.log(`[newNumber] prompting for new number attempt=${attempt} noAttempt=${noAttempt}`);
                let newNumberMenuOptions = {
                    input: 'speech dtmf',
                    timeout: speechTimeout,
                    language: language,
                    // numDigits: 10,
                    finishOnKey: '',
                    hints: '$OOV_CLASS_DIGIT_SEQUENCE',
                    speechTimeout: 'auto',
                    action: domain + '/inqueue-callback?mode=newNumberProcess' + queryStr + '&attempt=' + attempt + '&noAttempt=' + noAttempt,
                    actionOnEmptyResult: true,
                    method: 'POST'
                };

                // new number menu
                gather = twiml.gather(newNumberMenuOptions);

                gather.say(enSayOptions, CSRHandOff1dot5);
                callback(null, twiml);
                break;
            }
        //  process new number submission
        case 'newNumberProcess':
            {
                console.log(`[newNumberProcess] digits="${digits}" length=${digits.length} attempt=${attempt}`);
                // get the callSid
                if (digits && digits.length === 10) {
                    twiml.redirect(
                        domain +
                        '/inqueue-callback?mode=newNumberConfirm&callsid=' +
                        callSid +
                        '&cbphone=' +
                        digits + queryStr + '&attempt=1' + '&noAttempt=' + noAttempt
                    );

                } else if (attempt <= maxAttempts) {
                    twiml.say(enSayOptions, CSRHandOff1dot6);
                    twiml.redirect(
                        domain +
                        '/inqueue-callback?mode=newNumber&callsid=' +
                        callSid + queryStr + '&attempt=' + (attempt + 1),
                    );
                } else {
                    twiml.say(enSayOptions, CSRHandOff1dot9);
                    twiml.redirect({
                        method: 'POST'
                    }, 'https://' + context.DOMAIN_NAME + '/queue-menu?mode=mainProcess' + queryStr);
                }

                callback(null, twiml);
                break;
            }
        case 'newNumberConfirmProcess':
            {
                if (event.SpeechResult) { command = event.SpeechResult.toLowerCase(); }
                else if (event.Digits) { command = event.Digits; }

                console.log(`[newNumberConfirmProcess] command="${command}" SpeechResult="${event.SpeechResult}" Digits="${event.Digits}" noAttempt=${noAttempt}`);

                if (command) {
                    if (command.includes("yes") || command.includes("sí") || command.includes("Sí") || command == 1) {
                        console.log('[newNumberConfirmProcess] confirmed — redirecting to submitCallback');
                        temp = event.cbphone;
                        twiml.redirect(
                            domain +
                            '/inqueue-callback?mode=submitCallback&callsid=' +
                            callSid +
                            '&cbphone=' +
                            temp + queryStr);
                    }
                    else if ((command.includes("no") || command == 2) && (noAttempt <= maxAttempts)) {
                        console.log(`[newNumberConfirmProcess] no — retrying newNumber noAttempt=${noAttempt + 1}`);
                        twiml.redirect(
                            domain +
                            '/inqueue-callback?mode=newNumber&callsid=' +
                            callSid + queryStr + '&noAttempt=' + (noAttempt + 1));
                    } else {
                        console.log(`[newNumberConfirmProcess] unrecognized or max noAttempts — redirecting to queue menu`);
                        temp = event.cbphone;
                        twiml.redirect(
                            domain +
                            '/queue-menu?mode=mainProcess' + queryStr);
                    }
                } else {
                    console.log('[newNumberConfirmProcess] no input — redirecting to queue menu');
                    twiml.redirect({
                        method: 'POST'
                    }, 'https://' + context.DOMAIN_NAME + '/queue-menu?mode=mainProcess' + queryStr);
                }
                callback(null, twiml);
                break;
            }
        //  handler to submit the callback
        case 'submitCallback':
            {
                //  Steps
                //  1. Fetch TaskSid ( read task w/ attribute of call_sid);
                //  2. Update existing task (assignmentStatus==>'canceled'; reason==>'callback requested' )
                //  3. Create new task ( callback );
                //  4. Hangup callback
                //
                //  main callback logic
                async function main() {
                    console.log(`[submitCallback] starting — callsid=${event.callsid} cbphone=${event.cbphone}`);
                    //  get taskSid based on callSid
                    //  taskInfo = { "sid" : <taskSid>, "queueTargetName" : <taskQueueName>, "queueTargetSid" : <taskQueueSid> };
                    let taskInfo = await getTask(event.callsid);

                    if (!taskInfo || !taskInfo.originalTaskData) {
                        console.log('[submitCallback] ERROR: could not find IVR task — cannot create callback');
                        twiml.say(enSayOptions, CSRHandOff1dot9);
                        twiml.redirect(domain + '/queue-menu?mode=main' + queryStr);
                        return callback(null, twiml);
                    }

                    //  cancel (update) the task given taskSid
                    let taskSid = getOrigTaskData(taskInfo.originalTaskData, 'sid', '');
                    let taskUpdate = await cancelTask(taskSid);
                    console.log(`[submitCallback] cancelTask result=${JSON.stringify(taskUpdate)}`);
                    //  create the callback task
                    try {
                        let cbTask = await createCallback(explodePhone('normalize', event.cbphone), taskInfo);
                        console.log(`[createCallback] task created SID=${cbTask.sid} channel=${cbTask.taskChannelUniqueName} workflowSid=${cbTask.workflowSid}`);
                        //  hangup the call
                        twiml.say(enSayOptions, CSRHandOff1dot8);
                        twiml.hangup();
                    } catch (ee) {
                        console.log('failed to create callback task ...' + ee);
                        twiml.say(enSayOptions, CSRHandOff1dot9);
                        twiml.redirect(
                            domain +
                            '/inqueue-callback?mode=main&callsid=' +
                            callSid + queryStr + '&attempt=' + maxAttempts,
                        );
                    }

                    callback(null, twiml);
                }
                //  call main async function for callback initiation
                main();
                break;
            }
        case 'newNumberConfirm':
            {
                console.log(`[newNumberConfirm] confirming phone=${phone} callSid=${callSid}`);
                let newNumberConfimrMenuOptions = {
                    input: 'speech dtmf',
                    timeout: speechTimeout,
                    language: language,
                    numDigits: 1,
                    finishOnKey: '',
                    hints: '$OPERAND',
                    speechTimeout: 'auto',
                    action: domain + '/inqueue-callback?mode=newNumberConfirmProcess&cbphone=' + explodePhone('format', phone) + queryStr + '&noAttempt=' + noAttempt,
                    actionOnEmptyResult: true,
                    method: 'POST'
                };

                // main menu
                gather = twiml.gather(newNumberConfimrMenuOptions);

                gather.say(enSayOptions, CSRHandOff1dot7a);
                gather.say(enSayOptions, explodePhone('explode', phone));
                gather.say(enSayOptions, CSRHandOff1dot7b);
                callback(null, twiml);
                break;
            }
        default:
            {
                console.log('Invalid mode ...');
                twiml.redirect(
                    domain +
                    '/inqueue-callback?mode=main&callsid=' +
                    callSid + queryStr + '&attempt=' + maxAttempts,
                );
                callback(null, twiml);
                break;
            }
    }
    function handleError(error) {
        let message = '';
        if (error.message) {
            message += error.message;
        }
        if (error.stack) {
            message += ' | stack: ' + error.stack;
        }
        (console.error || console.log).call(console, message || error); 
    }
};