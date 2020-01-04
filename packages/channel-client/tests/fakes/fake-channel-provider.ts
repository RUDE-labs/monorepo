import {ChannelProviderInterface} from '@statechannels/channel-provider/src';
import log = require('loglevel');
import {bigNumberify} from 'ethers/utils';
import {EventEmitter, ListenerFn} from 'eventemitter3';
import {
  ChannelResult,
  CreateChannelParameters,
  Message,
  NotificationType,
  PushMessageResult
} from '../../src/types';
import {calculateChannelId} from '../../src/utils';

/*
 This fake provider becomes the stateful object which handles the calls
 coming from a non-fake `ChannelClient`.
 */
export class FakeChannelProvider implements ChannelProviderInterface {
  private events = new EventEmitter();
  protected url = '';

  playerIndex?: number;
  opponentIndex?: number;
  address?: string;
  opponentAddress?: string;
  latestState?: ChannelResult;

  async enable(url?: string): Promise<void> {
    this.url = url || '';
  }

  send<ResultType = any>(method: string, params?: any): Promise<any> {
    switch (method) {
      case 'CreateChannel':
        return this.createChannel(params);

      case 'PushMessage':
        return this.pushMessage(params);

      case 'GetAddress':
        return this.getAddress();

      case 'JoinChannel':
        return this.joinChannel(params);

      case 'UpdateChannel':
      case 'CloseChannel':
        if (this.events.listenerCount('ChannelUpdated') === 0) {
          return Promise.reject(`No callback available for ${method}`);
        }
        this.events.emit('ChannelUpdated', params);
        break;

      default:
        return Promise.reject(`No callback available for ${method}`);
    }

    const result: any = {};
    return Promise.resolve(result);
  }

  on(event: string, callback: ListenerFn): void {
    this.events.on(event, callback);
  }

  off(event: string, callback?: ListenerFn): void {
    this.events.off(event);
  }

  subscribe(subscriptionType: string): Promise<string> {
    return Promise.resolve('success');
  }
  unsubscribe(subscriptionId: string): Promise<boolean> {
    return Promise.resolve(true);
  }

  setState(state: ChannelResult): void {
    this.latestState = state;
  }

  setAddress(address: string): void {
    this.address = address;
  }

  updatePlayerIndex(playerIndex: number): void {
    if (this.playerIndex === undefined) {
      this.playerIndex = playerIndex;
      this.opponentIndex = playerIndex == 1 ? 0 : 1;
    }
  }

  private async getAddress(): Promise<string> {
    if (this.address === undefined) {
      throw Error('No address has been set yet');
    }
    return this.address;
  }

  private getPlayerIndex(): number {
    if (this.playerIndex === undefined) {
      throw Error(`This client does not have its player index set yet`);
    }
    return this.playerIndex;
  }

  private getOpponentIndex(): number {
    if (this.opponentIndex === undefined) {
      throw Error(`This client does not have its opponent player index set yet`);
    }
    return this.opponentIndex;
  }

  private verifyTurnNum(turnNum: string): Promise<void> {
    const currentTurnNum = bigNumberify(turnNum);
    if (currentTurnNum.mod(2).eq(this.getPlayerIndex())) {
      return Promise.reject(
        `Not your turn: currentTurnNum = ${currentTurnNum}, index = ${this.playerIndex}`
      );
    }
    return Promise.resolve();
  }

  private getNextTurnNum(latestState: ChannelResult) {
    return bigNumberify(latestState.turnNum)
      .add(1)
      .toString();
  }

  protected findChannel(channelId: string): ChannelResult {
    if (!(this.latestState && this.latestState.channelId === channelId)) {
      throw Error(`Channel does't exist with channelId '${JSON.stringify(channelId, null, 4)}'`);
    }
    return this.latestState;
  }

  private async createChannel(params: CreateChannelParameters): Promise<ChannelResult> {
    const participants = params.participants;
    const allocations = params.allocations;
    const appDefinition = params.appDefinition;
    const appData = params.appData;

    const channel: ChannelResult = {
      participants,
      allocations,
      appDefinition,
      appData,
      channelId: calculateChannelId(participants, appDefinition),
      turnNum: bigNumberify(0).toString(),
      status: 'proposed'
    };
    this.updatePlayerIndex(0);
    this.latestState = channel;
    this.address = channel.participants[0].participantId;
    this.opponentAddress = channel.participants[1].participantId;
    this.notifyOpponent(channel, 'ChannelProposed');

    return channel;
  }

  private async joinChannel(params: {channelId: string}): Promise<ChannelResult> {
    const latestState = this.findChannel(params.channelId);
    this.updatePlayerIndex(1);
    log.debug(`Player ${this.getPlayerIndex()} joining channel ${params.channelId}`);
    await this.verifyTurnNum(latestState.turnNum);

    // skip funding by setting the channel to 'running' the moment it is joined
    // [assuming we're working with 2-participant channels for the time being]
    this.latestState = {
      ...latestState,
      turnNum: bigNumberify(3).toString(),
      status: 'running'
    };
    this.opponentAddress = latestState.participants[0].participantId;
    this.notifyOpponent(this.latestState, 'MessageQueued');

    return this.latestState;
  }

  private notifyOpponent(data: ChannelResult, notificationType: NotificationType): void {
    log.debug(
      `${this.getPlayerIndex()} notifying opponent ${this.getOpponentIndex()} about ${notificationType}`
    );
    const sender = this.address;
    const recipient = this.opponentAddress;

    if (!recipient) {
      throw Error(`Cannot notify opponent - opponent address not set`);
    }

    this.events.emit('MessageQueued', {sender, recipient, data});
  }

  private async pushMessage(params: Message<ChannelResult>): Promise<PushMessageResult> {
    this.latestState = params.data;
    // this.notifyApp(this.latestState);
    const turnNum = this.getNextTurnNum(this.latestState);

    switch (params.data.status) {
      case 'proposed':
        this.events.emit('ChannelProposed', {params});
        break;
      // auto-close, if we received a close
      case 'closing':
        this.latestState = {...this.latestState, turnNum, status: 'closed'};
        this.notifyOpponent(this.latestState, 'ChannelUpdate');
        // this.notifyApp(this.latestState);
        break;
      default:
        break;
    }

    return {success: true};
  }
}
