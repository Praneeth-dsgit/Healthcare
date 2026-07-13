/**
 * Pre-seeds demo localStorage on first app load for reliable client demos.
 */
import { getDemoState, updateDemoState } from './demoStorage';
import { FIXTURE_VISITS } from './fixtures/telemedicine';
import { FIXTURE_REFERRALS } from './fixtures/referrals';

export function seedDemoDataIfNeeded(): void {
  const state = getDemoState();
  if (state.seeded) return;

  updateDemoState({
    visits: FIXTURE_VISITS,
    referrals: FIXTURE_REFERRALS,
    seeded: true,
  });
}
