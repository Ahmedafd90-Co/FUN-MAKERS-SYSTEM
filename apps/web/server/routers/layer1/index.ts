/**
 * Layer 1 router barrel — merges all 4 sub-routers into the layer1 namespace.
 *
 * PR-A2 (PIC-13). Mirrors the procurement router barrel pattern with a
 * cross-resource myPermissions query for UI gating (PR-A3 will consume).
 */
import { router, protectedProcedure } from '../../trpc';
import { entityLegalDetailsRouter } from './entity-legal-details';
import { projectParticipantsRouter } from './project-participants';
import { primeContractRouter } from './prime-contract';
import { intercompanyContractRouter } from './intercompany-contract';

/** Layer 1 permission prefixes for UI action filtering. */
const LAYER1_PERM_PREFIXES = [
  'project_participant.',
  'prime_contract.',
  'intercompany_contract.',
  'entity_legal_details.',
];

export const layer1Router = router({
  entityLegalDetails: entityLegalDetailsRouter,
  projectParticipants: projectParticipantsRouter,
  primeContract: primeContractRouter,
  intercompanyContract: intercompanyContractRouter,

  /**
   * Returns ALL Layer 1 permissions the caller holds across the 4 resources.
   * No DB query — permissions are already loaded in context.
   * Used by UI to show only the actions the user can actually perform.
   */
  myPermissions: protectedProcedure.query(({ ctx }) => {
    return ctx.user.permissions.filter((p) =>
      LAYER1_PERM_PREFIXES.some((prefix) => p.startsWith(prefix)),
    );
  }),
});
