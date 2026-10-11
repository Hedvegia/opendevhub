/** The computed styles that decide where text wraps in a textarea; a mirror copies them to measure a position. */
const MIRRORED = [
  "boxSizing",
  "width",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "fontStyle",
  "fontVariant",
  "fontWeight",
  "fontStretch",
  "fontSize",
  "lineHeight",
  "fontFamily",
  "textAlign",
  "textTransform",
  "textIndent",
  "letterSpacing",
  "wordSpacing",
  "tabSize",
] as const;

/**
 * Where character `index` of a textarea sits, relative to the textarea's border box and after its scroll: an
 * off-screen copy with the same styles wraps the text the same way, and a span marks the index.
 */
export const caretCoordinates = (
  el: HTMLTextAreaElement,
  index: number
): { top: number; left: number; height: number } => {
  const style = getComputedStyle(el);
  const mirror = document.createElement("div");
  for (const prop of MIRRORED) {
    mirror.style[prop] = style[prop];
  }
  Object.assign(mirror.style, {
    left: "0",
    overflow: "hidden",
    overflowWrap: "break-word",
    position: "absolute",
    top: "0",
    visibility: "hidden",
    whiteSpace: "pre-wrap",
  });
  mirror.textContent = el.value.slice(0, index);
  const marker = document.createElement("span");
  marker.textContent = el.value.slice(index) || ".";
  mirror.append(marker);
  document.body.append(mirror);
  // Computed sizes are in px; a "normal" line height has no number and falls back.
  const fontSize = Number(style.fontSize.replace("px", "")) || 14;
  const height = Number(style.lineHeight.replace("px", "")) || fontSize * 1.4;
  const coords = {
    height,
    left: marker.offsetLeft - el.scrollLeft,
    top: marker.offsetTop - el.scrollTop,
  };
  mirror.remove();
  return coords;
};
