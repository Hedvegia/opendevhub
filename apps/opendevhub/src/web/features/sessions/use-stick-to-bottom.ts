import { useCallback, useEffect, useRef, useState } from "react";

/** How close to the bottom, in pixels, still counts as being at it. */
const NEAR_BOTTOM_PX = 48;

/**
 * Keeps a scroll container at its bottom while the user is there. `scrollRef` goes on the scrolling element and
 * `contentRef` on the element inside it that grows. When the content grows while the user has scrolled up, the view
 * stays put and `behind` turns true until they are back at the bottom.
 */
export const useStickToBottom = () => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [behind, setBehind] = useState(false);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    atBottom.current = true;
    setBehind(false);
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content) {
      return;
    }
    let lastScrollTop = el.scrollTop;
    const onScroll = () => {
      const nearBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;
      if (nearBottom) {
        atBottom.current = true;
        setBehind(false);
      } else if (el.scrollTop < lastScrollTop) {
        // Growing content can put the bottom out of reach before ResizeObserver runs.
        // Only an upward scroll should stop following it.
        atBottom.current = false;
      }
      lastScrollTop = el.scrollTop;
    };
    let height = content.offsetHeight;
    // Opens at the newest message.
    el.scrollTop = el.scrollHeight;
    const observer = new ResizeObserver(() => {
      const grew = content.offsetHeight > height;
      height = content.offsetHeight;
      if (atBottom.current) {
        el.scrollTop = el.scrollHeight;
        lastScrollTop = el.scrollTop;
      } else if (grew) {
        setBehind(true);
      }
    });
    // The container shrinks when the composer grows or a panel opens; the bottom stays in view.
    observer.observe(el);
    observer.observe(content);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", onScroll);
    };
  }, []);

  return { behind, contentRef, scrollRef, scrollToBottom };
};
