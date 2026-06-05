/**
 * Commercial router barrel — merges all commercial sub-routers.
 *
 * Task 18: Commercial tRPC Router — Module 2 Commercial Engine.
 */
import { router } from '../../trpc';
import { ipaRouter } from './ipa';
import { forecastRouter } from './forecast';
import { ipcRouter } from './ipc';
import { variationRouter } from './variation';
import { costProposalRouter } from './cost-proposal';
import { taxInvoiceRouter } from './tax-invoice';
import { correspondenceRouter } from './correspondence';
import { commercialDashboardRouter } from './dashboard';
import { invoiceCollectionRouter } from './invoice-collection';
import { engineerInstructionRouter } from './engineer-instruction';

export const commercialRouter = router({
  ipa: ipaRouter,
  forecast: forecastRouter,
  ipc: ipcRouter,
  variation: variationRouter,
  costProposal: costProposalRouter,
  taxInvoice: taxInvoiceRouter,
  correspondence: correspondenceRouter,
  dashboard: commercialDashboardRouter,
  invoiceCollection: invoiceCollectionRouter,
  engineerInstruction: engineerInstructionRouter,
});
