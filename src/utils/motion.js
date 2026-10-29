// Shared Framer Motion presets (see instructions.md). Only transform + opacity are animated.

/** Sliding pill behind the active tab: fast acceleration, no overshoot. */
export const SNAPPY_TAB_SPRING = { type: 'spring', stiffness: 600, damping: 35, mass: 0.5 };

/** Dashboard-style view switch: slight scale + lift. */
export const FAST_PAGE_VARIANTS = {
  initial: { opacity: 0, scale: 0.985, y: 4 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.16, ease: [0.2, 0, 0, 1] } },
  exit: { opacity: 0, scale: 0.985, y: -4, transition: { duration: 0.12, ease: [0.4, 0, 1, 1] } },
};

/** Native-feeling horizontal slide for the installed PWA / APK wrapper. */
export const WEB_APP_SLIDE_VARIANTS = {
  initial: { opacity: 0, x: 16 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, x: -16, transition: { duration: 0.14, ease: [0.7, 0, 0.84, 0] } },
};

/** Parent of staggered cards: 30ms offset per child. */
export const STAGGER_CONTAINER_VARIANTS = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.03 } },
};

export const STAGGER_CARD_VARIANTS = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.18, ease: 'easeOut' } },
};

/** Immediate press feedback for buttons and tab items. */
export const TAP_SCALE = { scale: 0.97 };
