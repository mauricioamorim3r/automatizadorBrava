import express from 'express';
import {
  createAutomation,
  getAutomations,
  getAutomation,
  updateAutomation,
  deleteAutomation,
  duplicateAutomation,
  executeAutomation,
  validateAutomation,
  getExecutionHistory
} from '../controllers/automationController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// All automation routes require authentication
router.use(verifyToken);

// Automation CRUD
router.post('/', createAutomation);
router.get('/', getAutomations);
router.get('/:id', getAutomation);
router.put('/:id', updateAutomation);
router.delete('/:id', deleteAutomation);

// Automation actions
router.post('/:id/duplicate', duplicateAutomation);
router.post('/:id/execute', executeAutomation);
router.get('/:id/validate', validateAutomation);
router.get('/:id/executions', getExecutionHistory);

export default router;