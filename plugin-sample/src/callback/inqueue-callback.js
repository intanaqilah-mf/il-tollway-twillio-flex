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
    Last Updated: 03/27/2020
*/

exports.handler = function (context, event, callback) {
  const client = context.getTwilioClient();
  
  const moment = require('moment-timezone');
  const maxAttempts = 3;
  let twiml = new Twilio.twiml.VoiceResponse();

  let domain = 'https://' + context.DOMAIN_NAME;

  let mode = event.mode?event.mode:'main';
  let phone = event.cbphone?event.cbphone:event.From;
  let callSid = '';
  
  let language = event.language?event.language:'en-US';
  let isHoliday = event.isHoliday?event.isHoliday:'false';
  let isHolidayTomorrow = event.isHolidayTomorrow?event.isHolidayTomorrow:'false';
  let fleet = event.fleet?event.fleet:'false';
  let endOfDayTime = event.endOfDayTime?event.endOfDayTime:'';
  let startOfDayTime = event.startOfDayTime?event.startOfDayTime:'';
  let queueStartTime = event.queueStartTime?event.queueStartTime:'';
  let attempt = parseInt(event.attempt?event.attempt:'1');
  let digits = event.Digits?event.Digits:event.SpeechResult;
  if ( digits ) {
    digits = digits.replace(/[^0-9]/g,'');
  } else {
    digits = '';
  }
  let workflowSid = event.workflowSid;
  
  //   CUSTOMIZATIONS
  const sayOptions = { voice: (language==='es-US'?'Polly.Penelope':'Polly.Joanna'), language: language };
  //    agent audible alert sound file - task attribute value
  const alertTone = domain + '/alertTone.mp3';
  const server_tz = 'America/Chicago';
  const speechTimeout = 3;
  //    END CUSTOMIZATIONS
  
  // Pre-call attributes passed from Studio/IVR flow
  let authenticationStatus = event.authenticationStatus || '';
  let lastOpenIntent       = event.lastOpenIntent       || '';
  let IVRPathSummary       = event.IVRPathSummary       || '';
  let statedReason         = event.statedReason         || '';
  let sentimentAnalysis    = event.sentimentAnalysis    || '';
  let accountNumber        = event.AccountNumber        || event.accountNumber || '';
  let callerName           = event.callerName           || event.customerName || '';
  let accountName          = event.accountName          || event.account_name || '';

  let queryStr = '&language='+language+'&isHoliday='+isHoliday+'&isHolidayTomorrow='+isHolidayTomorrow+'&endOfDayTime='+endOfDayTime+'&startOfDayTime='+startOfDayTime+'&queueStartTime='+queueStartTime+'&fleet='+fleet+'&workflowSid='+workflowSid
    +'&authenticationStatus='+encodeURIComponent(authenticationStatus)
    +'&lastOpenIntent='+encodeURIComponent(lastOpenIntent)
    +'&IVRPathSummary='+encodeURIComponent(IVRPathSummary)
    +'&statedReason='+encodeURIComponent(statedReason)
    +'&sentimentAnalysis='+encodeURIComponent(sentimentAnalysis)
    +'&accountNumber='+encodeURIComponent(accountNumber)
    +'&callerName='+encodeURIComponent(callerName)
    +'&accountName='+encodeURIComponent(accountName);

  //  find the task given the callSid - get TaskSid
  async function getTask(callSid) {
    attrFilter = `call_sid='${callSid}'`;
    console.log(`[getTask] querying callSid=${callSid} filter="${attrFilter}"`);

    try {
      let task = await client.taskrouter
        .workspaces(context.TWILIO_WORKSPACE_SID)
        .tasks.list({
          evaluateTaskAttributes: attrFilter,
          limit: 20,
        });

      console.log(`[getTask] found ${task.length} task(s)`);
      if (task[0]) {
        console.log(`[getTask] task SID=${task[0].sid} status=${task[0].assignmentStatus}`);
      } else {
        console.log('[getTask] WARNING: no task found — check call_sid attribute and TWILIO_WORKSPACE_SID');
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
    try {
      await client.taskrouter
        .workspaces(context.TWILIO_WORKSPACE_SID)
        .tasks(taskSid)
        .update({
          assignmentStatus: 'canceled',
          reason: 'Callback Requested',
        });
    } catch (error) {
      console.log('cancelTask error');
      handleError(error);
    }
  }

  // create the callback task
  async function createCallback(phone, taskInfo) {
    let time = getTime(server_tz);

    const taskAttributes = {
      taskType: 'callback',
      ringback: alertTone,
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
      conversations:  getOrigTaskData(
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
      // Pre-call data surfaced in agent's SAICPanel before/during the call
      authenticationStatus: getOrigTaskData(taskInfo.originalTaskData, 'authenticationStatus', 'getAttribute') || authenticationStatus || null,
      lastOpenIntent:       getOrigTaskData(taskInfo.originalTaskData, 'lastOpenIntent', 'getAttribute') || getOrigTaskData(taskInfo.originalTaskData, 'intentIdentified', 'getAttribute') || lastOpenIntent || null,
      IVRPathSummary:       getOrigTaskData(taskInfo.originalTaskData, 'IVRPathSummary', 'getAttribute') || IVRPathSummary || null,
      statedReason:         getOrigTaskData(taskInfo.originalTaskData, 'statedReason', 'getAttribute') || statedReason || null,
      sentimentAnalysis:    getOrigTaskData(taskInfo.originalTaskData, 'sentimentAnalysis', 'getAttribute') || sentimentAnalysis || null,
      accountNumber:        getOrigTaskData(taskInfo.originalTaskData, 'AccountNumber', 'getAttribute') || getOrigTaskData(taskInfo.originalTaskData, 'accountNumber', 'getAttribute') || getOrigTaskData(taskInfo.originalTaskData, 'account_number', 'getAttribute') || accountNumber || null,
      callerName:           getOrigTaskData(taskInfo.originalTaskData, 'callerName', 'getAttribute') || getOrigTaskData(taskInfo.originalTaskData, 'customerName', 'getAttribute') || callerName || null,
      accountName:          getOrigTaskData(taskInfo.originalTaskData, 'accountName', 'getAttribute') || getOrigTaskData(taskInfo.originalTaskData, 'account_name', 'getAttribute') || getOrigTaskData(taskInfo.originalTaskData, 'customerName', 'getAttribute') || accountName || null,
    };
    try {
      let cbTask = await client.taskrouter
        .workspaces(context.TWILIO_WORKSPACE_SID)
        .tasks.create({
          attributes: JSON.stringify(taskAttributes),
          type: 'callback',
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
      if ( phone.length === 10 ) {
        return '+1' + phone;
      } else if ( phone.length === 11 && phone.startsWith('1')) {
        return '+' + phone;
      } 
      return phone;
    }
    if (mode == 'explode') {
      let temp = '';
      phone = phone.replace('+', '');
      if ( phone.startsWith('1') && phone.length === 11 ) {
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

  if ( phone ) {
    phone = phone.replace(/[^0-9]/g,'');
  } else {
    phone = '';
  }
  
  if ( mode === 'main' && phone.length < 10 ) {
    //invalid ANI 
    mode = 'newNumber';
  }
  
  console.log(attempt);
  console.log(mode);
  
  if ( attempt >= maxAttempts ) {
    twiml.play({
          loop: 1
        }, context.MOH_URL); 
    twiml.redirect({
          method: 'POST'
        }, domain + '/queue-menu?mode=main'+queryStr);
    return callback(null, twiml);
  }
  callSid = event.CallSid;
  let gather = null;
  
  // main logic for callback methods
  switch (mode) {
    //  present main menu options
    case 'main':
      //  get callsid
      let mainMenuOptions = {
        input: 'dtmf',
        timeout: speechTimeout,
        language: language,
        numDigits: 1,
        finishOnKey: '',
        hints: '$OPERAND',
        speechTimeout: speechTimeout,
        action:  domain + '/inqueue-callback?mode=mainProcess&cbphone='+explodePhone('format', phone)+queryStr+'&attempt='+attempt,
        actionOnEmptyResult: true,
        method: 'POST'
      };
    
      // main menu
      gather = twiml.gather(mainMenuOptions);
      
      gather.play({
                loop: 1
              }, context.PROMPT_BASE_URL + '/' + language + '/1902.wav'); 
      gather.say(sayOptions, explodePhone('explode', phone));
      gather.play({
                loop: 1
              }, context.PROMPT_BASE_URL + '/' + language + '/1903.wav'); 
      
              
      callback(null, twiml);
      break;

    //  process main menu selections
    case 'mainProcess':
      if ( digits && digits.length > 1 ) {
        digits = digits.substring(0,1);
      }
      switch (digits) {
        //  existing number
        case '1':
          // redirect to submitCalBack
          temp = event.cbphone;
          twiml.redirect(
            domain +
              '/inqueue-callback?mode=submitCallback&callsid=' +
              callSid +
              '&cbphone=' +
              temp + queryStr + '&attempt=1'
          );
          callback(null, twiml);
          break;
        //  new number
        case '2':
          twiml.redirect(
            domain +
              '/inqueue-callback?mode=newNumber&callsid=' +
              callSid + queryStr + '&attempt=1'
          );
          callback(null, twiml);
          break;
        default:
          temp = event.cbphone;
          twiml.redirect(
            domain +
              '/inqueue-callback?mode=main&callsid=' +
              callSid +
              '&cbphone=' +
              temp + queryStr + '&attempt='+(attempt + 1)
          );
          callback(null, twiml);
          break;
      }
      break;

    //  present new number menu selections
    case 'newNumber':
      let newNumberMenuOptions = {
        input: 'dtmf',
        timeout: speechTimeout,
        language: language,
        numDigits: 10,
        finishOnKey: '',
        hints: '$OOV_CLASS_DIGIT_SEQUENCE',
        speechTimeout: speechTimeout,
        action:  domain + '/inqueue-callback?mode=newNumberProcess' + queryStr +'&attempt='+attempt,
        actionOnEmptyResult: true,
        method: 'POST'
      };
    
      // new number menu
      gather = twiml.gather(newNumberMenuOptions);
      
      gather.play({
                loop: 1
              }, context.PROMPT_BASE_URL + '/' + language + '/1900.wav'); 
      callback(null, twiml);
      break;

    //  process new number submission
    case 'newNumberProcess':
      // get the callSid
      if ( digits && digits.length === 10 ) {
        twiml.redirect(
            domain +
              '/inqueue-callback?mode=main&callsid=' +
              callSid +
              '&cbphone=' +
              digits + queryStr + '&attempt=1'
          );
          
      } else {
        twiml.play({
                loop: 1
              }, context.PROMPT_BASE_URL + '/' + language + '/1901.wav'); 
        twiml.redirect(
            domain +
              '/inqueue-callback?mode=newNumber&callsid=' +
              callSid + queryStr + '&attempt='+(attempt + 1),
          );
      }
      
      callback(null, twiml);
      break;

    //  handler to submit the callback
    case 'submitCallback':
      //  Steps
      //  1. Fetch TaskSid ( read task w/ attribute of call_sid);
      //  2. Update existing task (assignmentStatus==>'canceled'; reason==>'callback requested' )
      //  3. Create new task ( callback );
      //  4. Hangup callback
      //
      //  main callback logic
      async function main() {
        //  get taskSid based on callSid
        //  taskInfo = { "sid" : <taskSid>, "queueTargetName" : <taskQueueName>, "queueTargetSid" : <taskQueueSid> };
        let taskInfo = await getTask(event.callsid);

        //  cancel (update) the task given taskSid
        let taskSid = getOrigTaskData(taskInfo.originalTaskData, 'sid', '');
        let taskUpdate = await cancelTask(taskSid);

        //  create the callback task
        try {
          let cbTask = await createCallback(explodePhone('normalize', event.cbphone), taskInfo);

          //  hangup the call
          twiml.play({
                loop: 1
              }, context.PROMPT_BASE_URL + '/' + language + '/1904.wav'); 
          twiml.hangup();
        } catch(ee) {
          console.log('failed to create callback task ...');
          twiml.redirect(
            domain +
              '/inqueue-callback?mode=main&callsid=' +
              callSid + queryStr + '&attempt='+maxAttempts,
          );
        }
        
        callback(null, twiml);
      }
      //  call main async function for callback initiation
      main();

      break;
    default:
      console.log('Invalid mode ...');
      twiml.redirect(
            domain +
              '/inqueue-callback?mode=main&callsid=' +
              callSid + queryStr + '&attempt='+maxAttempts,
      );
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