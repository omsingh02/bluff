import { useEffect } from "react";
import { CODE_ALPHABET, CODE_LENGTH, MAX_NAME } from "@/lib/types";

/** Collapse inner whitespace and trim (mirrors what the server does). */
export const cleanName = (raw: string): string => raw.replace(/\s+/g, " ").trim();

/** Length in characters (code points), not UTF-16 units — so one emoji counts once. */
export const nameLength = (s: string): number => Array.from(s).length;

export const isValidName = (raw: string): boolean => {
  const len = nameLength(cleanName(raw));
  return len >= 1 && len <= MAX_NAME;
};

export const NAME_HINT = `Pick a name (1–${MAX_NAME} characters)`;

/**
 * Turn whatever the user typed or pasted into a room code candidate.
 *  - a pasted invite link (`…/r/K7QXM2`) yields its code;
 *  - pasted prose ("join me, code K7QXM2!") yields the first standalone code-length token in it;
 *  - otherwise characters outside the code alphabet (0, O, 1, I, L…) are dropped, then it's capped at 5.
 */
export function parseRoomCode(raw: string): string {
  const fromLink = raw.match(/\/r\/([A-Za-z0-9]+)/);
  const source = fromLink ? fromLink[1] : raw;

  if (source.length > CODE_LENGTH) {
    const token = source.toUpperCase().match(new RegExp(`\\b[${CODE_ALPHABET}]{${CODE_LENGTH}}\\b`));
    if (token) return token[0];
  }

  return Array.from(source.toUpperCase())
    .filter((c) => CODE_ALPHABET.includes(c))
    .join("")
    .slice(0, CODE_LENGTH);
}

export const inviteLink = (code: string): string => `${window.location.origin}/r/${code}`;

/** Clipboard write with a textarea fallback for insecure contexts / older browsers. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Sets `document.title` while mounted and restores the previous title on unmount. */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
