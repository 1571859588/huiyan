(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HuiyanLocalScreenSearch = api.attach(root);
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  function attach(root) {
    let enabled = false;
    const original = root.__huiyanSetLocalScreenEnabled;
    const bridge = root.webkit?.messageHandlers?.nativeLocalScreen;
    if (typeof original === 'function' && bridge?.postMessage) {
      root.__huiyanSetLocalScreenEnabled = function (value, ...rest) {
        const result = original.call(this, value, ...rest);
        enabled = value === true;
        return result;
      };
      // Re-read native state after a page reload; never enable the model here.
      bridge.postMessage({ type: 'state' });
    }
    return Object.freeze({ enabled: () => enabled });
  }
  return { attach };
});
