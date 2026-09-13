// -------------------------------------------------------------
// UNLIMITED WATCHLISTS FOR TRADINGVIEW — SITE INTERACTIONS
// Mobile navigation, FAQ accordion, and image lightbox zoom.
// -------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  // Mobile Navigation Drawer
  const menuToggle = document.querySelector('.menu-toggle');
  const siteNav = document.querySelector('.site-nav');

  if (menuToggle && siteNav) {
    menuToggle.addEventListener('click', () => {
      const isOpen = siteNav.classList.toggle('open');
      menuToggle.setAttribute('aria-expanded', isOpen);
      menuToggle.innerHTML = isOpen ? '&times;' : '&#9776;';
    });

    // Close menu when clicking a link
    siteNav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        siteNav.classList.remove('open');
        if (menuToggle) {
          menuToggle.setAttribute('aria-expanded', 'false');
          menuToggle.innerHTML = '&#9776;';
        }
      });
    });
  }

  // FAQ Accordion
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const questionBtn = item.querySelector('.faq-question');
    if (questionBtn) {
      questionBtn.addEventListener('click', () => {
        const isOpen = item.classList.contains('open');
        // Optional: close other open items
        faqItems.forEach(other => {
          if (other !== item) other.classList.remove('open');
        });
        item.classList.toggle('open', !isOpen);
      });
    }
  });

  // Screenshot Lightbox Zoom
  const shotBoxes = document.querySelectorAll('.shot-box, [data-lightbox]');
  if (shotBoxes.length > 0) {
    let lightbox = document.getElementById('siteLightbox');
    if (!lightbox) {
      lightbox = document.createElement('div');
      lightbox.id = 'siteLightbox';
      lightbox.className = 'lightbox-modal';
      lightbox.innerHTML = `
        <div class="lightbox-content">
          <button class="lightbox-close" aria-label="Close dialog">&times;</button>
          <img src="" alt="Zoomed screenshot">
          <div class="lightbox-caption"></div>
        </div>
      `;
      document.body.appendChild(lightbox);
    }

    const modalImg = lightbox.querySelector('img');
    const modalCaption = lightbox.querySelector('.lightbox-caption');
    const closeBtn = lightbox.querySelector('.lightbox-close');

    function openLightbox(src, caption) {
      modalImg.src = src;
      modalCaption.textContent = caption || '';
      modalCaption.style.display = caption ? 'block' : 'none';
      lightbox.classList.add('active');
      document.body.style.overflow = 'hidden';
    }

    function closeLightbox() {
      lightbox.classList.remove('active');
      document.body.style.overflow = '';
    }

    shotBoxes.forEach(box => {
      box.addEventListener('click', () => {
        const img = box.querySelector('img');
        const customSrc = box.getAttribute('data-lightbox');
        const src = customSrc || (img ? img.src : null);
        const caption = box.getAttribute('data-caption') || (box.querySelector('.shot-caption span') ? box.querySelector('.shot-caption span').textContent : (img ? img.alt : ''));
        if (src) {
          openLightbox(src, caption);
        }
      });
    });

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeLightbox();
    });

    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox || e.target.classList.contains('lightbox-content')) {
        closeLightbox();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && lightbox.classList.contains('active')) {
        closeLightbox();
      }
    });
  }

  // Video Player interactive handler
  // (Safely opens YouTube in new tab on file:// to avoid YouTube Error 153, and seamlessly embeds on web protocols)
  const videoPlayer = document.getElementById('player');
  const videoStage = document.getElementById('videoStage');
  if (videoPlayer && videoStage) {
    videoPlayer.addEventListener('click', (e) => {
      const isFileProtocol = window.location.protocol === 'file:';
      if (isFileProtocol) {
        // Local file protocol: YouTube blocks iframe embeds with Error 153.
        // Let the default link behavior with target="_blank" cleanly open YouTube.
        return;
      }

      // On http/https web servers: embed and autoplay smoothly
      e.preventDefault();
      videoStage.innerHTML = `
        <div class="video-embed-wrap" style="margin-bottom: 0;">
          <iframe
            src="https://www.youtube-nocookie.com/embed/ihZVp78aBSA?autoplay=1&rel=0&modestbranding=1"
            title="Unlimited Watchlists for TradingView Tutorial Video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen>
          </iframe>
        </div>
      `;
    });
  }
});
