'use client';

import { useCallback, useEffect, useState } from 'react';

export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  const toggle = useCallback(() => setOpen((prev) => !prev), []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggle();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [toggle]);

  return { open, setOpen };
}
