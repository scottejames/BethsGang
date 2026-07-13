import { describe, expect, it } from 'vitest';
import { parseNumberedList } from './parseNumberedList';

describe('parseNumberedList', () => {
  it('splits a simple numbered list into items', () => {
    expect(parseNumberedList('1. First step\n2. Second step\n3. Third step')).toEqual([
      'First step',
      'Second step',
      'Third step',
    ]);
  });

  it('supports "N)" as well as "N."', () => {
    expect(parseNumberedList('1) First step\n2) Second step')).toEqual(['First step', 'Second step']);
  });

  it('keeps a multi-line item together instead of splitting it on the line break', () => {
    // Regression case: a line-by-line split (the old cleanStep/taskBreakdown-style
    // approach) would treat "with extra detail on a second line" as its own item —
    // this splitter must keep it attached to item 2 since it doesn't start a new
    // numbered line.
    const output = '1. First step\n2. Second step\nwith extra detail on a second line\n3. Third step';
    expect(parseNumberedList(output)).toEqual([
      'First step',
      'Second step\nwith extra detail on a second line',
      'Third step',
    ]);
  });

  it('trims each item and drops any that end up empty', () => {
    expect(parseNumberedList('1.   Padded step  \n2.   \n3. Real step')).toEqual(['Padded step', 'Real step']);
  });

  it('returns the whole trimmed text as one item when nothing is numbered', () => {
    // No numbered-line lookahead to split on, so the input is one unsplit chunk — the
    // same behavior the original per-tool parsers had. Callers with their own "nothing
    // found" sentinel (e.g. Brain Dump Sorter's literal "NONE" response) check for that
    // before calling this, rather than relying on an empty array here.
    expect(parseNumberedList('Nothing actionable here.')).toEqual(['Nothing actionable here.']);
  });

  it('returns an empty array for empty input', () => {
    expect(parseNumberedList('')).toEqual([]);
  });
});
