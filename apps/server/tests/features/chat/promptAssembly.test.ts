import { describe, it, expect } from 'vitest';
import {
  shouldSuggestArticles,
  detectTriggerCategories,
  withRelatedArticles,
  stripRelatedArticles,
  buildRelatedArticles,
} from '../../../src/features/chat/promptAssembly';

describe('promptAssembly & shouldSuggestArticles', () => {
  it('detects individual category flags accurately', () => {
    const videoCheck = detectTriggerCategories('Here is a youtube video stream.');
    expect(videoCheck.isVideo).toBe(true);
    expect(videoCheck.isRefusal).toBe(false);

    const docCheck = detectTriggerCategories('Please download the presentation slides and pdf datasheet.');
    expect(docCheck.isDocument).toBe(true);

    const refusalCheck = detectTriggerCategories('I cannot find any records outside my knowledge.');
    expect(refusalCheck.isRefusal).toBe(true);

    const supportCheck = detectTriggerCategories('You can contact support or reach out to customer service.');
    expect(supportCheck.isSupport).toBe(true);
  });
  it('returns false when usedChunksCount is 0 (no relevant context = no relevant articles)', () => {
    expect(shouldSuggestArticles('Here is some response.', 0)).toBe(false);
  });

  it('does NOT suggest articles on refusal/inability phrases — a no-match response should never show unrelated articles', () => {
    expect(shouldSuggestArticles("I do not have access to that information.", 2)).toBe(false);
    expect(shouldSuggestArticles("I don't have that detail.", 2)).toBe(false);
    expect(shouldSuggestArticles("I cannot display or show that.", 1)).toBe(false);
    // Note: "I can't provide this document right now." triggers isDocument (contains "document") so articles ARE suggested
    expect(shouldSuggestArticles("Sorry, I cannot find any records for that.", 1)).toBe(false);
  });


  it('detects media keywords including video, images, recordings, etc.', () => {
    expect(shouldSuggestArticles("You can watch the video tutorial on our portal.", 2)).toBe(true);
    expect(shouldSuggestArticles("Here is the photo gallery and image collection.", 2)).toBe(true);
    expect(shouldSuggestArticles("Listen to the audio recording attached.", 1)).toBe(true);
    expect(shouldSuggestArticles("Please check the youtube clip and pdf document.", 1)).toBe(true);
    expect(shouldSuggestArticles("Download the brochure or presentation slides here.", 1)).toBe(true);
    expect(shouldSuggestArticles("Check this chart or diagram.", 1)).toBe(true);
  });

  it('does not falsely trigger on partial word matches like profile for file', () => {
    expect(
      shouldSuggestArticles('Please visit your user profile to change settings.', 2),
    ).toBe(false);
  });

  it('returns false when chunks were used and no refusal/media keywords are present', () => {
    expect(
      shouldSuggestArticles('To reset your password, visit the settings tab and click security.', 3),
    ).toBe(false);
  });

  it('formats withRelatedArticles properly for suggested vs related', () => {
    const articles = [{ title: 'Getting Started', url: 'https://example.com/docs' }];
    const related = withRelatedArticles('Answer text', articles, false);
    expect(related).toContain('\n\nRelated articles:\n- [Getting Started](https://example.com/docs)');

    const suggested = withRelatedArticles('Answer text', articles, true);
    expect(suggested).toContain('\n\nSuggested articles:\n- [Getting Started](https://example.com/docs)');
  });

  it('uses fallback chunks when usedChunks is empty', () => {
    const fallback = [{ sourceType: 'url', sourceRef: 'https://example.com/faq', title: 'FAQ Guide' }];
    const result = buildRelatedArticles([], fallback);
    expect(result).toEqual([{ title: 'FAQ Guide', url: 'https://example.com/faq' }]);
  });

  it('prioritizes video links when video intent is detected', () => {
    const chunks = [
      { sourceType: 'url', sourceRef: 'https://example.com/article', title: 'General Text Article' },
      { sourceType: 'url', sourceRef: 'https://youtube.com/watch?v=123', title: 'Video Walkthrough' },
    ];
    const result = buildRelatedArticles(chunks, [], { isVideo: true });
    expect(result[0].url).toBe('https://youtube.com/watch?v=123');
  });

  it('humanizes URL titles when title is missing or identical to URL', () => {
    const chunks = [{ sourceType: 'url', sourceRef: 'https://example.com/getting-started-guide.html', title: null }];
    const result = buildRelatedArticles(chunks);
    expect(result[0].title).toBe('Getting Started Guide');
  });

  it('deduplicates links already present in the AI answer', () => {
    const articles = [{ title: 'Docs', url: 'https://example.com/docs' }];
    const answer = 'Please visit https://example.com/docs for instructions.';
    const result = withRelatedArticles(answer, articles, false);
    expect(result).toBe(answer);
  });
});
