// Cursor effects: special effects for cursors with an `effect:` in _data/cursors.yml (for example, the paintbrush
// draws on the page). This file is the shared part, loaded on every page by _includes/geo/cursor-effects.html.
//
// Each effect is its own file in this folder, named after the cursor it was made for (paintbrush.js for the
// paintbrush cursor, which has `effect: paintbrush`). Another cursor can use the same effect by giving that name
// too. An effect's file is only downloaded once someone picks a cursor with that effect. An effect file registers itself like this:
//
//   CursorEffects.register("paintbrush", {
//     animated: true,           // optional: skip it for visitors who turn off animations
//     start: function (kit) {}, // the effect was turned on; `kit` has the helpers below
//     stop: function () {},     // optional: it was turned off (anything it made with the kit is removed for it)
//     mousedown: function (event) {}, mousemove: function (event) {}, mouseup: function (event) {},
//     resize: function () {}    // optional: the window changed size
//   });
//
// All parts but start are optional. The kit passed to start:
//   kit.asset(path)       the address of a file in the site, like kit.asset("assets/graphics/misc/x.png")
//   kit.pagePoint(event)  the mouse position as [x, y] on the page (so it stays put when the page scrolls)
//   kit.onControl(event)  whether the mouse is on a link, button, form field or other control
//   kit.onLink(event)     whether the mouse is on something that shows the link cursor (see geocities.css)
//   kit.windowCanvas()    a 2D canvas context covering the window, kept sized to it (cleared when resized)
//   kit.pageLayer(tag)    an element over the page that scrolls with it, made with the given tag ("canvas", "div");
//                         returns { element, fit(height), clear() }; see pageLayer below
//
// Cursor effects only run on devices with a mouse. cursor-init.html says which effect is on by setting
// data-cursor-effect on <html>; this watches for changes to it, so picking another cursor switches effects.
(function () {
  var script = document.currentScript;
  var folder = script.src.replace(/[^/]*$/, "");  // where the effect files are (this file's folder)
  var base = script.dataset.base || "/";            // the site's root address, for kit.asset
  var root = document.documentElement;
  var effects = {};    // registered effects, by name
  var requested = {};  // effect files already asked for
  var active = null;   // the running effect: { name, effect, elements, resizers }

  // Things you click or type in (painting there would get in the way).
  var CONTROLS = "a, button, input, textarea, select, label, summary, iframe, dialog, [contenteditable]";
  // The elements that get the link cursor in geocities.css.
  var LINK_CURSOR = "a, button, select, label, input";

  window.CursorEffects = {
    register: function (name, effect) {
      effects[name] = effect;
      update();
    }
  };

  if (!window.matchMedia || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  var calm = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Starts whichever effect is wanted now (loading its file first if needed), stopping the old one.
  function update() {
    var name = root.dataset.cursorEffect || null;
    if (active && active.name === name) return;
    if (active) stop();
    if (!name || !/^[a-z0-9-]+$/.test(name)) return;
    var effect = effects[name];
    if (!effect) return load(name);  // register() calls update again once it's loaded
    if (effect.animated && calm) return;
    start(name, effect);
  }

  function load(name) {
    if (requested[name]) return;
    requested[name] = true;
    var tag = document.createElement("script");
    tag.src = folder + name + ".js";
    document.head.appendChild(tag);
  }

  function start(name, effect) {
    active = { name: name, effect: effect, elements: [], resizers: [] };
    effect.start(makeKit());
  }

  function stop() {
    var current = active;
    active = null;
    if (current.effect.stop) current.effect.stop();
    current.elements.forEach(function (element) { element.remove(); });
  }

  // Makes an element for the running effect, invisible to clicks and screen readers. It's removed when the effect
  // stops.
  function add(tagName, css) {
    var element = document.createElement(tagName);
    element.style.cssText = "pointer-events: none; z-index: 50; " + css;
    element.setAttribute("aria-hidden", "true");
    document.body.appendChild(element);
    active.elements.push(element);
    return element;
  }

  function makeKit() {
    return {
      asset: function (path) { return base + encodeURI(path); },
      pagePoint: function (event) { return [event.clientX + scrollX, event.clientY + scrollY]; },
      onControl: function (event) { return !!(event.target.closest && event.target.closest(CONTROLS)); },
      onLink: function (event) { return !!(event.target.closest && event.target.closest(LINK_CURSOR)); },
      windowCanvas: windowCanvas,
      pageLayer: pageLayer
    };
  }

  // A canvas fixed over the window. It's drawn at the screen's full resolution (devicePixelRatio), but you draw on
  // it in CSS pixels.
  function windowCanvas() {
    var canvas = add("canvas", "position: fixed; inset: 0; width: 100%; height: 100%;");
    var context = canvas.getContext("2d");
    function fit() {
      var ratio = window.devicePixelRatio || 1;
      canvas.width = innerWidth * ratio;
      canvas.height = innerHeight * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    fit();
    active.resizers.push(fit);
    return context;
  }

  // An element at the top-left of the page, so whatever is in it scrolls with the page. It starts with no size;
  // fit(height) makes it as wide as the page and the given height (Infinity for all of it), but never taller than
  // the page, or it would add room to scroll. fit returns { width, height, full } (full: it reaches the bottom of
  // the page). clear() shrinks it back to nothing. Anything inside that pokes out is cut off.
  function pageLayer(tagName) {
    var element = add(tagName, "position: absolute; top: 0; left: 0; width: 0; height: 0; overflow: hidden;");
    return {
      element: element,
      fit: function (height) {
        element.style.height = "0";  // so the layer itself doesn't count toward the page's height
        var pageHeight = root.scrollHeight, width = root.clientWidth;
        height = Math.min(height, pageHeight);
        element.style.width = width + "px";
        element.style.height = height + "px";
        return { width: width, height: height, full: height >= pageHeight };
      },
      clear: function () { element.style.width = element.style.height = "0"; }
    };
  }

  // Pass mouse events and resizes on to the running effect.
  ["mousedown", "mousemove", "mouseup"].forEach(function (type) {
    document.addEventListener(type, function (event) {
      if (active && active.effect[type]) active.effect[type](event);
    });
  });
  addEventListener("resize", function () {
    if (!active) return;
    active.resizers.forEach(function (fit) { fit(); });
    if (active.effect.resize) active.effect.resize();
  });

  new MutationObserver(update).observe(root, { attributes: true, attributeFilter: ["data-cursor-effect"] });
  update();
})();
