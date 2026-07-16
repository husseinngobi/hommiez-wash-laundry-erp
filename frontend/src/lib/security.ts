// Security utilities for production environment

// Disable developer tools in production
export const disableDevTools = () => {
  if (import.meta.env.PROD) {
    // Disable right-click context menu
    document.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      return false;
    });

    // Disable keyboard shortcuts for dev tools
    document.addEventListener('keydown', (e) => {
      // F12 - Developer tools
      if (e.key === 'F12') {
        e.preventDefault();
        return false;
      }

      // Ctrl+Shift+I - Inspect element
      if (e.ctrlKey && e.shiftKey && e.key === 'I') {
        e.preventDefault();
        return false;
      }

      // Ctrl+Shift+J - Console
      if (e.ctrlKey && e.shiftKey && e.key === 'J') {
        e.preventDefault();
        return false;
      }

      // Ctrl+U - View source
      if (e.ctrlKey && e.key === 'U') {
        e.preventDefault();
        return false;
      }

      // Ctrl+Shift+C - Select element
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        return false;
      }
    });

    // Detect if DevTools is open and warn user
    const detectDevTools = () => {
      const widthThreshold = window.outerWidth - window.innerWidth > 160;
      const heightThreshold = window.outerHeight - window.innerHeight > 160;
      
      if (widthThreshold || heightThreshold) {
        console.clear();
      }
    };

    // Check periodically
    setInterval(detectDevTools, 1000);
  }
};

// Clear console periodically in production
export const clearConsole = () => {
  if (import.meta.env.PROD) {
    setInterval(() => {
      console.clear();
    }, 5000);
  }
};

// Disable text selection for sensitive areas (optional - can affect UX)
export const disableTextSelection = (elementId?: string) => {
  if (import.meta.env.PROD) {
    const style = document.createElement('style');
    const selector = elementId ? `#${elementId}` : 'body';
    style.textContent = `
      ${selector} {
        -webkit-user-select: none;
        -moz-user-select: none;
        -ms-user-select: none;
        user-select: none;
      }
    `;
    document.head.appendChild(style);
  }
};

// Detect and warn about debugger
export const detectDebugger = () => {
  if (import.meta.env.PROD) {
    // This will pause execution if debugger is open
    setInterval(() => {
      const startTime = performance.now();
      // eslint-disable-next-line no-debugger
      debugger; // Intentionally used to detect DevTools - only runs in production
      const endTime = performance.now();
      
      // If there was a significant delay, DevTools is likely open
      if (endTime - startTime > 100) {
        console.clear();
        window.location.href = '/login'; // Redirect to login
      }
    }, 1000);
  }
};

// Export all security functions
export const initializeProductionSecurity = () => {
  if (import.meta.env.PROD) {
    disableDevTools();
    clearConsole();
    // Uncomment if needed:
    // disableTextSelection();
    // detectDebugger(); // Warning: This is aggressive and may affect performance
  }
};
