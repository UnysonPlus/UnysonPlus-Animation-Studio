/**
 * Pretty-prints a scene file for hand editing: two-space indent, but short lists and small objects
 * ("aspect": [16, 9], a keyframe like { "t": 0, "scale": 1 }) stay on one line.
 */
export function formatScene(value: unknown): string {
  return JSON.stringify(value, null, 2)
    // Arrays of plain values (numbers, strings, booleans) on one line.
    .replace(/\[\n\s+((?:[^[\]{}\n]+,\n\s+)*[^[\]{}\n]+)\n\s+\]/g, (_, body: string) => `[${body.split(/,\n\s+/).join(', ')}]`)
    // Objects of three or fewer plain values on one line, when the result stays short.
    .replace(/\{\n\s+((?:"[^"\n]+": [^{}[\]\n]+,\n\s+){0,2}"[^"\n]+": [^{}[\]\n]+)\n\s+\}/g, (whole, body: string) => {
      const line = `{ ${body.split(/,\n\s+/).join(', ')} }`;
      return line.length <= 72 ? line : whole;
    });
}
