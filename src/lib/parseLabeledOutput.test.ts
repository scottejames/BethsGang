import { describe, expect, it } from 'vitest';
import { getBulletList, makeLabelGetter } from './parseLabeledOutput';

const TONE_CHECK = `Tone: Friendly
Likely to land as: Warm but a little rushed
Suggestion: Add a thank you`;

describe('makeLabelGetter', () => {
  it('reads each labeled value from a well-formed answer', () => {
    const get = makeLabelGetter(TONE_CHECK);

    expect(get('Tone:')).toBe('Friendly');
    expect(get('Likely to land as:')).toBe('Warm but a little rushed');
    expect(get('Suggestion:')).toBe('Add a thank you');
  });

  it('ignores the case of the label', () => {
    expect(makeLabelGetter('TONE: Friendly')('Tone:')).toBe('Friendly');
  });

  it('copes with surrounding whitespace and blank lines', () => {
    const get = makeLabelGetter('\n   Tone:    Friendly   \n\nSuggestion: Add a thank you\n');

    expect(get('Tone:')).toBe('Friendly');
    expect(get('Suggestion:')).toBe('Add a thank you');
  });

  it('keeps colons inside the value', () => {
    expect(makeLabelGetter('Suggestion: Try this: say thanks')('Suggestion:')).toBe(
      'Try this: say thanks',
    );
  });

  it('returns undefined for a missing label', () => {
    expect(makeLabelGetter(TONE_CHECK)('Opening:')).toBeUndefined();
  });

  it('returns an empty string for a label with no value', () => {
    expect(makeLabelGetter('Tone:')('Tone:')).toBe('');
  });

  it('uses the first line when a label appears twice', () => {
    expect(makeLabelGetter('Tone: First\nTone: Second')('Tone:')).toBe('First');
  });

  it('finds nothing in an unlabeled answer, so the tool falls back to raw text', () => {
    expect(makeLabelGetter('Just a plain paragraph.')('Tone:')).toBeUndefined();
  });

  // The parser has no markdown handling: this is why the Lambda's format guard matters.
  // If this ever changes, the design note on the format-guard incident needs updating.
  it('does not recognise a markdown-wrapped label', () => {
    expect(makeLabelGetter('**Tone:** Friendly')('Tone:')).toBeUndefined();
  });
});

describe('getBulletList', () => {
  const IS_THIS_MAD = `Tone: Neutral
Most likely meaning: They want the report
Reassurance: Short doesn't mean cold
Asks:
- Send the report
- Confirm the date`;

  it('reads the bullets after the label, without their markers', () => {
    expect(getBulletList(IS_THIS_MAD, 'Asks:')).toEqual(['Send the report', 'Confirm the date']);
  });

  it('ignores bullets that come before the label', () => {
    expect(getBulletList('- Too early\nAsks:\n- Send it', 'Asks:')).toEqual(['Send it']);
  });

  it('accepts a bullet with no space after the dash', () => {
    expect(getBulletList('Asks:\n-Send it', 'Asks:')).toEqual(['Send it']);
  });

  it('ignores the case of the label', () => {
    expect(getBulletList('ASKS:\n- Send it', 'Asks:')).toEqual(['Send it']);
  });

  it('returns an empty list for a missing label', () => {
    expect(getBulletList('Tone: Neutral', 'Asks:')).toEqual([]);
  });

  it('returns an empty list for a label with no bullets', () => {
    expect(getBulletList('Asks:\nNothing to do', 'Asks:')).toEqual([]);
  });
});
