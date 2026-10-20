// The guestbook's admin page (guestbook-admin.html): log in with the admin password to get reply and delete buttons
// on each entry. Builds on guestbook.js (which shows the entries) and guestbook-format.js (formatting buttons).
//
// The password is checked by the guestbook's server, never here, so this page is safe for anyone to find. The
// server answers a correct password with a token good for 12 hours, kept only until this tab is closed.
(function () {
  var Guestbook = window.Guestbook;
  if (!Guestbook) return;
  var login = document.getElementById("gb-login");
  var status = document.getElementById("gb-login-status");
  var signedIn = document.getElementById("gb-signed-in");

  function getToken() {
    try { return sessionStorage.getItem("guestbook-admin"); } catch (e) { return null; }
  }
  function setToken(token) {
    try {
      if (token) sessionStorage.setItem("guestbook-admin", token);
      else sessionStorage.removeItem("guestbook-admin");
    } catch (e) {}
    login.hidden = !!token;
    signedIn.hidden = !token;
  }

  // Runs an admin request, then reloads the entries. A "log in again" error logs out.
  function adminRequest(method, path, body) {
    return Guestbook.request(method, path, body, getToken()).then(function () {
      return Guestbook.load(Guestbook.page);
    }).catch(function (error) {
      alert(error.message);
      if (/log in/i.test(error.message)) logOut();
    });
  }

  function adminButton(label, onClick) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "gb-admin-button";
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  Guestbook.decorate = function (box, entry) {
    if (!getToken()) return;
    var title = box.querySelector(".box-title"), body = box.querySelector(".entry-body");
    title.appendChild(adminButton(entry.reply ? "edit reply" : "reply", function () { openEditor(body, entry); }));
    title.appendChild(adminButton("delete", function () {
      if (confirm("Delete the message from " + (entry.name || "Anonymous") + "?")) {
        adminRequest("DELETE", "/admin/entries/" + entry.id);
      }
    }));
  };

  // A box for writing (or changing) the reply, under the message.
  function openEditor(body, entry) {
    if (body.querySelector(".gb-reply-editor")) return;
    var editor = document.createElement("div");
    editor.className = "gb-reply gb-reply-editor";
    var textarea = document.createElement("textarea");
    textarea.rows = 4;
    textarea.maxLength = 2000;
    textarea.value = entry.reply || "";
    textarea.setAttribute("aria-label", "Your reply");
    editor.appendChild(GuestbookFormat.toolbar(textarea));
    editor.appendChild(textarea);

    var buttons = document.createElement("div");
    buttons.className = "gb-submit";
    buttons.appendChild(adminButton("Save reply", function () {
      adminRequest("PUT", "/admin/entries/" + entry.id + "/reply", { reply: textarea.value });
    }));
    if (entry.reply) {
      buttons.appendChild(adminButton("Remove reply", function () {
        if (confirm("Remove your reply?")) adminRequest("PUT", "/admin/entries/" + entry.id + "/reply", { reply: "" });
      }));
    }
    var existing = body.querySelector(".gb-reply");
    buttons.appendChild(adminButton("Cancel", function () {
      editor.remove();
      if (existing) existing.hidden = false;
    }));
    editor.appendChild(buttons);

    if (existing) existing.hidden = true;  // the editor takes its place
    body.appendChild(editor);
    textarea.focus();
  }

  function logOut() {
    setToken(null);
    Guestbook.load(Guestbook.page);
  }

  login.addEventListener("submit", function (event) {
    event.preventDefault();
    if (!login.elements.password.value) {
      status.textContent = "Please type the password.";
      return;
    }
    status.textContent = "Checking...";
    Guestbook.request("POST", "/admin/login", { password: login.elements.password.value }).then(function (data) {
      login.reset();
      status.textContent = "";
      setToken(data.token);
      Guestbook.load(Guestbook.page);
    }).catch(function (error) {
      login.reset();
      status.textContent = error.message;
    });
  });
  document.getElementById("gb-log-out").addEventListener("click", logOut);

  setToken(getToken());
  Guestbook.load(Guestbook.page);  // again, now with the buttons if logged in
})();
