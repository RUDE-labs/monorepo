import {
  AllocationItem,
  SimpleAllocation,
  SimpleGuarantee,
  Outcome,
  Allocation
} from '../store/types';
import {ETH_ASSET_HOLDER_ADDRESS} from '../constants';
import _ from 'lodash';
import {bigNumberify} from 'ethers/utils';

export function isSimpleEthAllocation(outcome: Outcome): outcome is SimpleAllocation {
  return (
    outcome.type === 'SimpleAllocation' && outcome.assetHolderAddress === ETH_ASSET_HOLDER_ADDRESS
  );
}

export const simpleEthAllocation = (allocationItems: AllocationItem[]): SimpleAllocation => ({
  type: 'SimpleAllocation',
  assetHolderAddress: ETH_ASSET_HOLDER_ADDRESS,
  allocationItems
});

export const simpleEthGuarantee = (
  targetChannelId: string,
  ...destinations: string[]
): SimpleGuarantee => ({
  type: 'SimpleGuarantee',
  destinations,
  targetChannelId,
  assetHolderAddress: ETH_ASSET_HOLDER_ADDRESS
});

export const simpleTokenAllocation = (
  assetHolderAddress,
  allocationItems: AllocationItem[]
): SimpleAllocation => ({
  type: 'SimpleAllocation',
  assetHolderAddress,
  allocationItems
});

export enum Errors {
  DestinationMissing = 'Destination missing from ledger channel',
  InsufficientFunds = 'Insufficient funds in ledger channel',
  InvalidOutcomeType = 'Invalid outcome type'
}

export function allocateToTarget(
  currentOutcome: Outcome,
  deductions: readonly AllocationItem[],
  targetChannelId: string
): Allocation {
  if (currentOutcome.type !== 'SimpleAllocation') {
    throw new Error(Errors.InvalidOutcomeType);
  }

  currentOutcome = _.cloneDeep(currentOutcome);

  let total = bigNumberify(0);
  let currentItems = currentOutcome.allocationItems;

  deductions.forEach(targetItem => {
    const ledgerItem = currentItems.find(i => i.destination === targetItem.destination);
    if (!ledgerItem) throw new Error(Errors.DestinationMissing);

    total = total.add(targetItem.amount);
    ledgerItem.amount = ledgerItem.amount.sub(targetItem.amount);

    if (ledgerItem.amount.lt(0)) throw new Error(Errors.InsufficientFunds);
  });

  currentItems.push({destination: targetChannelId, amount: total});
  currentItems = currentItems.filter(i => i.amount.gt(0));

  currentOutcome.allocationItems = currentItems;
  return currentOutcome;
}