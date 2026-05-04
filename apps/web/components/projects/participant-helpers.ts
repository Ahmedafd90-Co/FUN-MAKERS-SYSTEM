/**
 * Pure helpers extracted from the participants pages so they can be unit-tested
 * without rendering React. Co-located with prime-contract-helpers.ts under
 * /components/projects/ rather than under the (app) route segment to keep
 * non-route files outside the routing tree.
 *
 * The role enum is mirrored from packages/contracts/src/layer1/project-participant.ts
 * `projectParticipantRoleEnum`. The layer1-ui-logic test asserts every enum
 * value has a label.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ParticipantRole =
  | 'prime_contractor'
  | 'sub_contractor'
  | 'factory'
  | 'design'
  | 'management'
  | 'other';

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

export const ROLE_LABELS: Record<ParticipantRole, string> = {
  prime_contractor: 'Prime Contractor',
  sub_contractor: 'Subcontractor',
  factory: 'Factory',
  design: 'Design',
  management: 'Management',
  other: 'Other',
};

/** Select options derived from ROLE_LABELS — preserves enum order. */
export const ROLES: ReadonlyArray<{ value: ParticipantRole; label: string }> = (
  Object.entries(ROLE_LABELS) as Array<[ParticipantRole, string]>
).map(([value, label]) => ({ value, label }));
