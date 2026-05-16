/**
 * Joined output types for Layer 1 entities — PIC-22.
 *
 * The Layer 1 service layer returns records with related entities joined via
 * Prisma `include`. These types describe the joined shape so UI components
 * can avoid inline casts like `as { entity?: { name: string; code: string } }`.
 *
 * Kept structural (no `@prisma/client` import) to preserve the contracts
 * package's zod-only dependency boundary. The Prisma-enum mirrors elsewhere
 * in this directory follow the same convention. If any field set drifts from
 * the actual service return shape, typecheck on the consumer (UI) catches it.
 *
 * Date fields typed as `Date | string` because Next.js serialization through
 * tRPC + superjson can produce either, depending on the call path.
 */

// ---------------------------------------------------------------------------
// Shared minimal references
// ---------------------------------------------------------------------------

/** Minimal entity reference — the subset exposed to UI joins. */
export type EntityRef = {
  id: string;
  code: string;
  name: string;
};

/** Minimal project reference — the subset exposed to UI joins. */
export type ProjectRef = {
  id: string;
  code: string;
  name: string;
};

// ---------------------------------------------------------------------------
// ProjectParticipant
// ---------------------------------------------------------------------------

export type ProjectParticipantRole =
  | 'prime_contractor'
  | 'sub_contractor'
  | 'factory'
  | 'design'
  | 'management'
  | 'other';

/** ProjectParticipant joined with its Entity (service uses `include: { entity: true }`). */
export type ProjectParticipantWithEntity = {
  id: string;
  projectId: string;
  entityId: string;
  role: ProjectParticipantRole;
  isPrime: boolean;
  notes: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  createdBy: string;
  entity: EntityRef;
};

// ---------------------------------------------------------------------------
// PrimeContract
// ---------------------------------------------------------------------------

export type PrimeContractStatus =
  | 'draft'
  | 'signed'
  | 'active'
  | 'completed'
  | 'terminated'
  | 'cancelled';

/**
 * PrimeContract joined with project + contractingEntity (+ optional currency).
 * Service `getPrimeContract` uses `include: { contractingEntity: true, currency: true }`.
 * `project` is included optionally for surfaces that need project metadata.
 *
 * `contractValue` typed as `unknown` because Prisma `Decimal` serializes
 * differently across paths (string from JSON, Decimal in service); UI calls
 * `formatMoney` which accepts unknown.
 */
export type PrimeContractWithProject = {
  id: string;
  projectId: string;
  contractingEntityId: string;
  clientName: string;
  clientReference: string | null;
  contractValue: unknown;
  contractCurrency: string;
  signedDate: Date | string | null;
  effectiveDate: Date | string | null;
  expectedCompletionDate: Date | string | null;
  status: PrimeContractStatus;
  notes: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  createdBy: string;
  contractingEntity?: EntityRef | null;
  currency?: { code: string; name: string; symbol: string } | null;
  project?: ProjectRef | null;
};

// ---------------------------------------------------------------------------
// IntercompanyContract
// ---------------------------------------------------------------------------

export type IntercompanyPricingType =
  | 'cost_plus_markup'
  | 'management_fee'
  | 'fixed_fee';

export type IntercompanyManagingDepartment =
  | 'me_contract'
  | 'asia_pac_contract';

export type IntercompanyContractStatus =
  | 'draft'
  | 'signed'
  | 'active'
  | 'closed'
  | 'cancelled';

/** IntercompanyContract joined with both parties (fromEntity + toEntity). */
export type IntercompanyContractWithParties = {
  id: string;
  projectId: string;
  fromEntityId: string;
  toEntityId: string;
  scope: string;
  pricingType: IntercompanyPricingType;
  markupPercent: unknown;
  contractValue: unknown | null;
  contractCurrency: string;
  managingDepartment: IntercompanyManagingDepartment;
  signedDate: Date | string | null;
  status: IntercompanyContractStatus;
  notes: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  createdBy: string;
  fromEntity: EntityRef;
  toEntity: EntityRef;
};

// ---------------------------------------------------------------------------
// EntityLegalDetails
// ---------------------------------------------------------------------------

/** EntityLegalDetails joined with its Entity. */
export type EntityLegalDetailsWithEntity = {
  id: string;
  entityId: string;
  taxId: string | null;
  registrationNumber: string | null;
  jurisdiction: string | null;
  registeredAddress: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankIban: string | null;
  bankSwift: string | null;
  notes: string | null;
  updatedAt: Date | string;
  updatedBy: string;
  entity: EntityRef;
};
