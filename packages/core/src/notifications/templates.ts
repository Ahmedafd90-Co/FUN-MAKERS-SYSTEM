/**
 * Notification template rendering — Task 1.8.1
 *
 * Fetches templates from the DB and renders them with Handlebars.
 * Registers a {{date}} helper for ISO date formatting.
 */

import Handlebars from 'handlebars';
import { prisma } from '@fmksa/db';

// ---------------------------------------------------------------------------
// Custom errors
// ---------------------------------------------------------------------------

export class NotificationTemplateNotFoundError extends Error {
  constructor(code: string) {
    super(`Notification template "${code}" not found.`);
    this.name = 'NotificationTemplateNotFoundError';
  }
}

export class TemplateRenderError extends Error {
  constructor(code: string, cause: unknown) {
    const message =
      cause instanceof Error ? cause.message : String(cause);
    super(`Failed to render notification template "${code}": ${message}`);
    this.name = 'TemplateRenderError';
    if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}

// ---------------------------------------------------------------------------
// Handlebars helpers
// ---------------------------------------------------------------------------

// {{date isoString}} — pretty-prints an ISO date string.
// Accepts a second optional format argument; defaults to a human-readable string.
Handlebars.registerHelper('date', (isoString: unknown): string => {
  if (!isoString) return '';
  try {
    const d = new Date(String(isoString));
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return String(isoString);
  }
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type RenderedTemplate = {
  subject: string;
  body: string;
};

/**
 * A fetched template record with the fields needed for rendering.
 */
export type TemplateDef = {
  code: string;
  subjectTemplate: string;
  bodyTemplate: string;
};

/**
 * Fetch a template definition by code. Returns null if not found.
 */
export async function fetchTemplate(
  templateCode: string,
): Promise<TemplateDef | null> {
  const t = await prisma.notificationTemplate.findUnique({
    where: { code: templateCode },
    select: { code: true, subjectTemplate: true, bodyTemplate: true },
  });
  return t;
}

/**
 * Render a pre-fetched template with the given payload.
 *
 * @throws {TemplateRenderError} If Handlebars compilation or execution fails.
 */
export function renderWithTemplate(
  template: TemplateDef,
  payload: Record<string, unknown>,
): RenderedTemplate {
  try {
    const compiledSubject = Handlebars.compile(template.subjectTemplate, { strict: true });
    const compiledBody = Handlebars.compile(template.bodyTemplate, { strict: true });

    return {
      subject: compiledSubject(payload),
      body: compiledBody(payload),
    };
  } catch (err) {
    throw new TemplateRenderError(template.code, err);
  }
}

/**
 * Render a notification template by code. Fetches from DB, then renders.
 *
 * @param templateCode - The unique code of the template (e.g. 'workflow_step_assigned').
 * @param payload      - Key/value pairs to interpolate into the template.
 *
 * @throws {NotificationTemplateNotFoundError} If no template with the given code exists.
 * @throws {TemplateRenderError}   If Handlebars compilation or execution fails.
 */
export async function renderTemplate(
  templateCode: string,
  payload: Record<string, unknown>,
): Promise<RenderedTemplate> {
  const template = await fetchTemplate(templateCode);
  if (!template) {
    throw new NotificationTemplateNotFoundError(templateCode);
  }
  return renderWithTemplate(template, payload);
}
