(function () {
  if ('ontouchstart' in window) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  document.body.style.cursor = 'none';
  const hideNative = document.createElement('style');
  hideNative.id = 'cursor-arrow-hide-native';
  hideNative.textContent = '*{cursor:none!important}input,textarea,select{cursor:text!important}';
  document.head.appendChild(hideNative);

  const arrow = document.createElement('div');
  arrow.id = 'cursor-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24">' +
    '<path fill="#4F8EFF" stroke="#E8EEFF" stroke-width="1.15" stroke-linejoin="round" ' +
    'd="M3 2 L3 17 L7.5 12.5 L10.5 21 L13 19.5 L10 11 L18 11 Z"/>' +
    '</svg>';
  arrow.style.cssText =
    'position:fixed;left:0;top:0;z-index:10000;pointer-events:none;will-change:left,top;';

  document.body.appendChild(arrow);

  function place(e) {
    arrow.style.left = e.clientX + 'px';
    arrow.style.top = e.clientY + 'px';
  }
  window.addEventListener('mousemove', place);

  document.addEventListener('mouseover', function (e) {
    const t = e.target;
    if (t && t.matches && t.matches('input,textarea,select')) {
      arrow.style.opacity = '0';
      t.style.cursor = 'text';
    } else {
      arrow.style.opacity = '1';
    }
  });
})();

