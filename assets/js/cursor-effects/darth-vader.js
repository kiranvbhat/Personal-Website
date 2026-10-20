// Darth Vader (`effect: darth-vader`): a short-lived glowing red trail behind the cursor, like a lightsaber. None over links
// and buttons, where the cursor turns into the helmet. See core.js for how effects work.
CursorEffects.register("darth-vader", (function () {
  var TRAIL_MS = 120;  // how long the trail lasts
  var kit, context;
  var trail;           // [x, y, time] points, in window coordinates
  var frame;           // the next animation frame, if one is coming

  function draw() {
    frame = 0;
    context.clearRect(0, 0, innerWidth, innerHeight);
    context.lineCap = context.lineJoin = "round";
    var now = performance.now();
    trail = trail.filter(function (point) { return now - point[2] < TRAIL_MS; });
    context.shadowColor = "#f00";
    for (var i = 1; i < trail.length; i++) {
      var fade = 1 - (now - trail[i][2]) / TRAIL_MS;
      context.globalAlpha = fade;
      context.shadowBlur = 12;
      context.strokeStyle = "#f22";
      context.lineWidth = 5 * fade;
      context.beginPath();
      context.moveTo(trail[i - 1][0], trail[i - 1][1]);
      context.lineTo(trail[i][0], trail[i][1]);
      context.stroke();
      context.shadowBlur = 0;
      context.strokeStyle = "#fff";  // bright core, like the blade
      context.lineWidth = 1.5 * fade;
      context.stroke();
    }
    context.globalAlpha = 1;
    context.shadowBlur = 0;
    if (trail.length) redraw();  // keep fading until the trail is gone
  }

  function redraw() {
    if (!frame) frame = requestAnimationFrame(draw);
  }

  return {
    animated: true,

    start: function (tools) {
      kit = tools;
      context = kit.windowCanvas();
      trail = [];
      frame = 0;
    },

    stop: function () { cancelAnimationFrame(frame); },

    mousemove: function (event) {
      if (kit.onLink(event)) trail = [];
      else trail.push([event.clientX, event.clientY, performance.now()]);
      redraw();
    }
  };
})());
