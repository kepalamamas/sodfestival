jQuery(document).ready(function ($) {

  // Back to top button
  $(window).scroll(function () {
    if ($(this).scrollTop() > 100) {
      $('.back-to-top').fadeIn('slow');
    } else {
      $('.back-to-top').fadeOut('slow');
    }
  });
  $('.back-to-top').click(function () {
    $('html, body').animate({ scrollTop: 0 }, 1500, 'easeInOutExpo');
    return false;
  });

  // Header fixed on scroll
  $(window).scroll(function () {
    if ($(this).scrollTop() > 100) {
      $('#header').addClass('header-scrolled');
    } else {
      $('#header').removeClass('header-scrolled');
    }
  });

  if ($(window).scrollTop() > 100) {
    $('#header').addClass('header-scrolled');
  }

  // Real view height for mobile devices
  if (window.matchMedia("(max-width: 767px)").matches) {
    $('#intro').css({ height: $(window).height() });
  }

  // Initiate the wowjs animation library
  new WOW().init();

  // Initialize Venobox
  $('.venobox').venobox({
    bgcolor: '',
    overlayColor: 'rgba(6, 12, 34, 0.85)',
    closeBackground: '',
    closeColor: '#fff'
  });

  // Initiate superfish on nav menu
  $('.nav-menu').superfish({
    animation: {
      opacity: 'show'
    },
    speed: 400
  });

  // Mobile Navigation
  if ($('#nav-menu-container').length) {
    var $mobile_nav = $('#nav-menu-container').clone().prop({
      id: 'mobile-nav'
    });
    $mobile_nav.find('> ul').attr({
      'class': '',
      'id': ''
    });
    $('body').append($mobile_nav);
    $('body').prepend('<button type="button" id="mobile-nav-toggle"><i class="bi bi-list"></i></button>');
    $('body').append('<div id="mobile-body-overly"></div>');
    $('#mobile-nav').find('.menu-has-children').prepend('<i class="bi bi-chevron-down"></i>');

    $(document).on('click', '.menu-has-children i', function (e) {
      $(this).next().toggleClass('menu-item-active');
      $(this).nextAll('ul').eq(0).slideToggle();
      $(this).toggleClass("bi-chevron-up bi-chevron-down");
    });

    $(document).on('click', '#mobile-nav-toggle', function (e) {
      $('body').toggleClass('mobile-nav-active');
      $('#mobile-nav-toggle i').toggleClass('bi-x-lg bi-list');
      $('#mobile-body-overly').toggle();
    });

    $(document).click(function (e) {
      var container = $("#mobile-nav, #mobile-nav-toggle");
      if (!container.is(e.target) && container.has(e.target).length === 0) {
        if ($('body').hasClass('mobile-nav-active')) {
          $('body').removeClass('mobile-nav-active');
          $('#mobile-nav-toggle i').toggleClass('bi-x-lg bi-list');
          $('#mobile-body-overly').fadeOut();
        }
      }
    });
  } else if ($("#mobile-nav, #mobile-nav-toggle").length) {
    $("#mobile-nav, #mobile-nav-toggle").hide();
  }

  // Smooth scroll for the menu and links with .scrollto classes
  $('.nav-menu a, #mobile-nav a, .scrollto').on('click', function () {
    if (location.pathname.replace(/^\//, '') == this.pathname.replace(/^\//, '') && location.hostname == this.hostname) {
      var target = $(this.hash);
      if (target.length) {
        var top_space = 0;

        if ($('#header').length) {
          top_space = $('#header').outerHeight();

          if (!$('#header').hasClass('header-fixed')) {
            top_space = top_space - 20;
          }
        }

        $('html, body').animate({
          scrollTop: target.offset().top - top_space
        }, 1500, 'easeInOutExpo');

        if ($(this).parents('.nav-menu').length) {
          $('.nav-menu .menu-active').removeClass('menu-active');
          $(this).closest('li').addClass('menu-active');
        }

        if ($('body').hasClass('mobile-nav-active')) {
          $('body').removeClass('mobile-nav-active');
          $('#mobile-nav-toggle i').toggleClass('bi-x-lg bi-list');
          $('#mobile-body-overly').fadeOut();
        }
        return false;
      }
    }
  });

  // Gallery carousel (uses Flickity library)
  var $carousel = $('.gallery-carousel').flickity({
    cellAlign: 0.58, // Offset to center the gap between two center cards (dual-center)
    contain: true,
    wrapAround: true,
    prevNextButtons: false,
    pageDots: false,
    groupCells: false,
    draggable: true,
    freeScroll: false,
    cellSelector: '.carousel-cell',
    setGallerySize: true,
    adaptiveHeight: false,
    friction: 0.28,
    selectedAttraction: 0.025,
    on: {
      ready: function () {
        // Adjust cells on ready
        $(window).trigger('resize')
        updateAdjacentCells();
      },
      change: function () {
        updateAdjacentCells();
      },
      settle: function () {
        updateAdjacentCells();
      }
    }
  });

  // Mark cells with 5-tier scaling (dual-center approach)
  function updateAdjacentCells() {
    var $cells = $('.gallery-carousel .carousel-cell');
    var $selected = $('.gallery-carousel .carousel-cell.is-selected');
    var selectedIndex = $selected.index();

    // Remove all scaling classes
    $cells.removeClass('is-center-companion is-near is-far is-furthest');

    if (selectedIndex >= 0) {
      var totalCells = $cells.length;

      // Mark cells based on position relative to selected
      $cells.each(function (index) {
        var distance = index - selectedIndex;

        // Handle wrap-around for infinite scroll
        if (Math.abs(distance) > totalCells / 2) {
          distance = distance > 0 ? distance - totalCells : distance + totalCells;
        }

        // Apply classes based on distance from selected
        if (distance === -1) {
          // Previous cell is also center (dual-center, left side)
          $(this).addClass('is-center-companion');
        } else if (distance === 1 || distance === -2) {
          // Immediate neighbors of the dual-center
          $(this).addClass('is-near');
        } else if (distance === 2 || distance === -3) {
          // Second-level neighbors
          $(this).addClass('is-far');
        } else if (Math.abs(distance) >= 3 || distance <= -4) {
          // Furthest cells
          $(this).addClass('is-furthest');
        }
      });
    }
  }

  // Update cells per viewport on window resize
  function updateCarouselCells() {
    var windowWidth = $(window).width();
    var cellsToShow = windowWidth < 768 ? 3 : 6;

    // Destroy and reinitialize with new settings
    var flickityData = $carousel.data('flickity');
    if (flickityData) {
      // Use offset alignment for dual-center on desktop, center for mobile
      flickityData.options.cellAlign = windowWidth < 768 ? 'center' : 0.58;
      flickityData.resize();
      updateAdjacentCells();
    }
  }

  $(window).on('resize', updateCarouselCells);
  updateCarouselCells();

  // Custom navigation button handlers
  $('.gallery-prev').on('click', function () {
    $carousel.flickity('previous');
  });

  $('.gallery-next').on('click', function () {
    $carousel.flickity('next');
  });

  // Buy tickets select the ticket type on click
  $('#buy-ticket-modal').on('show.bs.modal', function (event) {
    var button = $(event.relatedTarget);
    var ticketType = button.data('ticket-type');
    var modal = $(this);
    modal.find('#ticket-type').val(ticketType);
  })

  // custom code

  // PRESALE2 BUY BUTTON: fetch status and toggle
  var $ticketButtons = $('.ticket-open-button');
  if (!$ticketButtons.length) return;

  // Ensure all matching buttons are disabled until we know the status
  $ticketButtons.each(function () {
    $(this).prop('disabled', true).attr('disabled', 'disabled').attr('aria-disabled', 'true');
  });

  fetch('https://sodtix.com/api/v1/public-events/link-url/3be7a6aa')
    .then(function (res) { return res.json(); })
    .then(function (json) {
      if (json && json.success && json.data && json.data.isOpen) {
        var url = json.data.link_url || null;
        if (url) {
          $ticketButtons.each(function () {
            $(this).prop('disabled', false).removeAttr('disabled').attr('aria-disabled', 'false');
          });
          $ticketButtons.off('click').on('click', function () { window.open(url, '_blank'); });
        }
      } else {
        $ticketButtons.each(function () {
          $(this).prop('disabled', true).attr('disabled', 'disabled').attr('aria-disabled', 'true');
        });
      }
    })
    .catch(function (err) {
      console.error('Error fetching presale2 status', err);
    });

});
