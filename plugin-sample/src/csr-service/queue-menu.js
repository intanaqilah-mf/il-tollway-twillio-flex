/*
    path: /queue-menu
    
    Function Methods (mode)
     - main               => Calculate the Estimated wait time based on that call will be routed to other cases
     - mainProcess        => play the holiday messages and based on the ewt call will be looped or opt for Callback     
     - callbackProcess    => provide the callback menu option for the customer
     - callbackMenuProcess=> process voice input and  redirect to callback functions 
 */
const moment = require('moment');
const callbackConfigPath = Runtime.getFunctions().callbackConfig.path;
const { enSayOptions, speechTimeout, statPeriod, pauseTimeInSec } = require(callbackConfigPath);

const englishPromptsPath = Runtime.getFunctions().englishCSRHadOffPrompts.path;
const { CSRHandOff1dot2, CSRHandOff1dot3, CSRHandOff2dot0, CSRHandOff3dot0, CSRHandOff3dot0a } = require(englishPromptsPath);
let callbackWindowEnabled;

const getSyncMapData = async (client,synMapServiceId,syncPrefs, syncDataCallbackKey ) => {

        return new Promise((resolve, reject) => {
            client.sync.v1.services(synMapServiceId)
                .syncMaps(syncPrefs)
                .syncMapItems(syncDataCallbackKey)
                .fetch()
                .then(response => resolve(response))
                .catch(err => {
                    console.error("Error fetching Sync document:", err);
                    reject(err);
                });
        });
    };
async function getCallbackWindowOpen(context,endOfDayTimestamp,startOfDayTimestamp,queueStartTimestamp,callbackWindowEnabled) {
    console.log("[cbWindow] endOfDayTimestamp:", endOfDayTimestamp, "startOfDayTimestamp:", startOfDayTimestamp);
    if (endOfDayTimestamp > 0) {
        // Operating-hours window check only.
        // Queue wait time is NOT checked here — mainProcess already gates on callerWaitMins >= 3.
        const nowTime = new Date().getTime();
        const beforeEodCutoff = parseInt(context.CALLBACK_TIME_BEFORE_EOD) || 0;
        const afterSodCutoff  = parseInt(context.CALLBACK_TIME_AFTER_SOD)  || 0;
        const beforeEod = nowTime < (endOfDayTimestamp - beforeEodCutoff);
        const afterSod  = nowTime > (startOfDayTimestamp + afterSodCutoff);
        console.log("[cbWindow] nowTime:", nowTime,
            "| beforeEod:", beforeEod, "(cutoff:", beforeEodCutoff, ")",
            "| afterSod:", afterSod,  "(cutoff:", afterSodCutoff, ")");
        if (beforeEod && afterSod) {
            callbackWindowEnabled = true;
        }
    } else {
        // endOfDayTime not supplied — no operating-hours restriction, window is open
        console.log("[cbWindow] no endOfDayTime supplied — window open by default");
        callbackWindowEnabled = true;
    }
    console.log("[cbWindow] result:", callbackWindowEnabled);
    return callbackWindowEnabled;
};

exports.handler = async function (context, event, callback) {
    const client = context.getTwilioClient();
    const domain = 'https://' + context.DOMAIN_NAME;
    let actionOnEmptyResult = '';
    let twiml = new Twilio.twiml.VoiceResponse();
    let gatherMainMenu = twiml;
    let language = event.language ? event.language : 'en-US';
    let isHoliday = event.isHoliday ? event.isHoliday : 'false';
    let isHolidayTomorrow = event.isHolidayTomorrow ? event.isHolidayTomorrow : 'false';
    let startOfDayTime = event.startOfDayTime ? event.startOfDayTime : '';
    let endOfDayTime = event.endOfDayTime ? event.endOfDayTime : '';
    let queueStartTime = event.queueStartTime ? event.queueStartTime : '';
    let workflowSid = event.workflowSid ? event.workflowSid : context.TWILIO_WORKFLOW_SID;
    let synMapServiceId = context.Sync_Map_Service_SID;
    let syncPrefs = context.SYNC_PREFS
    let syncDataCallbackKey=context.SYNC_DATA_Callback;
    let ewt = (event.ewt >= 0) ? event.ewt : 0;
    let iscallbackenabled = true;
   // console.log("ewt:" + ewt);
    
    let endOfDayTimestamp = 0;
    try {
        endOfDayTimestamp = parseInt(endOfDayTime);
       // console.log(" End of Day TimeStamp: " + endOfDayTimestamp);
    } catch (error) {
        let message = '';
        if (error.message) {
            message += error.message;
        }
        if (error.stack) {
            message += ` | stack: ${error.stack}`;
        }
        (console.error || console.log).call(console, message || error);
    };

    let startOfDayTimestamp = 0;
    try {
        startOfDayTimestamp = parseInt(startOfDayTime);
      //  console.log(" Start of Day TimeStamp: " + startOfDayTimestamp);
    } catch (error) {
        let message = '';
        if (error.message) {
            message += error.message;
        }
        if (error.stack) {
            message += ` | stack: ${error.stack}`;
        }
        (console.error || console.log).call(console, message || error);
    };

    let queueStartTimestamp = 0;
    try {
        if (queueStartTime && queueStartTime.length > 0) {
            queueStartTimestamp = parseInt(queueStartTime);
        }
    } catch (ee) {
        console.log("error occured : " + ee);
    }
    if (queueStartTimestamp === 0) {
        queueStartTimestamp = new Date().getTime();
        queueStartTime = queueStartTimestamp + "";
    }
    //    END CUSTOMIZATIONS

    //  variable initialization
    let mode = event.mode ? event.mode : 'main';
    let queryStr = '&language=' + language + '&isHoliday=' + isHoliday + '&isHolidayTomorrow=' + isHolidayTomorrow + '&endOfDayTime=' + endOfDayTime + '&startOfDayTime=' + startOfDayTime + '&queueStartTime=' + queueStartTime + '&workflowSid=' + workflowSid;

    // vars for EWT/PostionInQueue
    let temp = {};
    let res = {};

    let waitTime = [];

    // BEGIN: Supporting functions for Estimated Wait Time and Position in Queue
    //  retrieve workflow cummulative statistics for Estimated wait time
    async function getWorkflowCummStats(workflowSid) {
       // console.log("inside the getWorkflowCummStats() ");
        const statistic = await client.taskrouter.v1
            .workspaces(context.TWILIO_WORKSPACE_SID)
            .workflows(workflowSid)
            .cumulativeStatistics({
                Minutes: statPeriod
            })
            .fetch();

        // console.log(statistic.accountSid);
        // console.log(statistic.avgTaskAcceptanceTime);
        // console.log(statistic.waitDurationUntilAccepted.avg);

        if (statistic && statistic.avgTaskAcceptanceTime != null) {
            ewt = statistic.avgTaskAcceptanceTime;
            ewt = Math.floor((ewt) / 60);
          //  console.log("Avg task acceptance time is " + ewt);
        } else if (statistic && statistic.waitDurationUntilAccepted) {
            //  get max, avg, min wait times for the workflow
            let t = statistic.waitDurationUntilAccepted;
            let result = getWaitTimeResults(t, waitTime);
            if (result && result.length > 0) {
                ewt = result[0].minutes;
            }
           // console.log("Avg waiting during until accepted time " + ewt);
        }
        console.log("EWT is:",ewt);
        return ewt;
    }
    
    actionOnEmptyResult = true;
    let callbackMenuOptions = {
        input: 'speech dtmf',
        timeout: speechTimeout,
        language: language,
        numDigits: 1,
        finishOnKey: '',
        hints: 'callback',
        speechTimeout: speechTimeout,
        action: 'https://' + context.DOMAIN_NAME + '/queue-menu?mode=callbackProcess' + queryStr + '&ewt=' + ewt,
        actionOnEmptyResult: actionOnEmptyResult,
        method: 'POST'
    };

    //  moment function to derive hours, minutes and seconds from cummulative time in seconds
    function waitTimeCalc(type, seconds, waitTime) {
        var duration = moment.duration(seconds, 'seconds');
        res = {
            type: type,
            hours: duration._data.hours,
            minutes: duration._data.minutes,
            seconds: duration._data.seconds
        };
        waitTime.push(res);
        return waitTime;
    }

    function getWaitTimeResults(t, waitTime) {
        //  get formatted wait times
        waitTimeCalc('maxWaitTime', t.max, waitTime);
        waitTimeCalc('avgWaitTime', t.avg, waitTime);
        waitTimeCalc('minWaitTime', t.min, waitTime);

        // get average wait time
        temp = waitTime.filter(item => item.type == 'avgWaitTime');

        return temp;
    }
    //  END: Supporting functions

    //  ==========================
    //  BEGIN:  Main logic
    let digits = event.Digits ? event.Digits : event.SpeechResult;
    if (digits) {
        digits = digits.replace(/[^0-9]/g, '');
    } else {
        digits = '';
    }

    switch (mode) {
        case 'main':
            {
                //get the estimated wait time
              //  console.log("Mode is main");
                ewt = await getWorkflowCummStats(workflowSid);
             //   console.log("ewt inside the main method :" + ewt);
                const iscallbackenabledResponse =await getSyncMapData(client,synMapServiceId,syncPrefs, syncDataCallbackKey);
                const isCallbackWindowOpen = await getCallbackWindowOpen(context,endOfDayTimestamp,startOfDayTimestamp,queueStartTimestamp,callbackWindowEnabled );
                iscallbackenabled = (iscallbackenabledResponse.data.enabled) && (isCallbackWindowOpen);
                console.log(mode, " - isCallbackWindowOpen: ", isCallbackWindowOpen);
                console.log(mode, " - iscallbackenabledResponse: ", iscallbackenabledResponse.data.enabled);
                console.log(mode, " - iscallbackenabled: ", iscallbackenabled);
                //iscallbackenabled = iscallbackenabledResponse.data.enabled;
               // console.log("is callback enabled : "+ JSON.stringify(iscallbackenabled));
                if (language.toLowerCase() == 'es-us') {
                //    console.log("language is :" + language);
                    twiml.redirect({
                        method: 'POST'
                    }, 'https://' + context.DOMAIN_NAME + '/spanish-queue-menu?mode=mainProcess' + queryStr + '&ewt=' + ewt);
                    callback(null, twiml);
                }
                // else if (ewt < 10) { //Added for testing Purpose
                else if (ewt > 10 && iscallbackenabled) {
                    twiml.redirect({
                        method: 'POST'
                    }, 'https://' + context.DOMAIN_NAME + '/queue-menu?mode=largeCallVolume' + queryStr + '&ewt=' + ewt);
                    callback(null, twiml);
                }

                else if (ewt <= 10) {
                    twiml.redirect({
                        method: 'POST'
                    }, 'https://' + context.DOMAIN_NAME + '/queue-menu?mode=mainProcess' + queryStr + '&ewt=' + ewt);
                    callback(null, twiml);
                }

                else {
                    twiml.redirect({
                        method: 'POST'
                    }, 'https://' + context.DOMAIN_NAME + '/queue-menu?mode=mainProcess' + queryStr + '&ewt=' + ewt);
                    callback(null, twiml);
                }
                break;
            }
        case 'mainProcess':
            {
                if (ewt > 3) {
                    gatherMainMenu.say(enSayOptions, CSRHandOff2dot0 + ewt);
                }

                gatherMainMenu.play(`${domain}/hold_music.mp3`);
                gatherMainMenu.say(enSayOptions, CSRHandOff3dot0);
                gatherMainMenu.pause({
                    length: pauseTimeInSec
                });
                gatherMainMenu.say(enSayOptions, CSRHandOff3dot0a);

                ewt = await getWorkflowCummStats(workflowSid);
              //  console.log("ewt inside the main method :" + ewt);
                const iscallbackenabledResponse =await getSyncMapData(client,synMapServiceId,syncPrefs, syncDataCallbackKey);
                const isCallbackWindowOpen = await getCallbackWindowOpen(context,endOfDayTimestamp,startOfDayTimestamp,queueStartTimestamp,callbackWindowEnabled);
                const iscallbackenabled = (iscallbackenabledResponse.data.enabled) && (isCallbackWindowOpen);
                console.log(mode, " - isCallbackWindowOpen: ", isCallbackWindowOpen);
                console.log(mode, " - iscallbackenabledResponse: ", iscallbackenabledResponse.data.enabled);
                console.log(mode, " - iscallbackenabled: ", iscallbackenabled);
               // iscallbackenabled = iscallbackenabledResponse.data.enabled;
             //   console.log("is callback enabled : "+ JSON.stringify(iscallbackenabled));
                const callerWaitMs = new Date().getTime() - queueStartTimestamp;
                const callerWaitMins = Math.floor(callerWaitMs / 60000);
                console.log(mode, ' - ewt:', ewt, ' callerWaitMins:', callerWaitMins, ' iscallbackenabled:', iscallbackenabled);
                if (iscallbackenabled && callerWaitMins >= 3) {
                    twiml.redirect({
                        method: 'POST'
                    }, 'https://' + context.DOMAIN_NAME + '/queue-menu?mode=callbackMenuProcess' + queryStr + '&ewt=' + ewt);
                    callback(null, twiml);
                }
                else {
                    twiml.redirect({
                        method: 'POST'
                    }, 'https://' + context.DOMAIN_NAME + '/queue-menu?mode=mainProcess' + queryStr + '&ewt=' + ewt);
                }
                callback(null, twiml);
                break;
            }
        case 'largeCallVolume':
            {
                gatherMainMenu.say(enSayOptions, CSRHandOff1dot2 + ewt);
                twiml.redirect({
                    method: 'POST'
                }, 'https://' + context.DOMAIN_NAME + '/queue-menu?mode=callbackMenuProcess' + queryStr + '&ewt=' + ewt);

                callback(null, twiml);
                break;
            }
        case 'callbackMenuProcess':
            {
                // gatherMainMenu.say(enSayOptions, CSRHandOff1dot2 + ewt + ".");
                let gatherCallbackMenu = gatherMainMenu.gather(callbackMenuOptions);
                gatherCallbackMenu.say(enSayOptions, CSRHandOff1dot3);
                callback(null, twiml);
                break;
            }
        case 'callbackProcess':
            {
                let command;
                if (event.SpeechResult) { command = event.SpeechResult.toLowerCase(); }
                else if (event.Digits) { command = event.Digits; }
                else {
                    twiml.redirect({
                        method: 'POST'
                    }, 'https://' + context.DOMAIN_NAME + '/queue-menu?mode=main' + queryStr + '&ewt=' + ewt);
                }
                if (command) {
                    if (command.includes("callback") || command.includes("call")) {
                        twiml.redirect('https://' + context.DOMAIN_NAME + '/inqueue-callback?mode=main' + queryStr + '&ewt=' + ewt);
                    } else {
                        twiml.redirect({
                            method: 'POST'
                        }, 'https://' + context.DOMAIN_NAME + '/queue-menu?mode=mainProcess' + queryStr + '&ewt=' + ewt);
                    }
                }
                callback(null, twiml);
                break;
            }
    }

};