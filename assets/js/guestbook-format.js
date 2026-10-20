// Text formatting for guestbook messages and replies, with tags in square brackets like old forums ("BBCode"):
//
//   [b]bold[/b]  [i]italic[/i]  [u]underline[/u]  [font=Georgia]a font[/font]
//   [url]https://example.com[/url]  [url=https://example.com]a link[/url]
//
// and smileys, typed as codes like :) or :cool: that show as the GIFs in assets/graphics/emojis/ (see SMILEYS).
//
// Messages are stored with the tags as typed. When shown, render() builds the formatting itself from this short
// list of allowed tags, and everything else stays plain text (textContent), so nobody can sneak HTML or scripts in.
// Tags that aren't allowed, aren't closed, or have a bad value just show as typed.
//
// toolbar(textarea) makes the row of buttons above a message box that adds the tags (and smileys) for you.
(function () {
  // The smiley images, found from this file's address (assets/js/ -> assets/graphics/emojis/).
  var SMILEY_FOLDER = new URL("../graphics/emojis/", document.currentScript.src).href;
  // The fonts people can pick, in the order shown in the font panel: [name, fallback, file]. The first ones are
  // installed on most computers; the rest are free fonts kept on this site in assets/fonts/guestbook/ (their
  // licenses are in licenses/ there), which a browser only downloads once they're used. To add a font, put its
  // .woff2 file there and add it here. (Sawdust Marionette is the site's title font, set up in geocities.css.)
  var FONT_FOLDER = new URL("../fonts/guestbook/", document.currentScript.src).href;
  var FONTS = [
    ["Arial", "sans-serif"], ["Verdana", "sans-serif"], ["Trebuchet MS", "sans-serif"], ["Georgia", "serif"],
    ["Times New Roman", "serif"], ["Courier New", "monospace"], ["Comic Sans MS", "cursive"], ["Impact", "sans-serif"],
    ["Press Start 2P", "monospace", "PressStart2P"],                  // 8-bit video game
    ["VT323", "monospace", "VT323"],                                  // old computer terminal
    ["Silkscreen", "monospace", "Silkscreen"],                        // tiny pixel lettering
    ["Special Elite", "monospace", "SpecialElite"],                   // typewriter
    ["Permanent Marker", "cursive", "PermanentMarker"],               // marker
    ["Rock Salt", "cursive", "RockSalt"],                             // scrawled handwriting
    ["Pacifico", "cursive", "Pacifico"],                              // surf script
    ["Lobster", "cursive", "Lobster"],                                // bold retro script
    ["Henny Penny", "cursive", "HennyPenny"],                         // storybook
    ["UnifrakturMaguntia", "serif", "UnifrakturMaguntia"],            // old blackletter
    ["Jacquard 24", "serif", "Jacquard24"],                           // pixel blackletter
    ["Creepster", "cursive", "Creepster"],                            // horror movie
    ["Bangers", "cursive", "Bangers"],                                // comic book
    ["Bungee Shade", "sans-serif", "BungeeShade"],                    // 3D sign lettering
    ["Black Ops One", "sans-serif", "BlackOpsOne"],                   // military stencil
    ["Orbitron", "sans-serif", "Orbitron"],                           // sci-fi
    ["Sawdust Marionette", "cursive"]                                 // this site's title font
  ];

  // Tells the browser where the downloadable fonts are (it only fetches one once something uses it).
  var fontFaces = document.createElement("style");
  fontFaces.textContent = FONTS.filter(function (font) { return font[2]; }).map(function (font) {
    return '@font-face { font-family: "' + font[0] + '"; src: url("' + FONT_FOLDER + font[2] +
      '.woff2") format("woff2"); font-display: swap; }';
  }).join("\n");
  document.head.appendChild(fontFaces);

  function fontStack(font) { return '"' + font[0] + '", ' + font[1]; }
  // Each smiley's code and image, in the order they're shown in the toolbar. To add one, put its GIF in
  // assets/graphics/emojis/ and add it here.
  var SMILEYS = [
    [":)", "smile"], [":D", "biggrin"], [":lol:", "laugh"], [";)", "wink"], [":cool:", "cool"], [":o", "blush"],
    [":(", "frown"], [":eek:", "eek"], [":mad:", "mad"], [":dead:", "dead"], [":cry:", "cry"], [":love:", "rose"],
    [":look:", "look"], [":td:", "notgood"], [":tu:", "perfect"], [":zzz:", "sleep"],
    [":confused:", "confused"]
  ];
  var SMILEY_FILES = {};
  SMILEYS.forEach(function (smiley) { SMILEY_FILES[smiley[0]] = smiley[1]; });
  // Any of the codes. Ones ending in a letter (:D, :o) can't be followed by another letter, so "Note:only" and
  // "C:Documents" aren't smileys.
  var SMILEY = new RegExp("(" + SMILEYS.map(function (smiley) {
    var code = smiley[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return /[A-Za-z]$/.test(smiley[0]) ? code + "(?![A-Za-z])" : code;
  }).join("|") + ")", "g");

  function smileyImage(code) {
    var image = document.createElement("img");
    image.className = "gb-smiley";
    image.src = SMILEY_FOLDER + SMILEY_FILES[code] + ".gif";
    image.alt = code;
    image.title = code;
    return image;
  }

  // Adds text to the page, with smiley codes turned into their pictures.
  function addText(text, into) {
    var last = 0, match;
    SMILEY.lastIndex = 0;
    while ((match = SMILEY.exec(text))) {
      if (match.index > last) into.appendChild(document.createTextNode(text.slice(last, match.index)));
      into.appendChild(smileyImage(match[1]));
      last = SMILEY.lastIndex;
    }
    if (last < text.length) into.appendChild(document.createTextNode(text.slice(last)));
  }
  var TAG = /\[(\/?)(b|i|u|url|font)(?:=([^\[\]]{1,200}))?\]/gi;

  function safeUrl(value) {
    try {
      var url = new URL(value.trim());
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
    } catch (e) {
      return null;
    }
  }

  // The FONTS entry with this name (any capitalization), or null if it isn't one of them.
  function findFont(value) {
    var wanted = value.trim().toLowerCase();
    for (var i = 0; i < FONTS.length; i++) if (FONTS[i][0].toLowerCase() === wanted) return FONTS[i];
    return null;
  }

  // Splits the text into a tree: each node is { tag, value, raw, children } (children are strings and nodes).
  function parse(text) {
    var root = { children: [] }, stack = [root], last = 0, match;
    TAG.lastIndex = 0;
    while ((match = TAG.exec(text))) {
      var top = stack[stack.length - 1];
      if (match.index > last) top.children.push(text.slice(last, match.index));
      last = TAG.lastIndex;
      var closing = match[1] === "/", tag = match[2].toLowerCase(), raw = match[0];
      if (closing) {
        if (top.tag === tag) stack.pop();
        else top.children.push(raw);  // closes something that isn't open: show it as typed
      } else if (tag === "url" && stack.some(function (node) { return node.tag === "url"; })) {
        top.children.push(raw);  // no links inside links
      } else {
        var node = { tag: tag, value: match[3], raw: raw, children: [] };
        top.children.push(node);
        stack.push(node);
      }
    }
    if (last < text.length) stack[stack.length - 1].children.push(text.slice(last));
    // Tags never closed: show the opening tag as typed, then its contents unformatted by it.
    while (stack.length > 1) {
      var open = stack.pop(), parent = stack[stack.length - 1];
      var at = parent.children.indexOf(open);
      parent.children.splice.apply(parent.children, [at, 1, open.raw].concat(open.children));
    }
    return root;
  }

  function plainText(node) {
    return node.children.map(function (child) { return typeof child === "string" ? child : plainText(child); }).join("");
  }

  // The tags' raw text, for a node whose value turned out bad.
  function closingTag(node) { return "[/" + node.tag + "]"; }

  function build(node, into) {
    node.children.forEach(function (child) {
      if (typeof child === "string") return addText(child, into);
      var element = null;
      if (child.tag === "b" || child.tag === "i" || child.tag === "u") {
        if (child.value == null) element = document.createElement(child.tag);
      } else if (child.tag === "font") {
        var font = child.value != null && findFont(child.value);
        if (font) {
          element = document.createElement("span");
          element.style.fontFamily = fontStack(font);
        }
      } else if (child.tag === "url") {
        var href = safeUrl(child.value != null ? child.value : plainText(child));
        if (href) {
          element = document.createElement("a");
          element.href = href;
          element.target = "_blank";
          element.rel = "nofollow ugc noopener";  // no search-engine credit for spammers' links
        }
      }
      if (!element) {  // not allowed as written: show it as typed
        into.appendChild(document.createTextNode(child.raw));
        build(child, into);
        into.appendChild(document.createTextNode(closingTag(child)));
        return;
      }
      build(child, element);
      into.appendChild(element);
    });
  }

  function render(text) {
    var fragment = document.createDocumentFragment();
    build(parse(String(text || "")), fragment);
    return fragment;
  }

  // ---------- The toolbar ----------

  // Puts `before` and `after` around the selected text (or at the cursor), keeping the text selected.
  // The change goes in through the browser's "insert text" command, like typing would, so Cmd/Ctrl+Z undoes it
  // (setting textarea.value directly can't be undone, and clears the undo history).
  function wrap(textarea, before, after) {
    var start = textarea.selectionStart, end = textarea.selectionEnd, value = textarea.value;
    var text = before + value.slice(start, end) + after;
    textarea.focus();
    textarea.setSelectionRange(start, end);
    var typed = false;
    try { typed = document.execCommand("insertText", false, text); } catch (e) {}
    if (!typed || textarea.value.slice(start, start + text.length) !== text) {
      // Fallback for a browser without the command (no undo there).
      textarea.value = value.slice(0, start) + text + value.slice(end);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    }
    textarea.setSelectionRange(start + before.length, end + before.length);
  }

  function insert(textarea, text) {
    wrap(textarea, text, "");
    var at = textarea.selectionStart;
    textarea.setSelectionRange(at, at);
  }

  function button(label, title, onClick, className) {
    var element = document.createElement("button");
    element.type = "button";
    element.className = "gb-tool" + (className ? " " + className : "");
    element.innerHTML = label;  // our own fixed labels only
    element.title = title;
    element.setAttribute("aria-label", title);
    element.addEventListener("click", onClick);
    return element;
  }

  function toolbar(textarea) {
    var bar = document.createElement("div");
    bar.className = "gb-toolbar";
    bar.appendChild(button("<b>B</b>", "Bold", function () { wrap(textarea, "[b]", "[/b]"); }));
    bar.appendChild(button("<i>I</i>", "Italic", function () { wrap(textarea, "[i]", "[/i]"); }));
    bar.appendChild(button("<u>U</u>", "Underline", function () { wrap(textarea, "[u]", "[/u]"); }));
    bar.appendChild(button("link", "Add a link", function () {
      var url = prompt("Link to which web address?", "https://");
      if (!url) return;
      if (!safeUrl(url)) return alert("That doesn't look like a web address (it should start with https://).");
      wrap(textarea, "[url=" + url.trim() + "]", "[/url]");
    }));

    // The font and smiley buttons each open a panel under the toolbar (one at a time). Picking a font or smiley
    // closes it again.
    var panels = [];
    function panelButton(label, title, panel) {
      panel.hidden = true;
      panels.push(panel);
      var opener = button(label, title, function () {
        var opening = panel.hidden;
        panels.forEach(function (other) { other.hidden = true; });
        panel.hidden = !opening;
        opener.setAttribute("aria-expanded", String(opening));
      });
      opener.setAttribute("aria-expanded", "false");
      return opener;
    }
    function closePanels() { panels.forEach(function (panel) { panel.hidden = true; }); }

    // Fonts: each one's name, written in that font (a plain dropdown can't show fonts on Macs).
    var fontPanel = document.createElement("div");
    fontPanel.className = "gb-panel gb-fonts";
    FONTS.forEach(function (font) {
      var pick = button("", font[0], function () {
        wrap(textarea, "[font=" + font[0] + "]", "[/font]");
        closePanels();
      }, "gb-font");
      pick.textContent = font[0];
      pick.style.fontFamily = fontStack(font);
      fontPanel.appendChild(pick);
    });
    bar.appendChild(panelButton("font &#9662;", "Font", fontPanel));

    var smileyPanel = document.createElement("div");
    smileyPanel.className = "gb-panel gb-emojis";
    SMILEYS.forEach(function (smiley) {
      var add = button("", "Add " + smiley[0], function () { insert(textarea, smiley[0]); });
      add.appendChild(smileyImage(smiley[0]));
      smileyPanel.appendChild(add);
    });
    var smileys = panelButton("", "Smileys", smileyPanel);
    smileys.appendChild(smileyImage(":)"));
    bar.appendChild(smileys);

    bar.appendChild(fontPanel);
    bar.appendChild(smileyPanel);
    return bar;
  }

  window.GuestbookFormat = { render: render, toolbar: toolbar };
})();
