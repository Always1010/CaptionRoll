(function exposeCaptionRollEngine(root) {
  "use strict";

  function normalizeText(value) {
    return String(value ?? "")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/\s*\n\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function words(value) {
    return normalizeText(value).split(/\s+/).filter(Boolean);
  }

  function normalizedWord(value) {
    return value.toLocaleLowerCase("en").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  }

  function removeRollingOverlap(previousText, currentText) {
    const previous = words(previousText);
    const current = words(currentText);
    if (!previous.length || !current.length) return normalizeText(currentText);

    const max = Math.min(previous.length, current.length, 16);
    for (let size = max; size >= 2; size -= 1) {
      const left = previous.slice(-size).map(normalizedWord).join(" ");
      const right = current.slice(0, size).map(normalizedWord).join(" ");
      if (left && left === right) return current.slice(size).join(" ");
    }
    return normalizeText(currentText);
  }

  function prepareCues(input) {
    const result = [];
    const sorted = [...(input ?? [])].sort((a, b) => a.startMs - b.startMs);
    for (const raw of sorted) {
      let text = normalizeText(raw.text);
      if (!text) continue;
      const previous = result.at(-1);
      if (previous) {
        if (normalizedWord(previous.text) === normalizedWord(text) && raw.startMs <= previous.endMs + 250) {
          previous.endMs = Math.max(previous.endMs, raw.endMs);
          continue;
        }
        text = removeRollingOverlap(previous.text, text);
      }
      if (!text) continue;
      result.push({
        startMs: Math.max(0, Number(raw.startMs) || 0),
        endMs: Math.max(Number(raw.endMs) || 0, (Number(raw.startMs) || 0) + 80),
        text
      });
    }
    return result;
  }

  function splitExplicitSentenceEnds(text) {
    const normalized = normalizeText(text);
    const segments = [];
    const boundaryPattern = /[.!?]["'’”\])}]*(?=\s+|$)/g;
    let segmentStart = 0;
    let match;

    while ((match = boundaryPattern.exec(normalized))) {
      const segmentEnd = match.index + match[0].length;
      const candidate = normalizeText(normalized.slice(segmentStart, segmentEnd));
      if (!endsSentence(candidate)) continue;
      const followingText = normalizeText(normalized.slice(segmentEnd));
      const endsWithInitial =
        /(?:^|[^\p{L}\p{N}_])(?:\p{Lu}\.)+["'’”\])}]*$/u.test(candidate);
      if (followingText && endsWithInitial) continue;
      segments.push(candidate);
      segmentStart = segmentEnd;
    }

    const remainder = normalizeText(normalized.slice(segmentStart));
    if (remainder) segments.push(remainder);
    return segments;
  }

  function splitTextAtSentenceEnds(text) {
    let coarseSegments = [normalizeText(text)];
    try {
      coarseSegments = [...new Intl.Segmenter("en", { granularity: "sentence" }).segment(text)]
        .map((entry) => normalizeText(entry.segment))
        .filter(Boolean);
    } catch (_) {}
    return coarseSegments.flatMap(splitExplicitSentenceEnds);
  }

  function splitCue(cue) {
    const segments = splitTextAtSentenceEnds(cue.text);

    if (segments.length <= 1) return [cue];
    const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
    const duration = Math.max(80, cue.endMs - cue.startMs);
    let consumed = 0;
    return segments.map((text, index) => {
      const startMs = cue.startMs + (duration * consumed) / totalLength;
      consumed += text.length;
      const endMs =
        index === segments.length - 1 ? cue.endMs : cue.startMs + (duration * consumed) / totalLength;
      return { startMs, endMs, text };
    });
  }

  function endsSentence(text) {
    const trimmed = normalizeText(text);
    if (!/[.!?]["'’”\])}]*$/.test(trimmed)) return false;
    return !/(?:^|[^\p{L}\p{N}_])(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e)\.["'’”\])}]*$/iu.test(
      trimmed
    );
  }

  function joinText(left, right) {
    if (!left) return normalizeText(right);
    if (!right) return normalizeText(left);
    if (/^[,.;:!?%\])}]/.test(right)) return `${left}${right}`;
    return `${left} ${right}`;
  }

  const WEAK_END_WORDS = new Set([
    "a",
    "an",
    "and",
    "as",
    "at",
    "be",
    "because",
    "but",
    "by",
    "for",
    "from",
    "her",
    "his",
    "if",
    "in",
    "its",
    "my",
    "our",
    "of",
    "on",
    "or",
    "so",
    "than",
    "that",
    "the",
    "their",
    "then",
    "this",
    "those",
    "to",
    "your",
    "when",
    "which",
    "while",
    "who",
    "with"
  ]);

  const WEAK_START_WORDS = new Set([
    "and",
    "as",
    "because",
    "but",
    "for",
    "of",
    "or",
    "than",
    "that",
    "then",
    "to",
    "uh",
    "um",
    "which",
    "who"
  ]);

  function edgeWord(text, fromEnd = false) {
    const tokens = words(text).map(normalizedWord).filter(Boolean);
    return fromEnd ? tokens.at(-1) ?? "" : tokens[0] ?? "";
  }

  function isNaturalBoundary(left, right) {
    const last = edgeWord(left, true);
    const first = edgeWord(right);
    return Boolean(last && first && !WEAK_END_WORDS.has(last) && !WEAK_START_WORDS.has(first));
  }

  function startsLikeNewSentence(text) {
    return /^["'’“([{]*[A-Z]/.test(normalizeText(text));
  }

  function endsClause(text) {
    return /[,;:—–]["'’”\])}]*$/.test(normalizeText(text));
  }

  function mergeIntoSentences(rawCues, options = {}) {
    const cues = prepareCues(rawCues);
    const pauseMs = options.pauseMs ?? 1200;
    const softMaxWords = options.maxWords ?? 34;
    const softMaxDurationMs = options.maxDurationMs ?? 15000;
    const hardMaxWords = options.hardMaxWords ?? Math.max(64, softMaxWords + 20);
    const hardMaxDurationMs = options.hardMaxDurationMs ?? Math.max(30000, softMaxDurationMs + 10000);
    const emergencyMaxWords = options.emergencyMaxWords ?? Math.max(96, hardMaxWords + 24);
    const emergencyMaxDurationMs =
      options.emergencyMaxDurationMs ?? Math.max(45000, hardMaxDurationMs + 10000);
    const absoluteMaxWords = options.absoluteMaxWords ?? Math.max(140, emergencyMaxWords + 32);
    const absoluteMaxDurationMs =
      options.absoluteMaxDurationMs ?? Math.max(60000, emergencyMaxDurationMs + 10000);
    const fragments = cues.flatMap(splitCue);
    const remainingWordCounts = new Array(fragments.length + 1).fill(0);
    const nextSentenceEndIndexes = new Array(fragments.length).fill(-1);
    let nextSentenceEndIndex = -1;
    for (let index = fragments.length - 1; index >= 0; index -= 1) {
      if (endsSentence(fragments[index].text)) nextSentenceEndIndex = index;
      nextSentenceEndIndexes[index] = nextSentenceEndIndex;
      remainingWordCounts[index] =
        words(fragments[index].text).length + remainingWordCounts[index + 1];
    }
    const sentences = [];
    let current = null;

    function flush() {
      if (!current?.text) return;
      current.text = normalizeText(current.text);
      sentences.push(current);
      current = null;
    }

    for (let index = 0; index < fragments.length; index += 1) {
      const fragment = fragments[index];
      const next = fragments[index + 1];
      if (!current) {
        current = { startMs: fragment.startMs, endMs: fragment.endMs, text: fragment.text };
      } else {
        current.text = joinText(current.text, fragment.text);
        current.endMs = Math.max(current.endMs, fragment.endMs);
      }

      const wordCount = words(current.text).length;
      const durationMs = current.endMs - current.startMs;
      const longEnoughForPause = wordCount >= 4;
      const pauseDurationMs = next ? next.startMs - fragment.endMs : 0;
      const softLimitReached = wordCount >= softMaxWords || durationMs >= softMaxDurationMs;
      const naturalBoundary = next && isNaturalBoundary(current.text, next.text);
      const upcomingSentenceEndIndex = nextSentenceEndIndexes[index];
      const wordsThroughSentenceEnd =
        upcomingSentenceEndIndex > index
          ? wordCount +
            remainingWordCounts[index + 1] -
            remainingWordCounts[upcomingSentenceEndIndex + 1]
          : Infinity;
      const durationThroughSentenceEnd =
        upcomingSentenceEndIndex > index
          ? Math.max(current.endMs, fragments[upcomingSentenceEndIndex].endMs) - current.startMs
          : Infinity;
      const canReachSentenceEnd =
        wordsThroughSentenceEnd <= absoluteMaxWords &&
        durationThroughSentenceEnd <= absoluteMaxDurationMs;
      const hasLongPause =
        !canReachSentenceEnd &&
        naturalBoundary &&
        longEnoughForPause &&
        pauseDurationMs >= pauseMs &&
        (startsLikeNewSentence(next.text) || (softLimitReached && pauseDurationMs >= pauseMs * 1.5));
      const hardLimitReached = wordCount >= hardMaxWords || durationMs >= hardMaxDurationMs;
      const emergencyLimitReached =
        wordCount >= emergencyMaxWords || durationMs >= emergencyMaxDurationMs;
      const absoluteLimitReached =
        wordCount >= absoluteMaxWords || durationMs >= absoluteMaxDurationMs;
      const hasSafeHardLimit =
        !canReachSentenceEnd &&
        hardLimitReached &&
        naturalBoundary &&
        (endsClause(fragment.text) || pauseDurationMs >= pauseMs * 1.5);
      const hasSafeEmergencyLimit =
        !canReachSentenceEnd && emergencyLimitReached && naturalBoundary;
      if (
        endsSentence(fragment.text) ||
        hasLongPause ||
        hasSafeHardLimit ||
        hasSafeEmergencyLimit ||
        absoluteLimitReached ||
        !next
      ) {
        flush();
      }
    }
    return sentences;
  }

  const api = { mergeIntoSentences, normalizeText, prepareCues, removeRollingOverlap };
  root.CaptionRollEngine = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
