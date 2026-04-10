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
 * Render a notification template by code.
 *
 * @param templateCode - The unique code of the template (e.g. 'workflow_step_assigned').
 * @param payload      - Key/value pairs to interpolate into the template.
 *
 * @throws {TemplateNotFoundError} If no template with the given code exists.
 * @throws {TemplateRenderError}   If Handlebars compilation or execution fails.
 */
export async function renderTemplate(
  templateCode: string,
  payload: Record<string, unknown>,
): Promise<RenderedTemplate> {
  const template = await prisma.notificationTemplate.findUnique({
    where: { code: templateCode },
  });

  if (!template) {
    throw new NotificationTemplateNotFoundError(templateCode);
  }

  try {
    const compiledSubject = Handlebars.compile(template.subjectTemplate);
    const compiledBody = Handlebars.compile(template.bodyTemplate);

    const subject = compiledSubject(payload);
    const body = compiledBody(payload);

    return { subject, body };
  } catch (err) {
    throw new TemplateRenderError(templateCode, err);
  }
}
