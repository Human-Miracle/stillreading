/** Inline <head> script: browsers may fire `beforeinstallprompt` before React hydrates, so keep it for later. */
export const EARLY_INSTALL_CAPTURE = `window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__srInstall=e;});`;
