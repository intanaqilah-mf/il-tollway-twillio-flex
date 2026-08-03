/*
    path: /queue-menu
    
    Function Methods (mode)
     - main                 => present menu for in-queue main menu options
     - mainProcess          => present menu for main menu options (1=>Stay Queue; 2=>Callback; 3=>goBack)
     - menuProcess          => process DTMF for redirect to supporting functions (stayQueue, callback, goBack)
 */
const moment = require('moment');

exports.handler = async function(context, event, callback) {
  const client = context.getTwilioClient();
  const domain = 'https://' + context.DOMAIN_NAME;
  
  let twiml = new Twilio.twiml.VoiceResponse();
  let language = event.language?event.language:'en-US';
  let isHoliday = event.isHoliday?event.isHoliday:'false';
  let isHolidayTomorrow = event.isHolidayTomorrow?event.isHolidayTomorrow:'false';
  let fleet = event.fleet?event.fleet:'false';
  let startOfDayTime = event.startOfDayTime?event.startOfDayTime:'';
  let endOfDayTime = event.endOfDayTime?event.endOfDayTime:'';
  let queueStartTime = event.queueStartTime?event.queueStartTime:'';
  let workflowSid = event.workflowSid?event.workflowSid:((fleet === 'true')?context.TWILIO_FLEET_WORKFLOW_SID:context.TWILIO_WORKFLOW_SID);
 
  let endOfDayTimestamp = 0;
  try {
    endOfDayTimestamp = parseInt(endOfDayTime);
  } catch(ee) {};
  
  let startOfDayTimestamp = 0;
  try {
    startOfDayTimestamp = parseInt(startOfDayTime);
  } catch(ee) {};
  
  let queueStartTimestamp = 0;
  try {
    if ( queueStartTime && queueStartTime.length > 0 ) {
      queueStartTimestamp = parseInt(queueStartTime);
    }
  } catch(ee) {
  }
  if ( queueStartTimestamp === 0 ) {
    queueStartTimestamp = new Date().getTime();
    queueStartTime = queueStartTimestamp + "";
  }
  
  const getEwt = true;
  const speechTimeout = 3;
  const statPeriod = 30;
  //    END CUSTOMIZATIONS

  //  variable initialization
  let mode = event.mode?event.mode:'main';
  let queryStr = '&language='+language+'&isHoliday='+isHoliday+'&isHolidayTomorrow='+isHolidayTomorrow+'&endOfDayTime='+endOfDayTime+'&startOfDayTime='+startOfDayTime+'&queueStartTime='+queueStartTime+'&fleet='+fleet+'&workflowSid='+workflowSid;

  // vars for EWT/PostionInQueue
  let temp = {};
  let res = {};

  let waitTime = [];
  let taskList = [];
  let attr = {};

  // BEGIN: Supporting functions for Estimated Wait Time and Position in Queue
  //  retrieve workflow cummulative statistics for Estimated wait time
  async function getWorkflowCummStats(workflowSid) {
    return client.taskrouter
      .workspaces(context.TWILIO_WORKSPACE_SID)
      .workflows(workflowSid)
      .cumulativeStatistics({
        Minutes: statPeriod
      })
      .fetch()
      .then(workflow_statistics => {
        res = {
          status: 'success',
          topic: 'getWorkflowCummStats',
          action: 'getWorkflowCummStats',
          data: workflow_statistics
        };
        return res;
      })
      .catch(error => {
        res = {
          status: 'error',
          topic: 'getWorkflowCummStats',
          action: 'getWorkflowCummStats',
          data: error
        };
      });
  }

  
  let  actionOnEmptyResult = false;
  let mainMenuOptions = {
        input: 'dtmf',
        timeout: speechTimeout,
        language: language,
        numDigits: 1,
        finishOnKey: '',
        hints: '$OPERAND',
        speechTimeout: speechTimeout,
        action:  domain + '/queue-menu?mode=menuProcess'+queryStr,
        actionOnEmptyResult: actionOnEmptyResult,
        method: 'POST'
    };
    
  actionOnEmptyResult = true;  
  let callbackMenuOptions = {
        input: 'dtmf',
        timeout: speechTimeout,
        language: language,
        numDigits: 1,
        finishOnKey: '',
        hints: '$OPERAND',
        speechTimeout: speechTimeout,
        action:  'https://' + context.DOMAIN_NAME + '/queue-menu?mode=callbackProcess'+queryStr,
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
  let digits = event.Digits?event.Digits:event.SpeechResult;
  if ( digits ) {
    digits = digits.replace(/[^0-9]/g,'');
  } else {
    digits = '';
  }
  
  switch (mode) {
    case 'main':
      async function main() {
        //  logic for retrieval of Estimated Wait Time
        let ewt = 0;
        if (getEwt) {
          temp = await getWorkflowCummStats(workflowSid);
          
          if ( temp.data && temp.data.avgTaskAcceptanceTime != null ) {
            ewt = temp.data.avgTaskAcceptanceTime;
            console.log("Avg waiting time is " + ewt);
          } else if ( temp.data && temp.data.waitDurationUntilAccepted ) {
            //  get max, avg, min wait times for the workflow
            let t = temp.data.waitDurationUntilAccepted;
            let result = getWaitTimeResults(t, waitTime);
            if (result && result.length > 0 ) {
               ewt = result[0].minutes*60;
            }   
            console.log("Avg waiting time result is " + ewt);
          }

        }
    
        let gatherMainMenu = twiml;
        if ( fleet !== 'true' ) {
          gatherMainMenu = twiml.gather(mainMenuOptions);
        }
        
        if ( ewt > (10*60) ) { //more than 10 minutes
          if (isHoliday === 'true' ) {
            gatherMainMenu.play({
                loop: 1
              }, context.PROMPT_BASE_URL + '/' + language + '/310.wav'); 
          } else if (isHolidayTomorrow === 'true' ) {
            gatherMainMenu.play({
                loop: 1
              }, context.PROMPT_BASE_URL + '/' + language + '/309.wav'); 
          } else {
            gatherMainMenu.play({
                loop: 1
              }, context.PROMPT_BASE_URL + '/' + language + '/308.wav');     
          }
        } else if ( ewt > (3*60) ) { //more than 3-10 minutes
          if (isHoliday === 'true' ) {
            gatherMainMenu.play({
                loop: 1
              }, context.PROMPT_BASE_URL + '/' + language + '/307.wav'); 
          } else if (isHolidayTomorrow === 'true' ) {
            gatherMainMenu.play({
                loop: 1
              }, context.PROMPT_BASE_URL + '/' + language + '/306.wav'); 
          } else {
            gatherMainMenu.play({
                loop: 1
              }, context.PROMPT_BASE_URL + '/' + language + '/305.wav');     
          }
      } else {
          if (isHoliday === 'true' ) {
            gatherMainMenu.play({
                loop: 1
              }, context.PROMPT_BASE_URL + '/' + language + '/304.wav'); 
          } else if (isHolidayTomorrow === 'true' ) {
            gatherMainMenu.play({
                loop: 1
              }, context.PROMPT_BASE_URL + '/' + language + '/303.wav'); 
          } else {
            gatherMainMenu.play({
                loop: 1
              }, context.PROMPT_BASE_URL + '/' + language + '/302.wav');     
          }
        }
        
        let callbackEnabled = false;
        if ( endOfDayTimestamp > 0 ) {
          let nowTime = new Date().getTime();
          //console.log((endOfDayTimestamp-parseInt(context.CALLBACK_TIME_BEFORE_EOD)));
          //console.log((startOfDayTimestamp+parseInt(context.CALLBACK_TIME_AFTER_SOD)));
          if ( nowTime < (endOfDayTimestamp-parseInt(context.CALLBACK_TIME_BEFORE_EOD)) && nowTime > (startOfDayTimestamp+parseInt(context.CALLBACK_TIME_AFTER_SOD) ) ) {
            if ( nowTime > (queueStartTimestamp+parseInt(context.CALLBACK_QUEUE_TIME)) ) {
              callbackEnabled = true;
            }
          }
        }
        
        if ( callbackEnabled ) { 
          let gatherCallbackMenu = twiml.gather(callbackMenuOptions);
          gatherCallbackMenu.play({
                  loop: 1
                }, context.PROMPT_BASE_URL + '/' + language + '/311-dtmf.wav'); 
        } else {
          twiml.redirect({
            method: 'POST'
          }, domain + '/queue-menu?mode=menuProcess'+queryStr);
        }  
        callback(null, twiml);
      }
      
      main();
      break;

    case 'menuProcess':
      if (digits.startsWith('1') ) {
        twiml.leave();
      } else {
        twiml.play({
          loop: 1
        }, context.MOH_URL); 
        twiml.redirect({
          method: 'POST'
        }, 'https://' + context.DOMAIN_NAME + '/queue-menu?mode=main'+queryStr);
      }
      callback(null, twiml);
      break;

    case 'callbackProcess':
      if (digits.startsWith('1')) {
          twiml.redirect('https://' + context.DOMAIN_NAME + '/inqueue-callback?mode=main'+queryStr);
      } else {
        twiml.play({
          loop: 1
        }, context.MOH_URL); 
        twiml.redirect({
          method: 'POST'
        }, 'https://' + context.DOMAIN_NAME + '/queue-menu?mode=main'+queryStr);
      } 
      
      callback(null, twiml);
      break;
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