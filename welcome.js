// Welcome page: inline YouTube player (click-to-play).
// Kept in an external file because MV3's default extension CSP blocks inline
// scripts and inline event handlers on chrome-extension:// pages.
(function () {
  "use strict";

  var VIDEO_ID = "l0Yg0iohA30";
  var player = document.getElementById("player");
  if (!player) return;

  var started = false;

  function play() {
    if (started) return;
    started = true;

    var iframe = document.createElement("iframe");
    iframe.src =
      "https://www.youtube-nocookie.com/embed/" + VIDEO_ID +
      "?autoplay=1&rel=0&modestbranding=1&playsinline=1";
    iframe.title = "Unlimited Watchlists for TradingView tutorial";
    iframe.setAttribute(
      "allow",
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    );
    iframe.setAttribute("allowfullscreen", "");
    iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");

    player.innerHTML = "";
    player.appendChild(iframe);
    player.classList.add("playing");
    player.removeAttribute("role");
    player.removeAttribute("tabindex");
    player.removeAttribute("aria-label");
  }

  player.addEventListener("click", play);
  player.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      play();
    }
  });
})();
