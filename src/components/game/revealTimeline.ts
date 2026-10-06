/**
 * Choreography of a bluff reveal, in ms from when the overlay mounts. The server keeps the room in
 * "reveal" for ~4.2s, so even a 4-card reveal finishes with a beat to spare.
 */
export interface RevealTimeline {
  /** "<Accused> claimed 2 × Sevens" and the face-down cards appear. */
  claim: number;
  /** First card starts flipping; the rest follow every `stagger`. */
  flip0: number;
  stagger: number;
  /** Duration of one flip. */
  flip: number;
  /** BLUFF! / HONEST stamp lands. */
  verdict: number;
  /** "<Picker> picks up N cards" appears. */
  result: number;
}

export function revealTimeline(cards: number): RevealTimeline {
  const claim = 450;
  const flip0 = 900;
  const stagger = 340;
  const flip = 500;
  const verdict = flip0 + Math.max(0, cards - 1) * stagger + flip + 200;
  return { claim, flip0, stagger, flip, verdict, result: verdict + 480 };
}
