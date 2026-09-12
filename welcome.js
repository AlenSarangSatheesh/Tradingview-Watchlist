// welcome.js
// Handles YouTube video redirection (avoids Error 153), TradingView launches,
// image lightbox zooming, and active navigation spy.

(function () {
  "use strict";

  const YOUTUBE_URL = "https://youtu.be/l0Yg0iohA30";
  const TRADINGVIEW_URL = "https://www.tradingview.com/chart/";

  // --- SAFE TAB OPENERS ---
  function openUrl(url, e) {
    if (e && typeof e.preventDefault === "function") {
      e.preventDefault();
    }
    if (typeof chrome !== "undefined" && chrome.tabs && typeof chrome.tabs.create === "function") {
      chrome.tabs.create({ url: url });
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  // Video links
  const player = document.getElementById("player");
  if (player) {
    player.addEventListener("click", (e) => openUrl(YOUTUBE_URL, e));
    player.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
        openUrl(YOUTUBE_URL, e);
      }
    });
  }

  const watchYtHeaderBtn = document.getElementById("watchYtHeaderBtn");
  if (watchYtHeaderBtn) {
    watchYtHeaderBtn.addEventListener("click", (e) => openUrl(YOUTUBE_URL, e));
  }

  // TradingView launch buttons
  const tvButtons = [
    document.getElementById("openTvBtnNav"),
    document.getElementById("heroOpenTvBtn")
  ];

  tvButtons.forEach((btn) => {
    if (btn) {
      btn.addEventListener("click", (e) => openUrl(TRADINGVIEW_URL, e));
    }
  });

  // --- FULLSCREEN SCREENSHOT LIGHTBOX ---
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightboxImg");
  const lightboxCaption = document.getElementById("lightboxCaption");
  const lightboxClose = document.getElementById("lightboxClose");

  function openLightbox(src, caption) {
    if (!lightbox || !lightboxImg) return;
    lightboxImg.src = src;
    if (lightboxCaption) {
      lightboxCaption.textContent = caption || "";
      lightboxCaption.style.display = caption ? "block" : "none";
    }
    lightbox.classList.add("active");
    lightbox.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeLightbox() {
    if (!lightbox) return;
    lightbox.classList.remove("active");
    lightbox.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (lightboxImg) lightboxImg.src = "";
  }

  const shotBoxes = document.querySelectorAll(".shot-box[data-lightbox]");
  shotBoxes.forEach((box) => {
    box.addEventListener("click", () => {
      const src = box.getAttribute("data-lightbox");
      const caption = box.getAttribute("data-caption");
      if (src) openLightbox(src, caption);
    });
    box.setAttribute("tabindex", "0");
    box.setAttribute("role", "button");
    box.setAttribute("aria-label", "Click to enlarge screenshot");
    box.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const src = box.getAttribute("data-lightbox");
        const caption = box.getAttribute("data-caption");
        if (src) openLightbox(src, caption);
      }
    });
  });

  if (lightboxClose) {
    lightboxClose.addEventListener("click", closeLightbox);
  }

  if (lightbox) {
    lightbox.addEventListener("click", (e) => {
      if (e.target === lightbox) {
        closeLightbox();
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && lightbox && lightbox.classList.contains("active")) {
      closeLightbox();
    }
  });

  // --- ACTIVE SCROLL SPY FOR NAVIGATION (if present) ---
  const navLinks = document.querySelectorAll(".topbar .nav-link");
  if (navLinks.length > 0) {
    const sections = Array.from(navLinks)
      .map((link) => {
        const id = link.getAttribute("href");
        if (id && id.startsWith("#")) {
          const el = document.querySelector(id);
          if (el) return { link, el };
        }
        return null;
      })
      .filter(Boolean);

    function updateActiveNav() {
      const scrollPos = window.scrollY + 120;
      for (let i = sections.length - 1; i >= 0; i--) {
        const { link, el } = sections[i];
        if (el.offsetTop <= scrollPos) {
          navLinks.forEach((l) => l.classList.remove("active"));
          link.classList.add("active");
          return;
        }
      }
    }

    window.addEventListener("scroll", updateActiveNav, { passive: true });
    updateActiveNav();
  }
})();
