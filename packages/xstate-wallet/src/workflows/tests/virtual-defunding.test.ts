import {interpret} from 'xstate';
import waitForExpect from 'wait-for-expect';

import {SimpleHub} from './simple-hub';

import {calculateChannelId, createSignatureEntry} from '../../store/state-utils';
import {Participant, Outcome, SignedState, ChannelConstants, DomainBudget} from '../../store/types';
import {AddressZero, HashZero} from '@ethersproject/constants';
import {add, simpleEthAllocation, simpleEthGuarantee, makeDestination} from '../../utils';

import {
  wallet1,
  wallet2,
  wallet3,
  threeParticipants as participants,
  TEST_APP_DOMAIN
} from './data';
import {subscribeToMessages} from './message-service';
import {ParticipantIdx} from '../virtual-funding-as-leaf';
import {VirtualDefundingAsLeaf, VirtualDefundingAsHub} from '..';
import {TestStore} from './store';
import {ETH_ASSET_HOLDER_ADDRESS, HUB} from '../../config';
import {BigNumber, BigNumberish} from 'ethers';
import {MessagingServiceInterface, MessagingService} from '../../messaging';

jest.setTimeout(20000);
const EXPECT_TIMEOUT = process.env.CI ? 9500 : 2000;
const chainId = '0x01';
const challengeDuration = BigNumber.from(10);
const appDefinition = AddressZero;
const alice = participants[ParticipantIdx.A];
const bob = participants[ParticipantIdx.B];
const hub = participants[ParticipantIdx.Hub];
const aliceAndBob = [alice, bob];
const aliceAndHub = [alice, hub];
const bobAndHub = [bob, hub];

let channelNonce = 0;
const channelConstants = (participants: Participant[]): ChannelConstants => ({
  channelNonce: BigNumber.from(channelNonce++),
  chainId,
  challengeDuration,
  participants,
  appDefinition
});

const privateKeys: Record<string, string> = {
  [alice.participantId]: wallet1.privateKey,
  [bob.participantId]: wallet2.privateKey,
  [hub.participantId]: wallet3.privateKey
};

const state = (
  constants: ChannelConstants,
  outcome: Outcome,
  turnNum: BigNumberish = 0
): SignedState => {
  const state = {
    ...constants,
    isFinal: false,
    turnNum: BigNumber.from(turnNum),
    appData: HashZero,
    outcome
  };

  return {
    ...state,
    signatures: constants.participants.map(p =>
      createSignatureEntry(state, privateKeys[p.participantId])
    )
  };
};

/*
  STORE SETUP
  x + y = z

  Channels:
  T: turn 5, [{destination: A, amount: x}, {destination: B, amount: y}]
  J: turn 1, [{ destination: T, amount: z}, {destination: H, amount: z}]
  L1: turn 8, [{destination: A, amount: a}, {destination: H, amount: h1}, {destination: G1, amount: z}}]
  L2: turn 6, [{destination: B, amount: b}, {destination: H, amount: h2}, {destination: G2, amount: z}}]
  G1: turn 0, {target: J, destinations: [J, A, H]}
  G2: turn 0, {target: J, destinations: [J, B, H]}

  Stores:
  A: T, J, L1, G1
  B: T, J, L2, G2
*/

const targetAmounts = [2, 3].map(BigNumber.from);
const totalTargetAmount = targetAmounts.reduce(add);
const targetChannel = channelConstants(aliceAndBob);
const targetChannelId = calculateChannelId(targetChannel);
const targetOutcome = simpleEthAllocation([
  {destination: alice.destination, amount: targetAmounts[0]},
  {destination: bob.destination, amount: targetAmounts[1]}
]);
const targetTurnNum = 5;
const targetState = state(targetChannel, targetOutcome, targetTurnNum);

const jointChannel = channelConstants(participants);
const jointOutcome = simpleEthAllocation([
  {destination: makeDestination(targetChannelId), amount: totalTargetAmount},
  {destination: hub.destination, amount: totalTargetAmount}
]);
const jointState = state(jointChannel, jointOutcome, 1);
const jointChannelId = calculateChannelId(jointState);

const guarantor1 = channelConstants(aliceAndHub);
const guarantor1Outcome = simpleEthGuarantee(
  jointChannelId,
  targetChannelId,
  alice.destination,
  hub.destination
);
const guarantor1State = state(guarantor1, guarantor1Outcome);
const guarantor1Id = calculateChannelId(guarantor1State);

const ledger1Amounts = [5, 7].map(BigNumber.from);
const ledger1 = channelConstants(aliceAndHub);
const ledger1Outcome = simpleEthAllocation([
  {destination: hub.destination, amount: ledger1Amounts[0]},
  {destination: alice.destination, amount: ledger1Amounts[1]},
  {destination: makeDestination(guarantor1Id), amount: totalTargetAmount}
]);
const ledger1TurnNum = 8;
const ledger1State = state(ledger1, ledger1Outcome, ledger1TurnNum);
const ledger1Id = calculateChannelId(ledger1State);

const guarantor2 = channelConstants(bobAndHub);
const guarantor2Outcome = simpleEthGuarantee(
  jointChannelId,
  targetChannelId,
  bob.destination,
  hub.destination
);
const guarantor2State = state(guarantor2, guarantor2Outcome);
const guarantor2Id = calculateChannelId(guarantor2State);

const ledger2Amounts = [5, 7].map(BigNumber.from);
const ledger2 = channelConstants(bobAndHub);
const ledger2Outcome = simpleEthAllocation([
  {destination: makeDestination(hub.destination), amount: ledger2Amounts[0]},
  {destination: makeDestination(bob.destination), amount: ledger2Amounts[1]},
  {destination: makeDestination(targetChannelId), amount: totalTargetAmount}
]);
const ledger2TurnNum = 6;
const ledger2State = state(ledger2, ledger2Outcome, ledger2TurnNum);
const ledger2Id = calculateChannelId(ledger2State);

const context: VirtualDefundingAsLeaf.Init = {targetChannelId};

let aStore: TestStore;
let bStore: TestStore;
let aMessaging: MessagingServiceInterface;
let bMessaging: MessagingServiceInterface;

const generateBudget = (ledgerAmounts): DomainBudget => ({
  domain: TEST_APP_DOMAIN,
  hubAddress: HUB.signingAddress,
  forAsset: {
    [ETH_ASSET_HOLDER_ADDRESS]: {
      assetHolderAddress: ETH_ASSET_HOLDER_ADDRESS,
      availableReceiveCapacity: ledgerAmounts[1],
      availableSendCapacity: ledgerAmounts[0],
      channels: {[targetChannelId]: {amount: totalTargetAmount}}
    }
  }
});

beforeEach(async () => {
  aStore = new TestStore();
  await aStore.initialize([wallet1.privateKey]);
  aMessaging = new MessagingService(aStore);
  await aStore.createBudget(generateBudget(ledger1Amounts));

  await aStore.createEntry(ledger1State, {
    funding: {type: 'Direct'},
    applicationDomain: TEST_APP_DOMAIN
  });
  await aStore.createEntry(guarantor1State, {funding: {type: 'Indirect', ledgerId: ledger1Id}});
  await aStore.createEntry(jointState, {
    funding: {type: 'Guarantee', guarantorChannelId: guarantor1Id}
  });
  await aStore.createEntry(targetState, {funding: {type: 'Virtual', jointChannelId}});

  bStore = new TestStore();
  await bStore.initialize([wallet2.privateKey]);
  bMessaging = new MessagingService(bStore);
  await bStore.createBudget(generateBudget(ledger2Amounts));

  await bStore.createEntry(ledger2State, {
    funding: {type: 'Direct'},
    applicationDomain: TEST_APP_DOMAIN
  });
  await bStore.createEntry(guarantor2State, {funding: {type: 'Indirect', ledgerId: ledger2Id}});
  await bStore.createEntry(jointState, {
    funding: {type: 'Guarantee', guarantorChannelId: guarantor2Id}
  });
  await bStore.createEntry(targetState, {funding: {type: 'Virtual', jointChannelId}});
});

test('virtual defunding with a simple hub', async () => {
  const hubStore = new SimpleHub(wallet3.privateKey);

  const aService = interpret(
    VirtualDefundingAsLeaf.machine(aStore, aMessaging).withContext(context)
  );
  const bService = interpret(
    VirtualDefundingAsLeaf.machine(bStore, bMessaging).withContext(context)
  );
  const services = [aService, bService];

  subscribeToMessages({
    [alice.participantId]: aStore,
    [bob.participantId]: bStore,
    [hub.participantId]: hubStore
  });

  services.forEach(service => service.start());

  await waitForExpect(async () => {
    expect(bService.state.value).toEqual('success');
    expect(aService.state.value).toEqual('success');
    const expectedAmounts1 = [
      targetAmounts[1].add(ledger1Amounts[0]),
      targetAmounts[0].add(ledger1Amounts[1])
    ];
    expectBudgetIsUpdated(expectedAmounts1, aStore);

    const {supported} = await aStore.getEntry(ledger1Id);
    expect((supported.outcome as any).allocationItems).toEqual([
      {destination: hub.destination, amount: targetAmounts[1].add(ledger1Amounts[0])},
      {destination: alice.destination, amount: targetAmounts[0].add(ledger1Amounts[1])}
    ]);
  }, EXPECT_TIMEOUT);
});

test('virtual defunding with a proper hub', async () => {
  const hubStore = new TestStore();
  await hubStore.initialize([wallet3.privateKey]);

  await hubStore.createEntry(ledger1State, {funding: {type: 'Direct'}});
  hubStore.createEntry(jointState, {
    funding: {type: 'Guarantees', guarantorChannelIds: [guarantor1Id, guarantor2Id]}
  });
  await hubStore.createEntry(guarantor1State, {funding: {type: 'Indirect', ledgerId: ledger1Id}});
  await hubStore.createEntry(ledger2State, {funding: {type: 'Direct'}});
  await hubStore.createEntry(guarantor2State, {funding: {type: 'Indirect', ledgerId: ledger2Id}});

  const aService = interpret(
    VirtualDefundingAsLeaf.machine(aStore, aMessaging).withContext(context)
  );
  const bService = interpret(
    VirtualDefundingAsLeaf.machine(bStore, bMessaging).withContext(context)
  );
  const hubService = interpret(
    VirtualDefundingAsHub.machine(hubStore).withContext({jointChannelId})
  );
  const services = [aService, bService, hubService];

  subscribeToMessages({
    [alice.participantId]: aStore,
    [bob.participantId]: bStore,
    [hub.participantId]: hubStore
  });

  services.forEach(service => service.start());

  await waitForExpect(async () => {
    expect(hubService.state.value).toEqual('success');
    expect(aService.state.value).toEqual('success');

    const {supported} = await hubStore.getEntry(ledger1Id);
    expect((supported.outcome as any).allocationItems).toEqual([
      {destination: hub.destination, amount: targetAmounts[1].add(ledger1Amounts[0])},
      {destination: alice.destination, amount: targetAmounts[0].add(ledger1Amounts[1])}
    ]);
  }, EXPECT_TIMEOUT);
});

async function expectBudgetIsUpdated(expectedLedgerAmounts: BigNumber[], store: TestStore) {
  const budget = assumeNotUndefined(await store.getBudget(TEST_APP_DOMAIN));
  const ethBudget = assumeNotUndefined(budget.forAsset[ETH_ASSET_HOLDER_ADDRESS]);
  expect(ethBudget.availableSendCapacity.eq(expectedLedgerAmounts[1])).toBe(true);
  expect(ethBudget.availableReceiveCapacity.eq(expectedLedgerAmounts[0])).toBe(true);
  expect(Object.keys(ethBudget.channels)).toHaveLength(0);
}

function assumeNotUndefined<T>(value: T | undefined): T {
  if (!value) throw new Error('Value is undefined');
  return value;
}
