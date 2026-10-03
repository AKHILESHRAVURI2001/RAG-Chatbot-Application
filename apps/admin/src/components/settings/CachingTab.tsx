import { FiDatabase, FiSave, FiTrash2 } from 'react-icons/fi';
import type { CacheSettings } from '../../shared';
import Card from '../ui/Card';

interface CachingTabProps {
  cache: CacheSettings;
  setCache: (c: CacheSettings) => void;
  onSave: () => void;
  onFlush: () => void;
}

export default function CachingTab({ cache, setCache, onSave, onFlush }: CachingTabProps) {
  return (
    <Card icon={<FiDatabase />} title="Caching">
      <p className="muted">Repeated or similar questions are answered instantly from cache instead of calling the AI again. Only applies to a conversation's opening message — follow-ups always go to the AI with full context.</p>
      <label>Cache lifetime (seconds)</label>
      <input type="number" value={cache.ttlSeconds} onChange={(e) => setCache({ ...cache, ttlSeconds: Number(e.target.value) })} />
      <label>Semantic cache similarity threshold ({cache.semanticThreshold})</label>
      <input type="range" min={0.7} max={0.99} step={0.01} value={cache.semanticThreshold} onChange={(e) => setCache({ ...cache, semanticThreshold: Number(e.target.value) })} />
      <label>FAQ match threshold ({cache.faqThreshold})</label>
      <input type="range" min={0.6} max={0.99} step={0.01} value={cache.faqThreshold} onChange={(e) => setCache({ ...cache, faqThreshold: Number(e.target.value) })} />
      <label>Context relevance threshold ({cache.contextThreshold})</label>
      <input
        type="range"
        min={0}
        max={0.8}
        step={0.01}
        value={cache.contextThreshold}
        onChange={(e) => setCache({ ...cache, contextThreshold: Number(e.target.value) })}
      />
      <p className="muted small">
        How closely a piece of your content must match a question before the AI is allowed to use it as context. Lower
        this if the bot too often says it doesn't have information that your content actually covers — a question
        worded differently than your source text can score lower than you'd expect. Raise it if the bot is using
        weakly-related content it shouldn't. Default 0.3.
      </p>
      <div className="row-gap">
        <button className="btn-primary" onClick={onSave}><FiSave /> Save</button>
        <button className="btn-secondary" onClick={onFlush}><FiTrash2 /> Flush cache now</button>
      </div>
    </Card>
  );
}
