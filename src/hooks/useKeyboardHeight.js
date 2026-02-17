import { useState, useEffect } from 'react';
import { isNative } from '../utils/platform';

export function useKeyboardHeight() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (isNative) {
      let showListener, hideListener;

      import('@capacitor/keyboard').then(({ Keyboard }) => {
        showListener = Keyboard.addListener('keyboardWillShow', (info) => {
          setKeyboardHeight(info.keyboardHeight);
        });
        hideListener = Keyboard.addListener('keyboardWillHide', () => {
          setKeyboardHeight(0);
        });
      }).catch(() => {});

      return () => {
        showListener?.then(l => l.remove());
        hideListener?.then(l => l.remove());
      };
    } else {
      const viewport = window.visualViewport;
      if (!viewport) return;

      const handleResize = () => {
        const diff = window.innerHeight - viewport.height;
        setKeyboardHeight(diff > 100 ? diff : 0);
      };

      viewport.addEventListener('resize', handleResize);
      return () => viewport.removeEventListener('resize', handleResize);
    }
  }, []);

  return keyboardHeight;
}
