// PIC-24: selective re-export. ALLOWED_TRANSITIONS and ACTION_TO_STATUS are
// exported from service.ts so the layer1-ui-logic test can import them as the
// canonical state-machine source — but they collide with same-named symbols
// in procurement/quotation, procurement/rfq, and procurement/framework-agreement.
// Test consumers use the deep `'@fmksa/core/layer1/prime-contracts/service'`
// import path (registered in package.json `exports`), bypassing this barrel.
// Mirrors the procurement/quotation/index.ts pattern (selective re-export of
// public service functions only).
export {
  createPrimeContract,
  getPrimeContract,
  updatePrimeContract,
  transitionPrimeContractStatus,
  deletePrimeContract,
} from './service';
