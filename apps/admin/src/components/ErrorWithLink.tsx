/** Firestore's own "this query needs an index" error includes a direct link to auto-create it — render that as a real clickable link instead of dead text. Generic enough for any error string that might carry a URL worth following. */
export default function ErrorWithLink({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/\S+)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('http') ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer">
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
