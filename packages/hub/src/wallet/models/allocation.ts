import {Address, Uint256, Uint32} from 'fmg-core';
import {Model, snakeCaseMappers} from 'objection';
import LedgerCommitment from './channelState';

export default class Allocation extends Model {
  static tableName = 'allocations';

  static get columnNameMappers() {
    return snakeCaseMappers();
  }

  static relationMappings = {
    state: {
      relation: Model.BelongsToOneRelation,
      modelClass: LedgerCommitment,
      join: {
        from: 'allocations.channel_state_id',
        to: 'channel_states.id'
      }
    }
  };
  readonly id!: number;
  state: LedgerCommitment;
  destination: Address;
  amount: Uint256;
  priority: Uint32;
  assetHolderAddress: Address;
}
