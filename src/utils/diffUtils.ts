export interface DiffSegment {
  type: 'equal' | 'added' | 'removed';
  text: string;
}

/**
 * Simple word-level diff using longest common subsequence.
 */
export function wordDiff(a: string, b: string): DiffSegment[] {
  const wordsA = a.split(/(\s+)/);
  const wordsB = b.split(/(\s+)/);

  const lcs = computeLCS(wordsA, wordsB);
  const result: DiffSegment[] = [];

  let iA = 0;
  let iB = 0;

  for (const word of lcs) {
    // Emit removals from A until we reach the LCS word
    while (iA < wordsA.length && wordsA[iA] !== word) {
      pushSegment(result, 'removed', wordsA[iA]);
      iA++;
    }
    // Emit additions from B until we reach the LCS word
    while (iB < wordsB.length && wordsB[iB] !== word) {
      pushSegment(result, 'added', wordsB[iB]);
      iB++;
    }
    pushSegment(result, 'equal', word);
    iA++;
    iB++;
  }

  // Remaining words
  while (iA < wordsA.length) {
    pushSegment(result, 'removed', wordsA[iA]);
    iA++;
  }
  while (iB < wordsB.length) {
    pushSegment(result, 'added', wordsB[iB]);
    iB++;
  }

  return mergeSegments(result);
}

function pushSegment(
  result: DiffSegment[],
  type: DiffSegment['type'],
  text: string
) {
  if (result.length > 0 && result[result.length - 1].type === type) {
    result[result.length - 1].text += text;
  } else {
    result.push({ type, text });
  }
}

function mergeSegments(segments: DiffSegment[]): DiffSegment[] {
  const merged: DiffSegment[] = [];
  for (const seg of segments) {
    if (merged.length > 0 && merged[merged.length - 1].type === seg.type) {
      merged[merged.length - 1].text += seg.text;
    } else {
      merged.push({ ...seg });
    }
  }
  return merged;
}

function computeLCS(a: string[], b: string[]): string[] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: string[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return result;
}
