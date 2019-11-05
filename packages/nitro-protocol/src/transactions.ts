import {Contract} from 'ethers';
import {TransactionRequest} from 'ethers/providers';
import {Signature} from 'ethers/utils';
import {SignedState} from '.';
import {State} from './contract/state';
import * as forceMoveTrans from './contract/transaction-creators/force-move';
import {getStateSignerAddress} from './signatures';

export async function getData(provider, contractAddress: string, channelId: string) {
  const forceMove = new Contract(
    contractAddress,
    forceMoveTrans.ForceMoveContractInterface,
    provider
  );
  return await forceMove.getData(channelId);
}

export function createForceMoveTransaction(
  signedStates: SignedState[],
  challengePrivateKey: string
): TransactionRequest {
  const {states, signatures, whoSignedWhat} = createSignatureArguments(signedStates);

  return forceMoveTrans.createForceMoveTransaction(
    states,
    signatures,
    whoSignedWhat,
    challengePrivateKey
  );
}

export function createRespondTransaction(
  challengeState: State,
  response: SignedState
): TransactionRequest {
  if (!challengeState) {
    throw new Error('No active challenge in challenge state');
  }
  return forceMoveTrans.createRespondTransaction({
    challengeState,
    responseState: response.state,
    responseSignature: response.signature,
  });
}

export function createCheckpointTransaction(signedStates: SignedState[]): TransactionRequest {
  const {states, signatures, whoSignedWhat} = createSignatureArguments(signedStates);
  return forceMoveTrans.createCheckpointTransaction({
    states,
    signatures,
    whoSignedWhat,
  });
}

export function createConcludeTransaction(conclusionProof: SignedState[]): TransactionRequest {
  const {states, signatures, whoSignedWhat} = createSignatureArguments(conclusionProof);
  return forceMoveTrans.createConcludeTransaction(states, signatures, whoSignedWhat);
}

// Currently we assume each signedState is a unique combination of state/signature
// So if multiple participants sign a state we expect a SignedState for each participant
function createSignatureArguments(
  signedStates: SignedState[]
): {states: State[]; signatures: Signature[]; whoSignedWhat: number[]} {
  const {participants} = signedStates[0].state.channel;

  // Get a list of all unique states.
  const states = signedStates.filter((s, i, a) => a.indexOf(s) === i).map(s => s.state);
  const signatures = signedStates.map(s => s.signature);
  // Generate whoSignedWhat based on the original list of states (which may contain the same state signed by multiple participants)
  const whoSignedWhat = signedStates.map(s => participants.indexOf(getStateSignerAddress(s)));

  return {states, signatures, whoSignedWhat};
}
