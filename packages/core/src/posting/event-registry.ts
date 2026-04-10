import { z } from 'zod';

// ---------------------------------------------------------------------------
// Event-type Registry
//
// Maps event type strings to their Zod payload schemas. Module 1 ships with
// ONE test event type (TEST_EVENT_M1). Modules 2-4 register real types at
// boot time via registerEventType().
// ---------------------------------------------------------------------------

const EVENT_REGISTRY = new Map<string, z.ZodSchema>();

// Test event for Module 1 -- proves the posting pipeline works end-to-end
EVENT_REGISTRY.set(
  'TEST_EVENT_M1',
  z.object({
    amount: z.number(),
    currency: z.string(),
    description: z.string(),
  }),
);

/**
 * Register a new event type with its Zod validation schema.
 * Throws if the event type is already registered (prevents accidental
 * double-registration during module boot).
 */
export function registerEventType(
  eventType: string,
  schema: z.ZodSchema,
): void {
  if (EVENT_REGISTRY.has(eventType)) {
    throw new Error(`Event type '${eventType}' is already registered.`);
  }
  EVENT_REGISTRY.set(eventType, schema);
}

/**
 * Retrieve the Zod schema for a registered event type.
 * Throws UnknownEventTypeError if not found.
 */
export function getEventSchema(eventType: string): z.ZodSchema {
  const schema = EVENT_REGISTRY.get(eventType);
  if (!schema) {
    throw new UnknownEventTypeError(eventType);
  }
  return schema;
}

/**
 * Validate a payload against its event type's schema.
 * Returns the parsed (coerced) payload on success, throws ZodError on failure.
 */
export function validatePayload(
  eventType: string,
  payload: unknown,
): unknown {
  const schema = getEventSchema(eventType);
  return schema.parse(payload); // throws ZodError if invalid
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class UnknownEventTypeError extends Error {
  constructor(public eventType: string) {
    super(`Unknown posting event type: '${eventType}'`);
    this.name = 'UnknownEventTypeError';
  }
}
