import {Model} from 'objection';
import {DUMMY_RULES_ADDRESS} from '../../../test/test-constants';
import Rule from '../../models/rule';
import knex from '../connection';
Model.knex(knex);

export function seed() {
  // Deletes ALL existing entries
  return knex('rules')
    .del()
    .then(() => {
      return Rule.query().insert([
        {
          address: DUMMY_RULES_ADDRESS,
          name: "DUMMY GAME -- DON'T PLAY"
        },
        {
          address: '0x311596fD021E5B5fE759EA715AFd53EB0857F436',
          name: 'ConsensusApp'
        }
      ]);
    });
}
