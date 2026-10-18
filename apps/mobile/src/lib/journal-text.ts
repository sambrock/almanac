import type * as Y from "yjs";

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;

// A text input reports its whole new value, not the edit. Find the part that
// changed between the unchanged start and end, and replace only that, so
// concurrent edits elsewhere in the entry survive the merge.
export function applyTextChange(text: Y.Text, next: string) {
  const previous = text.toString();

  let start = 0;
  while (start < previous.length && start < next.length && previous[start] === next[start]) {
    start++;
  }
  let end = 0;
  while (
    end < previous.length - start &&
    end < next.length - start &&
    previous[previous.length - 1 - end] === next[next.length - 1 - end]
  ) {
    end++;
  }
  // Don't cut through a surrogate pair, such as an emoji. Yjs would store each
  // half as U+FFFD.
  if (start > 0 && isHighSurrogate(previous.charCodeAt(start - 1))) start--;
  if (end > 0 && isLowSurrogate(previous.charCodeAt(previous.length - end))) end--;

  text.doc!.transact(() => {
    text.delete(start, previous.length - start - end);
    text.insert(start, next.slice(start, next.length - end));
  });
}
