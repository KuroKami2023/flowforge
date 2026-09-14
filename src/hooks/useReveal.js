import { useEffect, useRef, useState } from 'react';

/**
 * useReveal — scroll-reveal primitive for the public landing page.
 * Returns { ref, visible }. The element flips to visible once it enters
 * the viewport (and stays visible). Respects reduced-motion and
 * environments without IntersectionObserver by revealing immediately.
 */
export function useReveal({ threshold = 0.15 } = {}) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      typeof IntersectionObserver === 'undefined' ||
      (typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    ) {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            obs.disconnect();
          }
        });
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return { ref, visible };
}
