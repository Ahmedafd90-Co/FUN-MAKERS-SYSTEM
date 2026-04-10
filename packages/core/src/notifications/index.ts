/**
 * Notifications module — barrel export.
 *
 * Phase 1.8: notification service core.
 */

export {
  renderTemplate,
  fetchTemplate,
  renderWithTemplate,
  NotificationTemplateNotFoundError,
  TemplateRenderError,
  type RenderedTemplate,
  type TemplateDef,
} from './templates';

export {
  notify,
  markAsRead,
  listForUser,
  getUnreadCount,
  NotificationNotFoundError,
  NotificationOwnershipError,
  NOTIFICATIONS_EMAIL_QUEUE,
  type NotifyInput,
  type NotificationChannel,
  type ListNotificationsOptions,
} from './service';

export {
  getPreferences,
  setPreference,
  isPreferenceEnabled,
  type PreferenceEntry,
  type PreferenceKey,
} from './preferences';

export {
  sendEmail,
  verifySmtpConnection,
  resetTransporter,
  type EmailPayload,
} from './delivery';

export {
  registerWorkflowNotificationHandlers,
  notifyPostingException,
} from './event-handlers';
