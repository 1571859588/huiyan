'use strict';

(function initializeClientAccess() {
  const native = Boolean(globalThis.__ACCESSIBLE_VISION_BACKEND__
    || globalThis.__ACCESSIBLE_VISION_NATIVE_IOS__ || globalThis.webkit?.messageHandlers?.nativeVision);
  globalThis.ZzyaiClientAccess = { native, profile: 'web', ready: null };
  const access = globalThis.ZzyaiClientAccess;
  if (!native) {
    try { localStorage.removeItem('accessibleNav.dashscopeKey'); } catch (_) {}
  }
  access.ready = (async () => {
    const response = await fetch('/api/client-access', { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw new Error('暂时无法确认入口权限，请重新打开页面。');
    const result = await response.json();
    access.profile = result.accessProfile;
    if (native && !result.nativeAuthorized) {
      const returnTo = location.pathname + location.search;
      location.replace('/native-access.html?returnTo=' + encodeURIComponent(returnTo));
      // Do not start media or fall back to a different native transport during authorization.
      return new Promise(() => {});
    }
    return result;
  })();
  access.ready.catch(() => {});
})();
