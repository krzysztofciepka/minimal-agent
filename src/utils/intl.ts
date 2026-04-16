let cached: Intl.Segmenter | null = null
export function getGraphemeSegmenter(): Intl.Segmenter {
  if (!cached) {
    cached = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  }
  return cached
}
