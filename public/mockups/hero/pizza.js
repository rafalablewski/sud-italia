/* Renders a self-contained SVG Neapolitan Margherita into any
 * [data-pizza="<seed>"] element. Seeded so each variant gets a stable but
 * organic-looking pie. No external assets — production swaps in owned
 * food photography; this keeps the mockups deploy-safe with zero broken
 * images. CSP (/mockups/*) allows this 'self' script. */
(function () {
  function prng(seed) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }

  function pizza(seed) {
    var r = prng(seed || 1);
    var cx = 300, cy = 300;
    var moz = "", basil = "", char = "";

    // Leopard char on the cornicione (rim).
    for (var i = 0; i < 30; i++) {
      var a = r() * Math.PI * 2, rad = 234 + r() * 30;
      var x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
      var rx = 5 + r() * 12, ry = 4 + r() * 8, rot = r() * 180;
      char += '<ellipse cx="' + x.toFixed(0) + '" cy="' + y.toFixed(0) + '" rx="' + rx.toFixed(0) +
        '" ry="' + ry.toFixed(0) + '" fill="#552c14" opacity="' + (0.18 + r() * 0.4).toFixed(2) +
        '" transform="rotate(' + rot.toFixed(0) + ' ' + x.toFixed(0) + ' ' + y.toFixed(0) + ')"/>';
    }

    // Fior di latte — molten cheese pools.
    for (var j = 0; j < 13; j++) {
      var b = r() * Math.PI * 2, rd = r() * 168;
      var mx = cx + Math.cos(b) * rd, my = cy + Math.sin(b) * rd;
      var mrx = 26 + r() * 22, mry = 21 + r() * 16, mrot = r() * 180;
      moz += '<g transform="rotate(' + mrot.toFixed(0) + ' ' + mx.toFixed(0) + ' ' + my.toFixed(0) + ')">' +
        '<ellipse cx="' + mx.toFixed(0) + '" cy="' + my.toFixed(0) + '" rx="' + mrx.toFixed(0) + '" ry="' + mry.toFixed(0) + '" fill="url(#moz)"/>' +
        '<ellipse cx="' + (mx - mrx * 0.26).toFixed(0) + '" cy="' + (my - mry * 0.32).toFixed(0) + '" rx="' + (mrx * 0.34).toFixed(0) + '" ry="' + (mry * 0.24).toFixed(0) + '" fill="#ffffff" opacity="0.5"/>' +
        '</g>';
      if (r() > 0.45) char += '<ellipse cx="' + (mx + mrx * 0.3).toFixed(0) + '" cy="' + (my + mry * 0.25).toFixed(0) + '" rx="3" ry="2" fill="#6b3a1e" opacity="0.45"/>';
    }

    // Basil leaves.
    var leaves = 5;
    for (var k = 0; k < leaves; k++) {
      var ang = (k / leaves) * Math.PI * 2 + r() * 0.7;
      var lr = 64 + r() * 116;
      var lx = cx + Math.cos(ang) * lr, ly = cy + Math.sin(ang) * lr;
      var lrot = r() * 360, sc = (0.9 + r() * 0.55).toFixed(2);
      basil += '<g transform="translate(' + lx.toFixed(0) + ' ' + ly.toFixed(0) + ') rotate(' + lrot.toFixed(0) + ') scale(' + sc + ')">' +
        '<path d="M0,-23 C15,-15 15,15 0,23 C-15,15 -15,-15 0,-23 Z" fill="#41803f"/>' +
        '<path d="M0,-18 L0,18" stroke="#2c5a30" stroke-width="1.5"/>' +
        '<path d="M0,-9 L7,-4 M0,1 L8,6 M0,-9 L-7,-4 M0,1 L-8,6" stroke="#2c5a30" stroke-width="1" fill="none" opacity="0.6"/>' +
        '</g>';
    }

    return '<svg viewBox="0 0 600 620" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Neapolitan Margherita with a leopard-charred cornicione, fior di latte and fresh basil">' +
      '<defs>' +
      '<radialGradient id="crust" cx="50%" cy="45%" r="53%"><stop offset="58%" stop-color="#EEC07C"/><stop offset="80%" stop-color="#D2913F"/><stop offset="100%" stop-color="#9C541F"/></radialGradient>' +
      '<radialGradient id="sauce" cx="50%" cy="46%" r="45%"><stop offset="0%" stop-color="#C63C27"/><stop offset="76%" stop-color="#A52C1C"/><stop offset="100%" stop-color="#7e2114"/></radialGradient>' +
      '<radialGradient id="moz" cx="38%" cy="32%" r="72%"><stop offset="0%" stop-color="#FFFEF7"/><stop offset="66%" stop-color="#F3E6C7"/><stop offset="100%" stop-color="#E4CF9F"/></radialGradient>' +
      '<filter id="blur"><feGaussianBlur stdDeviation="7"/></filter>' +
      '</defs>' +
      '<ellipse cx="300" cy="350" rx="274" ry="250" fill="#3d2817" opacity="0.22" filter="url(#blur)"/>' +
      '<circle cx="300" cy="300" r="272" fill="url(#crust)"/>' +
      '<circle cx="300" cy="300" r="214" fill="url(#sauce)"/>' +
      moz + basil + char +
      '<circle cx="300" cy="300" r="272" fill="none" stroke="#7a3f1c" stroke-width="2" opacity="0.28"/>' +
      '<ellipse cx="232" cy="208" rx="60" ry="34" fill="#ffffff" opacity="0.07"/>' +
      '</svg>';
  }

  function mount() {
    var els = document.querySelectorAll('[data-pizza]');
    for (var i = 0; i < els.length; i++) {
      var seed = parseInt(els[i].getAttribute('data-pizza'), 10) || (i + 7) * 9973;
      els[i].innerHTML = pizza(seed);
    }
  }
  if (document.readyState !== 'loading') mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
