// Paintbrush (`effect: paintbrush`): hold the mouse button and drag to draw in rainbow colors. The drawing stays put on the
// page until you leave it or pick another cursor. See core.js for how effects work.
//
// It's drawn on a canvas in a page layer, so it scrolls with the page. The canvas only grows as tall as the drawing
// reaches (in steps), since a canvas the size of a long page would use a lot of memory.
CursorEffects.register("paintbrush", (function () {
  var kit, layer, canvas, paint;
  var strokes;  // every stroke drawn: lists of [x, y, hue] points, in page coordinates
  var stroke;   // the stroke being drawn
  var hue;
  var full;     // the canvas already reaches the bottom of the page

  // Makes the canvas tall enough to reach y (growing 1000px at a time, to resize less often). force: refit anyway,
  // for when the window changes size. Resizing a canvas wipes it, so everything is redrawn afterwards.
  function fit(y, force) {
    if (!strokes.length || (!force && (y < canvas.offsetHeight || full))) return;
    var height = canvas.offsetHeight;
    while (height <= y) height += 1000;
    var size = layer.fit(height);
    full = size.full;
    var ratio = window.devicePixelRatio || 1;  // full screen resolution, for sharp lines
    canvas.width = size.width * ratio;
    canvas.height = size.height * ratio;
    paint.setTransform(ratio, 0, 0, ratio, 0, 0);
    paint.lineCap = paint.lineJoin = "round";
    paint.lineWidth = 6;
    strokes.forEach(function (points) {
      for (var i = 1; i < points.length; i++) segment(points[i - 1], points[i]);
    });
  }

  function segment(from, to) {
    paint.strokeStyle = "hsl(" + to[2] + ", 90%, 55%)";
    paint.beginPath();
    paint.moveTo(from[0], from[1]);
    paint.lineTo(to[0], to[1]);
    paint.stroke();
  }

  return {
    start: function (tools) {
      kit = tools;
      layer = kit.pageLayer("canvas");
      canvas = layer.element;
      paint = canvas.getContext("2d");
      strokes = [];
      stroke = null;
      hue = 0;
      full = false;
    },

    mousedown: function (event) {
      if (event.button !== 0 || kit.onControl(event)) return;
      event.preventDefault();  // paint instead of selecting text
      var point = kit.pagePoint(event);
      stroke = [[point[0], point[1], hue]];
      strokes.push(stroke);
      fit(point[1] + 10);
    },

    mousemove: function (event) {
      if (!stroke || !(event.buttons & 1)) return;
      hue = (hue + 3) % 360;
      var point = kit.pagePoint(event);
      stroke.push([point[0], point[1], hue]);
      fit(point[1] + 10);
      segment(stroke[stroke.length - 2], stroke[stroke.length - 1]);
    },

    mouseup: function () { stroke = null; },

    resize: function () { fit(0, true); }
  };
})());
