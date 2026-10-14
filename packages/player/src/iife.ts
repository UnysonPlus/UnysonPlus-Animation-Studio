// Entry for the standalone script: exposes window.UnysonPlusScene and mounts every scene on the page.
import * as api from './index';

declare global {
  interface Window { UnysonPlusScene: typeof api }
}
window.UnysonPlusScene = api;

const script = document.currentScript as HTMLScriptElement | null;
if (script?.dataset.autoMount !== 'false') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => api.autoMount());
  else api.autoMount();
}
