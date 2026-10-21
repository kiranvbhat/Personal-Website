// The guestbook's pages: shows the entries a page at a time (guestbook.html, and the admin page), and sends new
// ones to the guestbook's server (the form on guestbook-sign.html). Each part only runs on pages that have it. The
// admin page adds reply and delete buttons through Guestbook.decorate (guestbook-admin.js). Formatting ([b]bold[/b] and so on) and the formatting buttons come from guestbook-format.js.
//
// Names, dates and links are put on the page as plain text (textContent), and messages only get the formatting
// guestbook-format.js allows, so nobody can sneak HTML or scripts into the guestbook.
(function () {
  var root = document.getElementById("guestbook");
  if (!root) return;
  var api = root.dataset.api.replace(/\/+$/, "");
  var form = document.getElementById("guestbook-form");
  var list = document.getElementById("gb-entries");
  var pagers = [document.getElementById("gb-pager"), document.getElementById("gb-pager-bottom")];
  var token = null;  // the current robot check's token

  var Guestbook = window.Guestbook = {
    page: 1,
    owner: root.dataset.owner || "Me",  // who the replies are from
    decorate: null,  // optional function (element, entry) to add to each entry, like a delete button
    load: load,
    request: request,
    formatDate: formatDate
  };

  // Calls the guestbook's server. Resolves with its reply, or rejects with its (friendly) error message.
  function request(method, path, body, adminToken) {
    var headers = {};
    if (body) headers["Content-Type"] = "application/json";
    if (adminToken) headers.Authorization = "Bearer " + adminToken;
    return fetch(api + path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined })
      .catch(function () { throw new Error("Couldn't reach the guestbook. Try again in a bit!"); })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          if (!response.ok) throw new Error(data.error || "Something went wrong. Try again in a bit!");
          return data;
        });
      });
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit"
    });
  }

  function load(page) {
    return request("GET", "/entries?page=" + (page || 1)).then(function (data) {
      Guestbook.page = data.page;
      list.textContent = "";
      if (!data.total) list.appendChild(element("p", "gb-empty", "Nobody has signed yet. Be the first!!"));
      data.entries.forEach(function (entry) { list.appendChild(renderEntry(entry)); });
      pagers.forEach(function (pager, i) { renderPager(pager, data, i === 1); });
    }).catch(function (error) {
      list.textContent = "";
      list.appendChild(element("p", "gb-empty", error.message));
    });
  }

  // One entry: a box titled with the name (a link to their homepage, if they gave one) and the date, then the
  // message, then my reply, if there is one.
  function renderEntry(entry) {
    var box = element("div", "box gb-entry");
    var title = element("div", "box-title");
    var name = entry.name || "Anonymous";
    var homepage = safeUrl(entry.homepage);
    if (homepage) {
      var link = element("a", "gb-name", name);
      link.href = homepage;
      link.target = "_blank";
      link.rel = "nofollow ugc noopener";  // no search-engine credit for spammers' links
      link.title = homepage;
      title.appendChild(link);
    } else {
      title.appendChild(element("span", "gb-name", name));
    }
    title.appendChild(element("span", "gb-date", formatDate(entry.created)));
    box.appendChild(title);

    var body = element("div", "entry-body");
    var message = element("p", "gb-message");
    message.appendChild(GuestbookFormat.render(entry.message));
    body.appendChild(message);
    if (entry.reply) body.appendChild(renderReply(entry));
    box.appendChild(body);

    if (Guestbook.decorate) Guestbook.decorate(box, entry);
    return box;
  }

  function renderReply(entry) {
    var reply = element("div", "gb-reply");
    reply.appendChild(element("p", "gb-reply-title", Guestbook.owner + " replied on " + formatDate(entry.replied) + ":"));
    var text = element("p", "gb-message");
    text.appendChild(GuestbookFormat.render(entry.reply));
    reply.appendChild(text);
    return reply;
  }

  // Only ordinary web links (the server checks this too).
  function safeUrl(value) {
    try {
      var url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
    } catch (e) {
      return null;
    }
  }

  // "Page 2 of 5 (43 messages)" on one side, page numbers on the other: [1] 2 3 ... with arrows.
  function renderPager(pager, data, bottom) {
    pager.textContent = "";
    if (!data.total) return;
    pager.appendChild(element("span", "gb-page-info",
      "Page " + data.page + " of " + data.pages + " (" + data.total + (data.total === 1 ? " message)" : " messages)")));
    if (data.pages <= 1) return;
    var links = element("span", "gb-page-links");
    function pageLink(label, page, title) {
      var button = element("button", "gb-page", label);
      button.type = "button";
      if (title) {
        button.title = title;
        button.setAttribute("aria-label", title);  // so screen readers don't read the arrows as "black triangle"
      } else {
        button.setAttribute("aria-label", "Page " + page);
      }
      button.addEventListener("click", function () {
        // The pager is redrawn, so the clicked button is gone: put the keyboard focus on the new entries instead.
        load(page).then(function () {
          if (bottom) list.scrollIntoView();
          list.focus({ preventScroll: true });
        });
      });
      links.appendChild(button);
    }
    if (data.page > 1) pageLink("◀", data.page - 1, "Newer messages");
    // Every page number near the current one, plus the first and last.
    var shown = 0;
    for (var page = 1; page <= data.pages; page++) {
      if (page === 1 || page === data.pages || Math.abs(page - data.page) <= 2) {
        if (shown && page - shown > 1) links.appendChild(element("span", null, "..."));
        if (page === data.page) links.appendChild(element("b", "gb-page-current", "[" + page + "]"));
        else pageLink(String(page), page);
        shown = page;
      }
    }
    if (data.page < data.pages) pageLink("▶", data.page + 1, "Older messages");
    pager.appendChild(links);
  }

  // ---------- Signing ----------

  function newQuestion() {
    var question = document.getElementById("gb-question");
    form.elements.answer.value = "";
    return request("GET", "/challenge").then(function (data) {
      token = data.token;
      question.textContent = data.question;
    }).catch(function () {
      question.textContent = "(couldn't load the question, try reloading the page)";
    });
  }

  if (form) {
    var fields = form.elements;
    var status = document.getElementById("gb-status");
    var button = form.querySelector("button[type=submit]");
    fields.message.parentNode.insertBefore(GuestbookFormat.toolbar(fields.message), fields.message);

    // Preview: the message as it'll look on the guestbook (the same box renderEntry makes), kept up to date while
    // it's open.
    var preview = document.getElementById("gb-preview");
    var previewButton = document.getElementById("gb-preview-button");
    function showPreview() {
      if (preview.hidden) return;
      var homepage = fields.homepage.value.trim();
      if (homepage && !/^[a-z][a-z0-9+.-]*:/i.test(homepage)) homepage = "https://" + homepage;  // like the server does
      preview.textContent = "";
      preview.appendChild(element("p", "gb-preview-title", "Preview:"));
      preview.appendChild(renderEntry({
        name: fields.name.value.trim(),
        homepage: homepage,
        message: fields.message.value.trim() || "(your message shows here)",
        created: new Date().toISOString()
      }));
    }
    previewButton.addEventListener("click", function () {
      preview.hidden = !preview.hidden;
      previewButton.textContent = preview.hidden ? "Preview" : "Hide preview";
      previewButton.setAttribute("aria-expanded", String(!preview.hidden));
      showPreview();
    });
    form.addEventListener("input", showPreview);
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      // The required (*) fields. Saying what's missing here, in words, instead of the browser's pop-ups.
      var missing = !fields.message.value.trim() ? "Oops, you forgot to write a message!"
        : !fields.answer.value.trim() ? "Oops, you forgot to answer the math question!" : null;
      if (missing) {
        status.className = "gb-status gb-error";
        status.textContent = missing;
        return;
      }
      button.disabled = true;
      status.className = "gb-status";
      status.textContent = "Sending...";
      request("POST", "/entries", {
        name: fields.name.value,
        homepage: fields.homepage.value,
        message: fields.message.value,
        website: fields.website.value,
        answer: fields.answer.value,
        token: token
      }).then(function () {
        // Swap the form for a thank-you, with a link to the entries.
        form.hidden = true;
        var thanks = element("p", "gb-thanks", "Thanks for signing!");
        thanks.appendChild(document.createElement("br"));
        var view = element("a", null, "View Guestbook >>");
        view.href = root.dataset.view;
        thanks.appendChild(view);
        thanks.tabIndex = -1;  // the Send button just vanished, so the keyboard focus moves here
        form.parentNode.appendChild(thanks);
        thanks.focus();
      }).catch(function (error) {
        status.className = "gb-status gb-error";
        status.textContent = error.message;
      }).then(function () {
        button.disabled = false;
        newQuestion();  // each question works once
      });
    });
    newQuestion();
  }

  if (list) load(1);
})();
