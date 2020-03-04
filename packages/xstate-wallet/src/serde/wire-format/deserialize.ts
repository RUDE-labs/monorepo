import {
  SignedState as SignedStateWire,
  Outcome as OutcomeWire,
  AllocationItem as AllocationItemWire,
  Allocation as AllocationWire,
  Message as WireMessage,
  isAllocations
} from '@statechannels/wire-format';

import {SignedState, Outcome, AllocationItem, SimpleAllocation, Message} from '../../store/types';
import {bigNumberify} from 'ethers/utils';

export function deserializeMessage(message: WireMessage): Message {
  const signedStates = (message.data.signedStates || []).map(ss => {
    return deserializeState(ss);
  });
  const {objectives} = message.data;
  return {
    signedStates,
    objectives
  };
}

export function deserializeState(state: SignedStateWire): SignedState {
  const stateWithoutChannelId = {...state};
  delete stateWithoutChannelId.channelId;

  return {
    ...stateWithoutChannelId,
    challengeDuration: bigNumberify(state.challengeDuration),
    channelNonce: bigNumberify(state.channelNonce),
    turnNum: bigNumberify(state.turnNum),
    outcome: deserializeOutcome(state.outcome)
  };
}
// where do I move between token and asset holder?
// I have to have asset holder between the wallets, otherwise there is ambiguity
// I don't want asset holders in the json rpc layer, as the client shouldn't care

function deserializeOutcome(outcome: OutcomeWire): Outcome {
  if (isAllocations(outcome)) {
    switch (outcome.length) {
      case 0:
        // TODO: specify in wire format
        throw new Error('Empty allocation');
      case 1:
        return deserializeAllocation(outcome[0]);
      default:
        return {
          type: 'MixedAllocation',
          simpleAllocations: outcome.map(deserializeAllocation)
        };
    }
  } else {
    if (outcome.length !== 1) {
      throw new Error('Currently only supporting guarantees of length 1.');
    } else {
      return {
        type: 'SimpleGuarantee',
        ...outcome[0]
      };
    }
  }

  // either an outcome is all guarantees or all
}

function deserializeAllocation(allocation: AllocationWire): SimpleAllocation {
  const {assetHolderAddress, allocationItems} = allocation;
  return {
    type: 'SimpleAllocation',
    assetHolderAddress,
    allocationItems: allocationItems.map(deserializeAllocationItem)
  };
}

function deserializeAllocationItem(allocationItem: AllocationItemWire): AllocationItem {
  const {amount, destination} = allocationItem;
  return {destination, amount: bigNumberify(amount)};
}