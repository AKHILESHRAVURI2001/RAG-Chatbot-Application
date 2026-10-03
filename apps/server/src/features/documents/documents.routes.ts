import { Router } from 'express';
import multer from 'multer';
import { registerSecuredRoutes } from '../../utils/registerRoutes';
import {
  handleListDocuments,
  handleListTags,
  handleIngestUrl,
  handleExpandSitemap,
  handleIngestText,
  handleIngestFile,
  handleSetTags,
  handleSetPaused,
  handleRecheckDocument,
  handleListChunks,
  handleExportChunks,
  handleDeleteDocument,
} from './documents.handlers';

export const adminDocumentsRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

registerSecuredRoutes(adminDocumentsRouter, [
  { method: 'get', path: '/', permission: 'documents.view', handler: handleListDocuments },
  // Registered before /:id routes so "tags" is never mistaken for a document id.
  { method: 'get', path: '/tags', permission: 'documents.view', handler: handleListTags },
  { method: 'post', path: '/url', permission: 'documents.create', audit: 'documents.ingest-url', handler: handleIngestUrl },
  // Expands a sitemap.xml (or a one-level sitemap index) into its list of page URLs, so the admin UI can crawl them one by one like a pasted URL list.
  { method: 'post', path: '/sitemap', permission: 'documents.create', handler: handleExpandSitemap },
  { method: 'post', path: '/text', permission: 'documents.create', audit: 'documents.ingest-text', handler: handleIngestText },
  // File uploads are multipart/form-data — tags arrive as a comma-separated text field, not JSON.
  { method: 'post', path: '/file', permission: 'documents.create', audit: 'documents.ingest-file', middleware: [upload.single('file')], handler: handleIngestFile },
  { method: 'put', path: '/:id/tags', permission: 'documents.edit', audit: 'documents.set-tags', handler: handleSetTags },
  // Pausing excludes a document from vector search (it stays indexed, just skipped) without deleting its chunks; unpausing restores it.
  { method: 'put', path: '/:id/pause', permission: 'documents.edit', audit: 'documents.pause', handler: handleSetPaused },
  // Re-crawls a URL document in place, picking up any content changes since it was first added.
  { method: 'post', path: '/:id/recheck', permission: 'documents.edit', audit: 'documents.recheck', handler: handleRecheckDocument },
  // Inspector: every chunk indexed for this document, including its raw embedding vector.
  { method: 'get', path: '/:id/chunks', permission: 'documents.view', handler: handleListChunks },
  // Downloads this document's chunks + embedding vectors as a real .json file (Content-Disposition: attachment).
  { method: 'get', path: '/:id/export', permission: 'documents.export', audit: 'documents.export', handler: handleExportChunks },
  { method: 'delete', path: '/:id', permission: 'documents.delete', audit: 'documents.delete', handler: handleDeleteDocument },
]);
