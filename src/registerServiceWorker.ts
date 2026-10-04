export function registerServiceWorker() {
  if (!import.meta.env.PROD || !window.isSecureContext || !('serviceWorker' in navigator)) return;

  const register = () => {
    // Let updates activate after existing windows close; never reload an open form.
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
      updateViaCache: 'none',
    }).catch((error: unknown) => {
      // Installation support must not prevent the normal application from running.
      console.warn('No se pudo habilitar la instalación de Finance App.', error);
    });
  };

  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
