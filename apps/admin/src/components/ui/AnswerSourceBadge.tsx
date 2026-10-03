import { SOURCE_LABEL } from '../../lib/sourceGradient';

/**
 * The small "FAQ match / Cached / AI (live) / No match" pill shown under an
 * assistant reply — same wording and styling in Chat Logs and the Firebase
 * mirror's own reports. Takes a bare string (not the stricter AnswerSource
 * union) because the Firebase mirror's data comes back from Firestore
 * untyped — an unrecognized value there falls back to showing itself as-is
 * rather than disappearing.
 */
export default function AnswerSourceBadge({ source }: { source: string | null | undefined }) {
  if (!source) return null;
  return <span className="badge chat-test-source">{(SOURCE_LABEL as Record<string, string>)[source] ?? source}</span>;
}
