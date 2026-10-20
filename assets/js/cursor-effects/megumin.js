// Megumin (`effect: megumin`): each click sets off an explosion where you clicked. See core.js for how effects
// work.
//
// The explosion is the 27 frames of explosion 5.gif side by side in one image, shown one frame at a time by sliding
// the image along. (A GIF would pick up wherever it last was, instead of always playing once from the start.)
// Explosions go in a page layer, so they stay put when the page scrolls.
CursorEffects.register("megumin", (function () {
  var SHEET = "assets/graphics/misc/explosion 5 frames.png";
  var FRAMES = 27, SIZE = 200, LENGTH_MS = 2700;  // each frame is 200x200
  var CENTER = [96, 166];                         // where in the frame the blast starts from
  var kit, layer, sheet;

  return {
    animated: true,

    start: function (tools) {
      kit = tools;
      layer = kit.pageLayer("div");
      sheet = kit.asset(SHEET);
      new Image().src = sheet;  // ready before the first click
    },

    mousedown: function (event) {
      if (event.button !== 0) return;
      layer.fit(Infinity);
      var point = kit.pagePoint(event);
      var boom = document.createElement("div");
      boom.style.cssText =
        "position: absolute; width: " + SIZE + "px; height: " + SIZE + "px;" +
        "left: " + (point[0] - CENTER[0]) + "px; top: " + (point[1] - CENTER[1]) + "px;" +
        "background: url(\"" + sheet + "\") 0 0 / " + FRAMES * SIZE + "px " + SIZE + "px;";
      layer.element.appendChild(boom);
      boom.animate(
        [{ backgroundPosition: "0 0" }, { backgroundPosition: -FRAMES * SIZE + "px 0" }],
        { duration: LENGTH_MS, easing: "steps(" + FRAMES + ")", fill: "forwards" }
      );
      setTimeout(function () {  // once it has played
        boom.remove();
        if (!layer.element.firstChild) layer.clear();
      }, LENGTH_MS);
    }
  };
})());
