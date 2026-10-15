import { useSyncExternalStore } from 'react';

export const MOBILE_QUERY = '(max-width: 760px)';
const mq = typeof matchMedia !== 'undefined' ? matchMedia(MOBILE_QUERY) : null;

/** True on phone-sized viewports. */
export const useMobile = () =>
  useSyncExternalStore(
    (cb) => {
      mq?.addEventListener('change', cb);
      return () => mq?.removeEventListener('change', cb);
    },
    () => !!mq?.matches,
    () => false,
  );
export const isMobile = () => !!mq?.matches;
