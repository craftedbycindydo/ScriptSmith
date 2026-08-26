/**
 * The locked test harness, as the editor sees it.
 *
 * Mirrors backend/app/services/lab_harness.py. The server is the authority:
 * on every run it discards whatever is below the marker line and appends the
 * lab's own harness. This module only reproduces the same text so the editor
 * can show the harness in place and keep it read-only.
 */

export const HARNESS_MARKER_TEXT = '==== TESTS (locked) - do not edit below this line ====';

const MARKER_RE = /^[ \t]*(?:#|\/\/)[ \t]*==== TESTS \(locked\) - do not edit below this line ====[ \t]*\r?$/m;

export function commentPrefix(language: string | null | undefined): string {
  return (language || 'python').toLowerCase() === 'python' ? '#' : '//';
}

export function markerLine(language: string | null | undefined): string {
  return `${commentPrefix(language)} ${HARNESS_MARKER_TEXT}`;
}

/** Exactly the text the editor locks: the marker line plus the harness. */
export function lockedTail(harness: string, language: string | null | undefined): string {
  return `${markerLine(language)}\n${harness.replace(/^[\r\n]+|[\r\n]+$/g, '')}`;
}

/** The student's part and the harness of a buffer; harness is null when there is no marker. */
export function splitHarness(code: string): { student: string; harness: string | null } {
  const text = code || '';
  const match = MARKER_RE.exec(text);
  if (!match) return { student: text, harness: null };
  return {
    student: text.slice(0, match.index),
    harness: text.slice(match.index + match[0].length).replace(/^[\r\n]+|[\r\n]+$/g, ''),
  };
}

/** The student's part of a buffer: everything above the marker line. */
export function stripHarness(code: string): string {
  const { student, harness } = splitHarness(code);
  if (harness === null) return student;
  return student.trim() ? student.replace(/\s+$/, '') + '\n' : '';
}

/** The buffer shown for a lab: the student's part with the locked tail below it. */
export function withLockedTail(studentCode: string, tail: string): string {
  return `${stripHarness(studentCode).replace(/\s+$/, '')}\n\n${tail}`;
}

/** Whether a buffer still ends with the locked tail on its own line. */
export function endsWithLockedTail(value: string, tail: string): boolean {
  return value === tail || value.endsWith('\n' + tail);
}

