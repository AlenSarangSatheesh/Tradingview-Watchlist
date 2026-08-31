// Welcome page: self-hosted tutorial video, played inline.
// Kept in an external file because MV3's default extension CSP blocks inline
// scripts and inline event handlers on chrome-extension:// pages.
(function () {
  "use strict";

  var player = document.getElementById("player");
  var video = document.getElementById("video");
  if (!player || !video) return;

  var started = false;

  function play() {
    if (started) return;
    started = true;

    video.controls = true;
    player.classList.add("playing");
    player.removeAttribute("role");
    player.removeAttribute("tabindex");
    player.removeAttribute("aria-label");

    var p = video.play();
    if (p && typeof p.catch === "function") {
      // Autoplay-with-sound can be blocked; fall back to showing controls so
      // the user can start it with the native play button.
      p.catch(function () {});
    }
  }

  player.addEventListener("click", function (e) {
    // Once native controls are showing, let them handle clicks (pause/seek).
    if (started) return;
    e.preventDefault();
    play();
  });

  player.addEventListener("keydown", function (e) {
    if (started) return;
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      play();
    }
  });
})();
