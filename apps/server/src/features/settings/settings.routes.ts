import { Router } from 'express';
import multer from 'multer';
import { registerSecuredRoutes } from '../../utils/registerRoutes';
import { handleGetSettings, handleUpdateLlm, handleUpdatePrompt, handleUpdateWidget, handleUpdateBusinessHours, handleUpdateFirebase, handleUpdateCache, handleUpdateLimits, handleUpdateChunking, handleUpdateVoice } from './settings.handlers';
import { handleUploadWidgetIcon, handleDeleteWidgetIcon } from './widgetIcon.handlers';
import { handleUpdateApiKeys, handleUpdateSpeechApiKeys, handleUpdateEmbeddingApiKeys } from './apiKeys.handlers';
import { handleTestFirebaseConnection, handleTestEmbedding, handleTestLlmKey, handleTestSpeech } from './connectionTests.handlers';
import { handleFlushCache, handleDbStatus, handleDbMigrate } from './maintenance.handlers';

export const adminSettingsRouter = Router();

const iconUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 256 * 1024 } });

registerSecuredRoutes(adminSettingsRouter, [
  { method: 'get', path: '/', permission: 'settings.view', handler: handleGetSettings },
  { method: 'put', path: '/llm', permission: 'settings.edit', audit: 'settings.update-llm', handler: handleUpdateLlm },
  { method: 'put', path: '/prompt', permission: 'settings.edit', audit: 'settings.update-prompt', handler: handleUpdatePrompt },
  { method: 'post', path: '/widget/icon', permission: 'settings.edit', audit: 'settings.widget-icon', middleware: [iconUpload.single('file')], handler: handleUploadWidgetIcon },
  { method: 'delete', path: '/widget/icon', permission: 'settings.edit', audit: 'settings.widget-icon', handler: handleDeleteWidgetIcon },
  { method: 'put', path: '/widget', permission: 'settings.edit', audit: 'settings.update-widget', handler: handleUpdateWidget },
  { method: 'put', path: '/business-hours', permission: 'settings.edit', audit: 'settings.update-business-hours', handler: handleUpdateBusinessHours },
  { method: 'put', path: '/firebase', permission: 'settings.edit', audit: 'settings.update-firebase', handler: handleUpdateFirebase },
  { method: 'post', path: '/firebase/test-connection', permission: 'settings.edit', handler: handleTestFirebaseConnection },
  { method: 'put', path: '/cache', permission: 'settings.edit', audit: 'settings.update-cache', handler: handleUpdateCache },
  { method: 'post', path: '/cache/flush', permission: 'settings.edit', audit: 'settings.flush-cache', handler: handleFlushCache },
  { method: 'put', path: '/limits', permission: 'settings.edit', audit: 'settings.update-limits', handler: handleUpdateLimits },
  { method: 'put', path: '/chunking', permission: 'settings.edit', audit: 'settings.update-chunking', handler: handleUpdateChunking },
  { method: 'post', path: '/embeddings/test', permission: 'settings.edit', handler: handleTestEmbedding },
  { method: 'put', path: '/api-keys', permission: 'settings.edit', audit: 'settings.update-api-keys', handler: handleUpdateApiKeys },
  { method: 'post', path: '/test-llm-key', permission: 'settings.edit', handler: handleTestLlmKey },
  { method: 'put', path: '/voice', permission: 'settings.edit', audit: 'settings.update-voice', handler: handleUpdateVoice },
  { method: 'put', path: '/speech-api-keys', permission: 'settings.edit', audit: 'settings.update-api-keys', handler: handleUpdateSpeechApiKeys },
  { method: 'put', path: '/embedding-api-keys', permission: 'settings.edit', audit: 'settings.update-api-keys', handler: handleUpdateEmbeddingApiKeys },
  { method: 'post', path: '/voice/test-speech', permission: 'settings.edit', handler: handleTestSpeech },
  { method: 'get', path: '/db/status', permission: 'settings.view', handler: handleDbStatus },
  { method: 'post', path: '/db/migrate', permission: 'settings.edit', audit: 'settings.db-migrate', handler: handleDbMigrate },
]);
