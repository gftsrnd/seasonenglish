/**
 * Claude occasionally leaks its own tool-call serialisation into a string
 * value of the structured tool input, e.g.
 * `"Bạn nghĩ sao?</seasonReplyTranslation>\n<parameter name=\"nextQuestion\">Do you…"`.
 * Everything from the first tool-call tag onwards belongs to another field
 * and is never learner-facing content, so it is cut off together with the
 * dangling closing tag of the current field.
 */
const TOOL_CALL_TAG = /<\/?(?:antml:)?(?:parameter|invoke|function_calls)\b[^>]*>/iu;
const TRAILING_CLOSING_TAG = /\s*<\/([A-Za-z_][\w:.-]*)>\s*$/u;

export function stripLeakedToolMarkupText(value: string, fieldName?: string): string {
  const leak = TOOL_CALL_TAG.exec(value);
  let stripped = leak ? value.slice(0, leak.index) : value;
  // A closing tag is removed only when it is clearly tool serialisation: it
  // precedes a leaked tool-call tag or it closes the field that contains it.
  // Ordinary markup such as "<b>word</b>" in a lesson string is left alone.
  stripped = stripped.replace(TRAILING_CLOSING_TAG, (full, name: string) => (leak || name === fieldName ? "" : full));
  return stripped === value ? value : stripped.trimEnd();
}

/** Recursively removes leaked tool-call markup from every string of a tool input. */
export function stripLeakedToolMarkup<T>(value: T, fieldName?: string): T {
  if (typeof value === "string") return stripLeakedToolMarkupText(value, fieldName) as T;
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const cleaned = stripLeakedToolMarkup(item, fieldName);
      if (cleaned !== item) changed = true;
      return cleaned;
    });
    return (changed ? next : value) as T;
  }
  if (value && typeof value === "object") {
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const cleaned = stripLeakedToolMarkup(item, key);
      if (cleaned !== item) changed = true;
      // defineProperty keeps a literal "__proto__" key an own data property.
      Object.defineProperty(next, key, { value: cleaned, enumerable: true, writable: true, configurable: true });
    }
    return (changed ? next : value) as T;
  }
  return value;
}
