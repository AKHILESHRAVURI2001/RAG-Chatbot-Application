import type { Request, Response, NextFunction } from 'express';
import { settingsRepo } from '../../db/queries/settings.queries';
import { sanitizeSvg, InvalidSvgError } from '../../utils/svgSanitizer';

// Uploading and removing the widget's custom icon.

export async function handleUploadWidgetIcon(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const mime = req.file.mimetype;
    let iconSvg: string | null = null;
    let icon: string | null = null;

    if (mime === 'image/svg+xml' || req.file.originalname.endsWith('.svg')) {
      const raw = req.file.buffer.toString('utf8');
      iconSvg = sanitizeSvg(raw);
    } else if (['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mime)) {
      icon = `data:${mime};base64,${req.file.buffer.toString('base64')}`;
    } else {
      return res.status(400).json({ error: 'Unsupported file type. Upload SVG, PNG, JPG, or WebP.' });
    }

    const current = await settingsRepo.getWidget();
    const updated = { ...current, icon: icon || current.icon, iconSvg: iconSvg || current.iconSvg };
    await settingsRepo.setWidget(updated);
    res.json(updated);
  } catch (err) {
    if (err instanceof InvalidSvgError) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
}

export async function handleDeleteWidgetIcon(_req: Request, res: Response, next: NextFunction) {
  try {
    const current = await settingsRepo.getWidget();
    const updated = { ...current, icon: '💬', iconSvg: '' };
    await settingsRepo.setWidget(updated);
    res.json(updated);
  } catch (err) {
    next(err);
  }
}
