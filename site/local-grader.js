(function (root) {
  function normalize(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLocaleLowerCase("en")
      .replace(/[’‘]/g, "'")
      .replace(/[。！？!?，,；;：:\s]+/g, "")
      .trim();
  }

  function matchesAny(answer, expectedAnswers) {
    const normalized = normalize(answer);
    return normalized.length > 0 && expectedAnswers.some(item => normalize(item) === normalized);
  }

  root.LocalGrader = Object.freeze({ normalize, matchesAny });
})(typeof window === "undefined" ? globalThis : window);
