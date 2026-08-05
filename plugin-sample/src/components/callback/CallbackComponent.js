import React from 'react';
import * as Flex from '@twilio/flex-ui';
import moment from 'moment';
import 'moment-timezone';
import { Button } from '@twilio-paste/core/button';
import { CallIcon } from '@twilio-paste/icons/cjs/CallIcon';

import styles from './CallbackStyles';
import * as inqueueUtils from '../common/inqueueUtils';

export default class CallbackComponent extends React.Component {
  static displayName = 'CallbackComponent';

  cbCallButtonAccessibility = async (state) =>
    inqueueUtils.callButtonAccessibility(this.props.task, 'callback', state);

  startCall = async () => {
    const manager = Flex.Manager.getInstance();
    const activityName = manager.workerClient.activity.name;
    if (activityName === 'Offline') {
      // eslint-disable-next-line no-alert
      alert('Change activity state from "Offline" to place a callback call');
      return;
    }

    const { queueSid, attributes } = this.props.task;
    // 'callback' is the attribute key written by the inqueue-callback serverless function
    const { callback, phone_number, from, authenticationStatus, lastOpenIntent, IVRPathSummary, statedReason, sentimentAnalysis, accountNumber, callerName, accountName } = attributes;
    const callbackNumber = callback || phone_number;
    console.log('[CallbackComponent] startCall callbackNumber=', callbackNumber);

    const taskAttributes = {
      type: 'outbound',
      name: `Callback: ${callbackNumber}`,
      phone: callbackNumber,
      callbackTaskSid: this.props.task.taskSid,
      authenticationStatus: authenticationStatus || null,
      lastOpenIntent:       lastOpenIntent       || null,
      IVRPathSummary:       IVRPathSummary       || null,
      statedReason:         statedReason         || null,
      sentimentAnalysis:    sentimentAnalysis     || null,
      accountNumber:        accountNumber         || null,
      callerName:           callerName            || null,
      accountName:          accountName           || null,
    };

    // Disable the call button. Attempt counter increments in beforeCompleteTask
    // (after the call ends) so the displayed count reflects completed attempts.
    this.props.task.setAttributes({
      ...attributes,
      ui_plugin: { ...(attributes.ui_plugin || {}), cbCallButtonAccessibility: true },
    }).catch((e) => console.error('[CallbackComponent] setAttributes error:', e));

    try {
      await Flex.Actions.invokeAction('StartOutboundCall', {
        destination: callbackNumber,
        queueSid,
        callerId: from,
        taskAttributes,
      });
    } catch (e) {
      console.error('[CallbackComponent] StartOutboundCall error:', e.message);
    }
  };

  startTransfer = async () => {
    console.log('[CallbackComponent] startTransfer (requeue) taskSid=', this.props.task.taskSid);
    await this.cbCallButtonAccessibility(false);
    return inqueueUtils.startTransfer(this.props.task);
  };

  markDone = async () => {
    console.log('[CallbackComponent] markDone taskSid=', this.props.task.taskSid);
    try {
      await Flex.Actions.invokeAction('WrapUpTask', { task: this.props.task });
      setTimeout(async () => {
        try {
          await Flex.Actions.invokeAction('CompleteTask', { task: this.props.task });
        } catch (e) {
          console.error('[CallbackComponent] CompleteTask error:', e);
        }
      }, 500);
    } catch (e) {
      console.error('[CallbackComponent] WrapUpTask error:', e);
    }
  };

  render() {
    const { attributes } = this.props.task;

    const callbackNumber = attributes.callback || attributes.phone_number;
    const count = attributes.placeCallRetry || 1;
    const isCallButtonDisabled =
      attributes.ui_plugin && attributes.ui_plugin.cbCallButtonAccessibility;

    let localTimeShort = '';
    try {
      const timeReceived = moment(attributes.callTime.time_recvd);
      const localTz = moment.tz.guess();
      localTimeShort = timeReceived.tz(localTz).format('MM-D-YYYY, h:mm:ss a z');
    } catch (_) {}

    return (
      <span className="Twilio">
        <h1>Contact CallBack Request</h1>
        <p>A contact has requested an immediate callback.</p>
        <h4 style={styles.itemBold}>Callback Details</h4>
        <ul>
          <li>
            <div style={styles.itemWrapper}>
              <span style={styles.item}>Contact Phone:</span>
              <span style={styles.itemDetail}>{callbackNumber}</span>
            </div>
          </li>
          <li>
            <div style={styles.itemWrapper}>
              <span style={styles.item}>Callback Attempt:</span>
              <span style={styles.itemDetail}>{count}</span>
            </div>
          </li>
          {localTimeShort && (
            <li>
              <div style={styles.itemWrapper}>
                <span style={styles.item}>Received:</span>
                <span style={styles.itemDetail}>{localTimeShort}</span>
              </div>
            </li>
          )}
          <li>&nbsp;</li>
        </ul>
        <div style={styles.buttonWrapper}>
          <button
            style={{
              width: '100%',
              padding: '10px 16px',
              backgroundColor: isCallButtonDisabled ? '#a9b4c2' : '#0263e0',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isCallButtonDisabled ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
            onClick={() => this.startCall()}
            disabled={isCallButtonDisabled}
          >
            <span style={{ display: 'inline-flex', width: '16px', height: '16px', flexShrink: 0 }}>
              <CallIcon decorative />
            </span>
            Call {callbackNumber}
          </button>
        </div>
        <p>&nbsp;</p>
      </span>
    );
  }
}
