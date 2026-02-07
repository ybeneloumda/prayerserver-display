/*
Application logic for prayer times display.
This script handles:
- Loading and saving settings to localStorage
- Getting location via Geolocation API or manual input
- Computing prayer times using the PrayTime library
- Determining the next upcoming event (adhan or iqamah) and countdown
- Displaying Gregorian and Hijri dates, and local time
- Rendering the UI, including prayer cards, countdown, ticker, and handling RTL
- Managing the admin panel for user settings
*/



let settings = {};
let prayTime;
let tickInterval;
let recomputeTimeout;
let nextEvent = null;

// Global timer for rotating slideshow phrases and index tracker.
let slideshowTimer = null;
let slideshowIndex = 0;

// In-memory storage for fetched slideshow phrases when using online sources. This
// array is populated by fetchSlideshowIfNeeded() and used by setupSlideshow().
let slideshowData = [];

// Global timer for scheduling weather updates when in online mode.
let weatherTimer = null;


// Translation strings


// Map Arabic-Indic digits to Latin digits for Arabic displays. This helper is used
// to ensure numeric values remain in Latin digits when Arabic language is selected.
const arabicIndic = '٠١٢٣٤٥٦٧٨٩';
const latinDigitsStr = '0123456789';
function toLatinDigits(str) {
  return str.replace(/[٠-٩]/g, d => latinDigitsStr[arabicIndic.indexOf(d)]);
}

// Map a textual weather condition to a representative emoji. This helper is
// used when no custom weather icon is provided. It scans the condition string
// for keywords and returns an appropriate emoji. Defaults to a thermometer
// icon when no match is found.
function getWeatherEmoji(condition) {
  // Always return a default thermometer emoji when condition is absent
  // so that some icon is displayed even when no textual condition is provided.
  if (!condition) return '🌡️';
  const cond = condition.toLowerCase();
  if (cond.includes('thunder') || cond.includes('storm')) return '⛈️';
  if (cond.includes('rain') || cond.includes('shower') || cond.includes('drizzle')) return '🌧️';
  if (cond.includes('snow')) return '❄️';
  if (cond.includes('fog') || cond.includes('mist') || cond.includes('haze')) return '🌫️';
  if (cond.includes('cloud')) {
    return cond.includes('partly') || cond.includes('scattered') ? '🌤️' : '☁️';
  }
  if (cond.includes('sun') || cond.includes('clear')) return '☀️';
  return '🌡️';
}

// Utility to load settings from database-backed storage or defaults
function loadSettings() {
  try {
    const saved = getSetting("prayerSettings", null);
    if (saved && typeof saved === "string") {
      settings = Object.assign({}, defaultSettings, JSON.parse(saved));
    } else if (saved && typeof saved === "object") {
      settings = Object.assign({}, defaultSettings, saved);
    } else {
      settings = Object.assign({}, defaultSettings);
    }
  } catch (e) {
    settings = Object.assign({}, defaultSettings);
  }
  settings.serverIp = settings.serverIp || "prayerserver";
  settings.serverPort = settings.serverPort || "80";
  settings.serverSecured = settings.serverSecured || "https";
  if (typeof settings.showSunrise === 'string') {
    settings.showSunrise = settings.showSunrise.toLowerCase() === 'true';
  }
  // Ensure perIqamah object has all keys
  const prayers = ["Fajr","Dhuhr","Asr","Maghrib","Isha"];
  if (!settings.perIqamah) settings.perIqamah = {};
  prayers.forEach(p => {
    if (!settings.perIqamah[p]) settings.perIqamah[p] = "";
  });
}

// Save settings to database-backed storage
function saveSettings() {
  setSetting("prayerSettings", JSON.stringify(settings));
}

// Apply CSS variables based on settings
function applyLayout() {
  document.documentElement.style.setProperty('--card-height', settings.cardHeight + 'px');
  document.documentElement.style.setProperty('--card-max-width', settings.cardMaxWidth + 'px');
  document.documentElement.style.setProperty('--gap', settings.gap + 'px');
  // Apply logo height as a CSS variable in rem units. Convert numeric
  // user setting to rem (default 3). If value is non-numeric, fall back to default.
  const logoH = parseFloat(settings.logoHeight);
  const logoRem = isFinite(logoH) && logoH > 0 ? logoH : defaultSettings.logoHeight;
  document.documentElement.style.setProperty('--logo-height', logoRem + 'rem');

  // Apply font family and size/scale variables based on settings. Fallback to
  // defaults if values are invalid.
  if (settings.fontFamily) {
    document.documentElement.style.setProperty('--font-family', settings.fontFamily);
  }
  const clockSize = parseFloat(settings.clockSize);
  document.documentElement.style.setProperty('--clock-size', (isFinite(clockSize) && clockSize > 0 ? clockSize : defaultSettings.clockSize) + 'rem');
  const nextSize = parseFloat(settings.nextEventSize);
  document.documentElement.style.setProperty('--next-event-size', (isFinite(nextSize) && nextSize > 0 ? nextSize : defaultSettings.nextEventSize) + 'rem');
  const slideSize = parseFloat(settings.slideshowSize);
  document.documentElement.style.setProperty('--slideshow-size', (isFinite(slideSize) && slideSize > 0 ? slideSize : defaultSettings.slideshowSize) + 'rem');
  // Scale factors for card text
  const nameScale = parseFloat(settings.cardNameScale);
  document.documentElement.style.setProperty('--card-name-scale', isFinite(nameScale) && nameScale > 0 ? nameScale : defaultSettings.cardNameScale);
  const timeScale = parseFloat(settings.cardTimeScale);
  document.documentElement.style.setProperty('--card-time-scale', isFinite(timeScale) && timeScale > 0 ? timeScale : defaultSettings.cardTimeScale);
  const iqamahScale = parseFloat(settings.cardIqamahScale);
  document.documentElement.style.setProperty('--card-iqamah-scale', isFinite(iqamahScale) && iqamahScale > 0 ? iqamahScale : defaultSettings.cardIqamahScale);

  // Slideshow margin (vertical spacing) variables
  const sTop = parseFloat(settings.slideshowMarginTop);
  document.documentElement.style.setProperty('--slideshow-margin-top', (isFinite(sTop) ? sTop : defaultSettings.slideshowMarginTop) + 'px');
  const sBottom = parseFloat(settings.slideshowMarginBottom);
  document.documentElement.style.setProperty('--slideshow-margin-bottom', (isFinite(sBottom) ? sBottom : defaultSettings.slideshowMarginBottom) + 'px');

  // Apply ticker and footer size settings
  const tickerSize = parseFloat(settings.tickerSize);
  document.documentElement.style.setProperty('--ticker-size', (isFinite(tickerSize) && tickerSize > 0 ? tickerSize : defaultSettings.tickerSize) + 'rem');
  const footerHeight = parseFloat(settings.footerHeight);
  document.documentElement.style.setProperty('--footer-height', (isFinite(footerHeight) && footerHeight > 0 ? footerHeight : defaultSettings.footerHeight) + 'rem');

  // Set vertical alignment for slideshow text. If the element exists, update
  // its alignItems property based on the saved setting (flex-start, center, flex-end).
  const slideshowEl = document.getElementById('slideshow');
  if (slideshowEl) {
    const validAligns = ['flex-start','center','flex-end'];
    slideshowEl.style.alignItems = validAligns.includes(settings.slideshowAlign) ? settings.slideshowAlign : 'center';
  }

  // Apply header and board alignment.  When headerAlign is 'space-between', we keep default 'space-between'; otherwise use flex-start, center or flex-end.
  const header = document.querySelector('header');
  if (header) {
    // map 'end' to 'flex-end' for flexbox
    const map = {"start":"flex-start","center":"center","end":"flex-end","space-between":"space-between"};
    header.style.justifyContent = map[settings.headerAlign] || 'space-between';
  }
  const board = document.getElementById('cards-container');
  if (board) {
    // For grid container, align items horizontally using justifyContent; 'start' -> flex-start; 'center' -> center
    const map2 = {"start":"flex-start","center":"center"};
    board.style.justifyContent = map2[settings.boardAlign] || 'flex-start';
  }

  // Apply UX/UI settings
  applyUXUISettings();
}

// Apply UX/UI settings (theme, animations, accessibility, etc.)
function applyUXUISettings() {
  // Apply theme
  const theme = settings.theme || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  
  // Update theme toggle button icon
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.innerHTML = theme === 'dark' ? '🌙' : theme === 'light' ? '☀️' : '⚡';
  }
  
  // Apply font size multiplier
  const fontSize = parseFloat(settings.fontSize) || 1;
  document.documentElement.style.fontSize = `${fontSize * 16}px`;
  
  // Apply animation settings
  const enableAnimations = settings.enableAnimations !== false;
  const enableHoverEffects = settings.enableHoverEffects !== false;
  const enableLoadingStates = settings.enableLoadingStates !== false;
  const enableAccessibility = settings.enableAccessibility !== false;
  const enableProgressIndicator = settings.enableProgressIndicator !== false;
  
  // Toggle CSS classes based on settings
  document.body.classList.toggle('no-animations', !enableAnimations);
  document.body.classList.toggle('no-hover-effects', !enableHoverEffects);
  document.body.classList.toggle('no-loading-states', !enableLoadingStates);
  document.body.classList.toggle('no-accessibility', !enableAccessibility);
  document.body.classList.toggle('no-progress-indicator', !enableProgressIndicator);
  

  
  // Show/hide progress indicators on prayer cards
  const prayerCards = document.querySelectorAll('.prayer-card');
  prayerCards.forEach(card => {
    const progressRing = card.querySelector('.progress-ring');
    if (progressRing) {
      progressRing.style.display = enableProgressIndicator ? 'block' : 'none';
    }
  });
  
  // Show/hide settings controls
  const showSettingsControls = settings.showSettingsControls === true;
  const settingsControls = document.getElementById('settings-controls');
  const fontControls = document.getElementById('font-controls');
  
  if (settingsControls) {
    settingsControls.style.display = showSettingsControls ? 'flex' : 'none';
  }
  
  // Show/hide share button within settings controls
  const shareBtn = document.getElementById('share-btn');
  if (shareBtn) {
    shareBtn.style.display = settings.prayerSharing ? 'flex' : 'none';
  }
  
  // Show/hide Qibla indicator (positioned above settings controls)
  const qiblaIndicator = document.getElementById('qibla-indicator');
  if (qiblaIndicator) {
    qiblaIndicator.style.display = (settings.qiblaDirection && showSettingsControls) ? 'flex' : 'none';
  }
}

// Function to initialize or re-initialize prayer times and UI
function init() {
  // Clear any running intervals/timeouts
  if (tickInterval) clearInterval(tickInterval);
  if (recomputeTimeout) clearTimeout(recomputeTimeout);
  
  applyLayout();
  
  // Determine timezone default if not set
  if (!settings.timezone) {
    settings.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  }

  // Initialize PrayTime with selected method
  prayTime = new PrayTime(settings.calculationMethod);
  // Set Asr method
  prayTime.adjust({asr: settings.asrMethod});
  // We'll compute times ourselves in 'x' format to get timestamps
  
  // If using auto mode, attempt geolocation
  if (settings.mode === "auto") {
    navigator.geolocation.getCurrentPosition(pos => {
      settings.latitude = pos.coords.latitude;
      settings.longitude = pos.coords.longitude;
      // timezone detection (IANA)
      try {
        settings.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      } catch (e) {
        // fallback remains
      }
      saveSettings();
      computeAndRender();
    }, err => {
      // geolocation failed; show subtle warning on screen and fall back to manual mode
      console.warn("Geolocation error:", err.message);
      showGeoWarning(err.message || "Geolocation denied. Please set location manually.");
      settings.mode = "manual";
      computeAndRender();
    });
  } else {
    computeAndRender();
  }
  
  // Setup tick interval for clock and countdown
  tickInterval = setInterval(() => {
    updateClockAndCountdown();
  }, 1000);

  // Render weather immediately on init so the display appears without waiting for
  // the first tick. Subsequent updates occur in updateClockAndCountdown().
  renderWeather();

  // If weather is configured for online mode, perform an immediate fetch
  // and schedule subsequent updates based on validity period.
  fetchWeatherIfOnline();
  scheduleWeatherUpdates();
  
  // Force weather fetch if no data exists yet
  if (settings.weatherEnabled && settings.weatherMode === 'online' && !settings.weatherLastUpdated) {
    console.log('Weather: No previous data, forcing immediate fetch');
    setTimeout(() => fetchWeatherIfOnline(), 1000);
  }
}

// Compute prayer times for today and tomorrow as needed
let todayTimes = {};
let tomorrowTimes = {};
function computeAndRender() {
  const now = new Date();
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  // compute times as unix ms to easily compare; use 'x' format.  The PrayTime
  // library expects a numeric timezone offset (in hours) and an optional DST flag.
  // We derive these values from the selected IANA timezone by using
  // Intl.DateTimeFormat and fall back to an EU-style DST rule if the IANA
  // timezone is unavailable.  The offset returned by Intl reflects the
  // local time difference from UTC for the given date, including DST.  The
  // "timeZone" parameter passed to getTimes() must be the base (standard)
  // offset in hours, while the DST flag is the difference between the
  // current offset and the standard offset.  See PrayTimes manual【42668127185122†L150-L170】 for
  // details on these parameters.
  function computeTzInfo(date) {
    try {
      // Base UTC date at midnight
      const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      // Current offset for the given date
      const tzDate = new Date(utcDate.toLocaleString('en-US', { timeZone: settings.timezone }));
      const currentOffset = (tzDate.getTime() - utcDate.getTime()) / 3600000;
      // Standard offset (approximate) computed from Jan 1st of the same year
      const janUTC = new Date(Date.UTC(date.getFullYear(), 0, 1));
      const janTzDate = new Date(janUTC.toLocaleString('en-US', { timeZone: settings.timezone }));
      const standardOffset = (janTzDate.getTime() - janUTC.getTime()) / 3600000;
      const dst = currentOffset - standardOffset;
      return { timeZone: standardOffset, dst: dst };
    } catch (e) {
      // IANA timezone not supported: approximate DST using EU rule (last Sunday of March/October).
      const year = date.getFullYear();
      // Device offset (in hours) for this date
      const deviceOffset = -new Date().getTimezoneOffset() / 60;
      // Determine DST boundaries for EU (last Sunday of March and October at 01:00 UTC)
      function lastSundayOfMonth(y, m) {
        // m: 0-based month index
        const d = new Date(Date.UTC(y, m + 1, 0));
        const lastDay = d.getUTCDate();
        const lastDate = new Date(Date.UTC(y, m, lastDay));
        const dayOfWeek = lastDate.getUTCDay();
        // Move back to Sunday
        lastDate.setUTCDate(lastDate.getUTCDate() - dayOfWeek);
        return lastDate;
      }
      const startDst = lastSundayOfMonth(year, 2); // March
      const endDst = lastSundayOfMonth(year, 9);   // October
      const inDst = date >= startDst && date < endDst;
      const stdOff = deviceOffset - (inDst ? 1 : 0);
      const dstFlag = inDst ? 1 : 0;
      return { timeZone: stdOff, dst: dstFlag };
    }
  }

  try {
    // Update location each time just in case
    prayTime.location([settings.latitude, settings.longitude]);
    prayTime.format('x'); // return timestamps in milliseconds
    // Today
    const tzToday = computeTzInfo(todayDate);
    let todayTimesRaw = prayTime.getTimes(
      todayDate,
      [settings.latitude, settings.longitude],
      tzToday.timeZone,
      tzToday.dst,
      'x'
    );
    // Apply prayer time offsets
    todayTimes = applyPrayerTimeOffsets(todayTimesRaw);
    
    // Tomorrow
    const tzTomorrow = computeTzInfo(tomorrowDate);
    let tomorrowTimesRaw = prayTime.getTimes(
      tomorrowDate,
      [settings.latitude, settings.longitude],
      tzTomorrow.timeZone,
      tzTomorrow.dst,
      'x'
    );
    // Apply prayer time offsets
    tomorrowTimes = applyPrayerTimeOffsets(tomorrowTimesRaw);
    // Compute additional times for Friday and Ramadan
    // Determine if today and tomorrow are Fridays in the selected timezone
    function isFriday(date) {
      // Determine weekday in selected timezone; getDay() returns local day but we
      // convert the date to the correct timezone by using toLocaleString.
      const locStr = date.toLocaleString('en-US', { timeZone: settings.timezone });
      const locDate = new Date(locStr);
      return locDate.getDay() === 5; // Friday (0=Sunday,...,5=Friday)
    }
    // Determine if today and tomorrow are Ramadan days when using Hijri calendar.
    function isRamadan(date) {
      if (!settings.ramadanMode) return false;
      // Convert to timezone first
      const str = date.toLocaleString('en-US', { timeZone: settings.timezone });
      const dt = new Date(str);
      // Use Islamic calendar to get month number (1-based). For reliability across browsers,
      // we use Intl.DateTimeFormat with calendar 'islamic'. Note: some environments may not support this.
      try {
        const parts = new Intl.DateTimeFormat('en-u-ca-islamic', { timeZone: settings.timezone, year:'numeric', month:'numeric', day:'numeric' }).formatToParts(dt);
        const monthPart = parts.find(p => p.type === 'month');
        const monthNum = monthPart ? parseInt(monthPart.value) : 0;
        return monthNum === 9;
      } catch (e) {
        // If Intl or islamic calendar is unavailable, fallback: user must enable mode manually.
        return false;
      }
    }
    // Compute Imsak for today and tomorrow if Ramadan mode is enabled and the day is in Ramadan
    function computeImsak(timesObj, date) {
      // If Ramadan mode is enabled, compute Imsak time regardless of current month.
      // Imsak is offset minutes before Fajr.
      if (!settings.ramadanMode) return;
      const fajrMs = parseInt(timesObj.fajr);
      if (fajrMs && !isNaN(fajrMs)) {
        const offset = (isFinite(settings.imsakOffset) ? settings.imsakOffset : defaultSettings.imsakOffset) * 60000;
        timesObj.imsak = fajrMs - offset;
      }
    }
    // Compute Jumu'ah times on Fridays if fridayMode is enabled
    function computeJumuah(timesObj, date) {
      if (!settings.fridayMode) return;
      if (!isFriday(date)) return;
      const dhuhrMs = parseInt(timesObj.dhuhr);
      if (dhuhrMs && !isNaN(dhuhrMs)) {
        const kDelay = parseInt(settings.jumuahKhutbahDelay) || 0;
        const pDelay = parseInt(settings.jumuahPrayerDelay) || 0;
        timesObj.jumuahKhutbah = dhuhrMs + kDelay * 60000;
        timesObj.jumuahPrayer = dhuhrMs + pDelay * 60000;
      }
    }
    computeImsak(todayTimes, todayDate);
    computeImsak(tomorrowTimes, tomorrowDate);
    computeJumuah(todayTimes, todayDate);
    computeJumuah(tomorrowTimes, tomorrowDate);
  } catch (e) {
    console.error('Error computing times:', e);
    todayTimes = {};
    tomorrowTimes = {};
  }
  
  render();
  updateQiblaIndicator();
  scheduleRecompute();
}

// Schedule recompute at next midnight
function scheduleRecompute() {
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const msUntilMidnight = nextMidnight - now + 1000; // extra second
  recomputeTimeout = setTimeout(() => {
    computeAndRender();
  }, msUntilMidnight);
}

// Compute iqamah times based on global delay and per-prayer overrides
function getIqamahTimes(dayTimes) {
  const iqamahTimes = {};
  ['Fajr','Dhuhr','Asr','Maghrib','Isha'].forEach(prayer => {
    const adhanMs = parseInt(dayTimes[prayer.toLowerCase()]);
    if (!adhanMs || isNaN(adhanMs)) {
      iqamahTimes[prayer] = "";
      return;
    }
    const override = settings.perIqamah[prayer];
    if (override && override.trim()) {
      // parse HH:MM or H:MM
      const parts = override.split(':');
      const hh = parseInt(parts[0]);
      const mm = parseInt(parts[1]);
      const iqDate = new Date(adhanMs);
      iqDate.setHours(hh);
      iqDate.setMinutes(mm);
      iqDate.setSeconds(0,0);
      iqamahTimes[prayer] = iqDate.getTime();
    } else if (settings.iqamahDelay && settings.iqamahDelay > 0) {
      iqamahTimes[prayer] = adhanMs + settings.iqamahDelay * 60 * 1000;
    } else {
      iqamahTimes[prayer] = "";
    }
  });
  return iqamahTimes;
}

// Determine next event across today/tomorrow
function computeNextEvent() {
  // Determine next upcoming prayer or related event (imsak, Jumu'ah) across today and tomorrow.
  const now = Date.now();
  const events = [];

  // Helper to determine if a date is Friday in the selected timezone
  function isFriday(dateObj) {
    const locStr = dateObj.toLocaleString('en-US', { timeZone: settings.timezone });
    const locDate = new Date(locStr);
    return locDate.getDay() === 5;
  }
  // Helper to push events for a given dayTimes object and date
  function addEvents(dayTimes, date, isToday) {
    // Determine if this date is Friday (for Jumu'ah) and Ramadan (for Imsak)
    const friday = settings.fridayMode && isFriday(date);
    // Add Imsak event if available (Ramadan mode + imsak computed). Use
    // hasOwnProperty rather than truthiness so that a zero timestamp
    // (midnight) is not ignored.
    if (settings.ramadanMode && Object.prototype.hasOwnProperty.call(dayTimes, 'imsak')) {
      const ims = parseInt(dayTimes.imsak);
      if (!isNaN(ims)) {
        if ((isToday && ims >= now) || !isToday) {
          events.push({ time: ims, prayer: 'Imsak', type: 'imsak' });
        }
      }
    }
    // Add Jumu'ah events if Friday mode and this date is Friday and jumuah times exist
    if (friday) {
      const kh = parseInt(dayTimes.jumuahKhutbah);
      if (kh && !isNaN(kh)) {
        if ((isToday && kh >= now) || !isToday) {
          events.push({ time: kh, prayer: 'Jumuah', type: 'khutbah' });
        }
      }
      const pr = parseInt(dayTimes.jumuahPrayer);
      if (pr && !isNaN(pr)) {
        if ((isToday && pr >= now) || !isToday) {
          events.push({ time: pr, prayer: 'Jumuah', type: 'prayer' });
        }
      }
    } else {
      // Regular prayers for Fajr, Dhuhr, Asr, Maghrib, Isha
      const iqTimes = getIqamahTimes(dayTimes);
      ['Fajr','Dhuhr','Asr','Maghrib','Isha'].forEach(prayer => {
        // skip Dhuhr adhan on Friday if Friday mode is enabled (handled above)
        const adhanMs = parseInt(dayTimes[prayer.toLowerCase()]);
        if (adhanMs && !isNaN(adhanMs)) {
          if ((isToday && adhanMs >= now) || !isToday) {
            events.push({ time: adhanMs, prayer, type: 'adhan' });
          }
        }
        const iqMs = iqTimes[prayer];
        if (iqMs && !isNaN(iqMs)) {
          if ((isToday && iqMs >= now) || !isToday) {
            events.push({ time: iqMs, prayer, type: 'iqamah' });
          }
        }
      });
    }
  }
  // Add events for today
  addEvents(todayTimes, new Date(), true);
  // If no events left for today, add events for tomorrow
  if (events.length === 0) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    addEvents(tomorrowTimes, tomorrow, false);
  }
  // Sort events by time ascending
  events.sort((a, b) => a.time - b.time);
  return events.length > 0 ? events[0] : null;
}

// Format date/time according to language and format
function formatTime(dateObj, includeSeconds = false) {
  // Format a Date object according to the selected time format and timezone.
  const opts = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: settings.timeFormat !== '24h'
  };
  if (includeSeconds) opts.second = '2-digit';
  // Choose locale based on selected language. For Arabic we will convert digits
  // to Latin later via toLatinDigits(). Spanish uses Latin digits by default.
  let locale;
  if (settings.language === 'ar') {
    locale = 'ar-SA';
  } else if (settings.language === 'es') {
    locale = 'es';
  } else {
    locale = 'en-US';
  }
  // Use the selected timezone so times reflect the mosque location rather than browser locale.
  let formatted = new Intl.DateTimeFormat(locale, Object.assign({}, opts, { timeZone: settings.timezone })).format(dateObj);
  if (settings.timeFormat === '12H') {
    formatted = formatted.replace(/ ?[AP]M/i, '');
  }
  // If Arabic is selected, convert any Arabic-Indic digits to Latin digits.
  if (settings.language === 'ar') {
    formatted = toLatinDigits(formatted);
  }
  return formatted;
}

// Format date line (Gregorian | Hijri)
function formatDateLine(dateObj) {
  // Format the Gregorian and Hijri dates based on the selected language and timezone.
  // Determine locale for Gregorian portion
  let gregLocale;
  if (settings.language === 'ar') gregLocale = 'ar';
  else if (settings.language === 'es') gregLocale = 'es';
  else gregLocale = 'en';
  // Convert the provided date into the selected timezone by using toLocaleString
  const tzDateStr = dateObj.toLocaleString('en-US', { timeZone: settings.timezone });
  const tzDate = new Date(tzDateStr);
  const gregOpts = { weekday:'long', year:'numeric', month:'long', day:'numeric', timeZone: settings.timezone };
  let gregDate = new Intl.DateTimeFormat(gregLocale, gregOpts).format(tzDate);
  // Hijri date with offset
  const hijriDateObj = new Date(tzDate.getTime() + settings.hijriOffset * 86400000);
  const hijriOpts = { day:'numeric', month:'long', year:'numeric', calendar:'islamic', timeZone: settings.timezone };
  // Determine locale for Hijri portion
  let hijriLocale;
  if (settings.language === 'ar') hijriLocale = 'ar-TN-u-ca-islamic';
  else if (settings.language === 'es') hijriLocale = 'es-u-ca-islamic';
  else hijriLocale = 'en-u-ca-islamic';
  let hijriDate = new Intl.DateTimeFormat(hijriLocale, hijriOpts).format(hijriDateObj);
  // Convert digits to Latin when Arabic language selected
  if (settings.language === 'ar') {
    gregDate = toLatinDigits(gregDate);
    hijriDate = toLatinDigits(hijriDate);
  }
  return `${gregDate} | ${hijriDate}`;
}

// Render UI based on computed times and settings
function render() {
  document.getElementById('mosque-name').textContent = settings.mosqueName;
  const locEl = document.getElementById('location-label');
  if (locEl) {
    const label = (settings.locationLabel || '').trim();
    if (label) {
      locEl.textContent = label;
    } else {
      const hasCoords = Number.isFinite(settings.latitude) && Number.isFinite(settings.longitude) && !(settings.latitude === 0 && settings.longitude === 0);
      if (hasCoords) {
        locEl.textContent = `${settings.latitude.toFixed(2)}, ${settings.longitude.toFixed(2)}`;
      } else if (settings.timezone) {
        locEl.textContent = settings.timezone;
      } else {
        locEl.textContent = '';
      }
    }
  }
  
  // update logo and background
  const bgDiv = document.getElementById('background-image');
  if (settings.backgroundDataUrl) {
    bgDiv.style.backgroundImage = `url(${settings.backgroundDataUrl})`;
  } else {
    bgDiv.style.backgroundImage = 'none';
  }
  if (settings.logoDataUrl) {
    // Create or update logo element
    let existing = document.querySelector('.logo');
    if (!existing) {
      existing = document.createElement('img');
      existing.className = 'logo';
      const header = document.querySelector('header');
      const right = document.querySelector('.header-right');
      // Insert the logo before the header-right section so it appears between
      // the name/date and the clock/weather/controls.
      header.insertBefore(existing, right);
    }
    existing.src = settings.logoDataUrl;
  } else {
    const existing = document.querySelector('.logo');
    if (existing) existing.remove();
  }
  
  // Set direction based on language
  if (settings.language === 'ar') {
    document.body.classList.add('rtl');
  } else {
    document.body.classList.remove('rtl');
  }
  
  // Format date line
  const now = new Date();
  document.getElementById('date-line').textContent = formatDateLine(now);
  
  // Determine which view to render (day, week, month)
  const cardsContainer = document.getElementById('cards-container');
  const scheduleContainer = document.getElementById('schedule-container');
  const scheduleTable = document.getElementById('schedule-table');
  // Reset schedule content
  if (scheduleTable) scheduleTable.innerHTML = '';
  // Determine view mode
  const mode = settings.viewMode || 'day';
  if (mode === 'week' || mode === 'month') {
    // Hide cards and show schedule
    if (cardsContainer) cardsContainer.style.display = 'none';
    if (scheduleContainer) scheduleContainer.style.display = 'block';
    // Render the schedule table
    renderScheduleTable(mode);
    // Adjust schedule container height to enable scrolling on long tables
    adjustScheduleHeight();
  } else {
    // Day view: show cards and hide schedule
    if (scheduleContainer) scheduleContainer.style.display = 'none';
    if (cardsContainer) cardsContainer.style.display = '';
    // Clear existing cards
    cardsContainer.innerHTML = '';
    // Determine which prayer cards to display; include Sunrise if settings.showSunrise
    const basePrayers = settings.showSunrise ? ['Fajr','Sunrise','Dhuhr','Asr','Maghrib','Isha'] : ['Fajr','Dhuhr','Asr','Maghrib','Isha'];
    let prayersList = basePrayers.slice();
    // Insert Imsak at beginning if Ramadan mode is enabled. We check for the
    // existence of the imsak property rather than truthiness because a
    // computed imsak time could theoretically be 0 (midnight) and thus
    // evaluate to false. This ensures the Imsak card is always displayed
    // whenever Ramadan mode is on and Imsak has been computed.
    if (settings.ramadanMode && Object.prototype.hasOwnProperty.call(todayTimes, 'imsak')) {
      prayersList = ['Imsak'].concat(basePrayers);
    }
    const iqToday = getIqamahTimes(todayTimes);
    const nextEv = computeNextEvent();
    nextEvent = nextEv;
    // Determine if today is Friday for Jumu'ah handling
    const isFri = (() => {
      const locStr = new Date().toLocaleString('en-US', { timeZone: settings.timezone });
      const locDate = new Date(locStr);
      return locDate.getDay() === 5;
    })();
    prayersList.forEach(prayer => {
      const card = document.createElement('div');
      card.className = 'prayer-card';
      const nameDiv = document.createElement('div');
      nameDiv.className = 'prayer-name';
      const displayName = (prayer === 'Dhuhr' && settings.fridayMode && isFri)
        ? (translations[settings.language].Jumuah || "Jumu'ah")
        : (translations[settings.language][prayer] || prayer);
      nameDiv.textContent = displayName;
      const timeDiv = document.createElement('div');
      timeDiv.className = 'prayer-time';
      // Determine adhan time
      let adhanMs;
      if (prayer === 'Imsak') {
        adhanMs = todayTimes.imsak;
      } else if (prayer === 'Dhuhr' && settings.fridayMode && isFri) {
        // For Friday with Friday mode, display Jumu'ah Khutbah and Prayer instead of Dhuhr adhan
        adhanMs = todayTimes.jumuahKhutbah || todayTimes.dhuhr;
      } else {
        adhanMs = parseInt(todayTimes[prayer.toLowerCase()]);
      }
      if (adhanMs && !isNaN(adhanMs)) {
        timeDiv.textContent = formatTime(new Date(adhanMs));
      } else {
        timeDiv.textContent = '--:--';
      }
      // Determine Iqamah or Jumu'ah details
      const iqDiv = document.createElement('div');
      iqDiv.className = 'prayer-iqamah';
      if (prayer === 'Imsak') {
        // No iqamah for Imsak
        iqDiv.textContent = '';
      } else if (prayer === 'Dhuhr' && settings.fridayMode && isFri) {
        // Show Khutbah and Prayer times on Friday
        const kMs = todayTimes.jumuahKhutbah;
        const pMs = todayTimes.jumuahPrayer;
        const parts = [];
        if (kMs && !isNaN(kMs)) {
          parts.push(`${translations[settings.language].Khutbah}: ${formatTime(new Date(kMs))}`);
        }
        if (pMs && !isNaN(pMs)) {
          parts.push(`${translations[settings.language].Prayer}: ${formatTime(new Date(pMs))}`);
        }
        iqDiv.innerHTML = parts.join('<br>');
      } else {
        const iqMs = iqToday[prayer];
        if (iqMs && !isNaN(iqMs)) {
          const iqText = formatTime(new Date(iqMs));
          iqDiv.textContent = `${translations[settings.language].Iqamah}: ${iqText}`;
        } else {
          iqDiv.textContent = '';
        }
      }
      // Add progress indicator if enabled
      if (settings.enableProgressIndicator !== false) {
        const progressRing = document.createElement('div');
        progressRing.className = 'progress-ring';
        card.appendChild(progressRing);
      }
      
      card.appendChild(nameDiv);
      card.appendChild(timeDiv);
      card.appendChild(iqDiv);
      // Highlight if this card contains the next event
      if (nextEv) {
        // Determine if this card corresponds to the next event
        let match = false;
        if (prayer === 'Imsak' && nextEv.prayer === 'Imsak') match = true;
        else if (prayer === 'Dhuhr' && settings.fridayMode && isFri && nextEv.prayer === 'Jumuah') match = true;
        else if (nextEv.prayer === prayer) match = true;
        if (match) {
          card.classList.add('next');
          const badgeEl = document.createElement('div');
          badgeEl.className = 'next-prayer-badge';
          badgeEl.textContent = translations[settings.language].Next || 'Next';
          card.insertBefore(badgeEl, nameDiv);
          console.log(`Adding 'next' class to ${prayer} card - Next event: ${nextEv.prayer} at ${new Date(nextEv.time).toLocaleTimeString()}`);
          const diffMins = (nextEv.time - Date.now()) / 60000;
          if (settings.flashMinutes && diffMins <= settings.flashMinutes) {
            card.classList.add('flash');
          } else {
            card.classList.remove('flash');
          }
        }
      }
      cardsContainer.appendChild(card);
    });
  }
  
  // Function to detect if text is predominantly RTL (Arabic, Hebrew, etc.)
  function isRTLText(text) {
    if (!text || typeof text !== 'string') return false;
    
    // Count RTL characters (Arabic, Hebrew, Persian, etc.)
    const rtlChars = text.match(/[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFB4F\uFB50-\uFDFF\uFE70-\uFEFF]/g);
    const rtlCount = rtlChars ? rtlChars.length : 0;
    
    // Count total characters (excluding spaces and punctuation)
    const totalChars = text.replace(/[\s\p{P}]/gu, '').length;
    
    // If more than 50% of characters are RTL, consider it RTL text
    const isRTL = totalChars > 0 && (rtlCount / totalChars) > 0.5;
    
    console.log('Ticker: RTL detection - RTL chars:', rtlCount, 'total chars:', totalChars, 'ratio:', totalChars > 0 ? (rtlCount / totalChars).toFixed(2) : 0, 'isRTL:', isRTL);
    
    return isRTL;
  }

  // Update ticker content and animation.  Instead of duplicating the text and
  // using half-width translation, build a single span and dynamically
  // generate a keyframe animation that scrolls the text completely across
  // the available space.  This ensures the ticker always starts at the
  // beginning of the message and loops smoothly without disappearing.
  (function updateTicker() {
    const ticker = document.getElementById('ticker');
    if (!ticker) {
      console.warn('Ticker: Element not found');
      return;
    }
    const msg = (settings.tickerText || '').trim();
    console.log('Ticker: Updating with message:', msg ? `"${msg}"` : '(empty)');
    if (!msg) {
      // No ticker message: clear any content and animation
      ticker.innerHTML = '';
      ticker.style.animation = 'none';
      // Remove any existing dynamic style element
      const existing = document.getElementById('ticker-dynamic-style');
      if (existing) existing.remove();
      console.log('Ticker: Cleared empty ticker');
      return;
    }
    // Create container for two copies of the message to achieve seamless looping
    ticker.innerHTML = '';
    // Check for manual override first, then fall back to content-based detection
    let isRTL;
    if (settings.tickerForceRTL !== undefined && settings.tickerForceRTL !== null) {
      // Manual override is set - use it
      isRTL = settings.tickerForceRTL;
      console.log('Ticker: Using manual RTL override:', isRTL);
    } else {
      // No manual override - detect RTL based on text content
      isRTL = isRTLText(msg);
      console.log('Ticker: RTL detection - text content analysis, isRTL:', isRTL);
    }
    ticker.style.direction = isRTL ? 'rtl' : 'ltr';
    const inner = document.createElement('div');
    inner.className = 'ticker-inner';
    // Create two slides containing the message text
    const makeSlide = () => {
      const slide = document.createElement('div');
      slide.className = 'ticker-slide';
      slide.textContent = msg;
      // Ensure the slide respects the direction for proper RTL display
      slide.style.direction = ticker.style.direction;
      return slide;
    };
    const first = makeSlide();
    const second = makeSlide();
    inner.appendChild(first);
    inner.appendChild(second);
    ticker.appendChild(inner);
    // After appending, measure the width of the first slide to determine animation
    requestAnimationFrame(() => {
      const textWidth = first.scrollWidth;
      console.log('Ticker: Text width measured:', textWidth, 'px');
      // Use a base pixel per second speed; adjust duration based on content length
      const pxPerSec = 50;
      // Total distance to travel is the width of one slide
      const distance = textWidth + 20; // add small gap between repetitions
      let duration = distance / pxPerSec;
      if (!isFinite(duration) || duration < 20) duration = 20;
      console.log('Ticker: Animation duration:', duration, 's, distance:', distance, 'px');
      // Determine translation for LTR vs RTL: we move inner container leftward or rightward
      // For RTL: text should start from right and move leftward
      // For LTR: text should start from left and move leftward (standard behavior)
      const fromX = isRTL ? distance : 0;
      const toX = isRTL ? -distance : -distance;
      console.log('Ticker: Animation values - fromX:', fromX, 'toX:', toX, 'isRTL:', isRTL);
      // Create or reuse the dynamic style element
      let styleEl = document.getElementById('ticker-dynamic-style');
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'ticker-dynamic-style';
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = `@keyframes ticker-loop { from { transform: translateX(${fromX}px); } to { transform: translateX(${toX}px); } }`;
      // Apply the animation to the inner container
      inner.style.animation = `ticker-loop ${duration}s linear infinite`;
      console.log('Ticker: Animation applied successfully');
    });
  })();

  // Setup slideshow phrases (reinitialises rotation each render)
  setupSlideshow();
  
  // Update next event display
  updateClockAndCountdown();
}

// Render schedule table for week or month view. This function is invoked
// when the user selects the viewMode 'week' or 'month'. It computes
// prayer times for each day in the chosen range and populates a table with
// formatted times. The first column shows the date. For Ramadan mode, an
// additional Imsak column is displayed. On Fridays with Friday mode
// enabled, Dhuhr times are replaced with Jumu'ah Khutbah/Prayer times.
function renderScheduleTable(mode) {
  const table = document.getElementById('schedule-table');
  if (!table) return;
  // Clear existing content
  table.innerHTML = '';
  // Determine locale for date headings based on language
  let locale;
  if (settings.language === 'ar') locale = 'ar';
  else if (settings.language === 'es') locale = 'es';
  else locale = 'en';
  // Determine date range
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let dates = [];
  if (mode === 'week') {
    for (let i = 0; i < 7; i++) {
      dates.push(new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i));
    }
  } else if (mode === 'month') {
    const year = startDate.getFullYear();
    const month = startDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      dates.push(new Date(year, month, d));
    }
  }
  // Determine if Imsak column is needed (Ramadan mode) and whether to show Sunrise
  const showImsakCol = settings.ramadanMode;
  const showSunrise = settings.showSunrise;
  // Build header row
  const thead = document.createElement('thead');
  const hrow = document.createElement('tr');
  const dateTh = document.createElement('th');
  dateTh.textContent = translations[settings.language].Date || 'Date';
  hrow.appendChild(dateTh);
  if (showImsakCol) {
    const ims = document.createElement('th');
    ims.textContent = translations[settings.language].Imsak || 'Imsak';
    hrow.appendChild(ims);
  }
  // Add prayer column headers
  const prayerCols = showSunrise ? ['Fajr','Sunrise','Dhuhr','Asr','Maghrib','Isha'] : ['Fajr','Dhuhr','Asr','Maghrib','Isha'];
  prayerCols.forEach(pr => {
    const th = document.createElement('th');
    th.textContent = translations[settings.language][pr] || pr;
    hrow.appendChild(th);
  });
  thead.appendChild(hrow);
  table.appendChild(thead);
  // Create tbody
  const tbody = document.createElement('tbody');
  // Helper to compute timezone and DST similar to computeTzInfo
  function computeTzInfoFor(date) {
    try {
      const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      const tzDate = new Date(utcDate.toLocaleString('en-US', { timeZone: settings.timezone }));
      const currentOffset = (tzDate.getTime() - utcDate.getTime()) / 3600000;
      const janUTC = new Date(Date.UTC(date.getFullYear(), 0, 1));
      const janTzDate = new Date(janUTC.toLocaleString('en-US', { timeZone: settings.timezone }));
      const standardOffset = (janTzDate.getTime() - janUTC.getTime()) / 3600000;
      const dst = currentOffset - standardOffset;
      return { timeZone: standardOffset, dst: dst };
    } catch (e) {
      // Fallback: EU DST rule
      const year = date.getFullYear();
      const deviceOffset = -new Date().getTimezoneOffset() / 60;
      function lastSundayOfMonth(y, m) {
        const d = new Date(Date.UTC(y, m + 1, 0));
        const lastDay = d.getUTCDate();
        const lastDate = new Date(Date.UTC(y, m, lastDay));
        const dow = lastDate.getUTCDay();
        lastDate.setUTCDate(lastDate.getUTCDate() - dow);
        return lastDate;
      }
      const startDst = lastSundayOfMonth(year, 2);
      const endDst = lastSundayOfMonth(year, 9);
      const inDst = date >= startDst && date < endDst;
      const stdOff = deviceOffset - (inDst ? 1 : 0);
      const dstFlag = inDst ? 1 : 0;
      return { timeZone: stdOff, dst: dstFlag };
    }
  }
  // Determine if a given date is Friday
  function isFri(date) {
    const locStr = date.toLocaleString('en-US', { timeZone: settings.timezone });
    const dt = new Date(locStr);
    return dt.getDay() === 5;
  }
  // Determine if date is in Ramadan when using Islamic calendar
  function inRamadan(date) {
    if (!settings.ramadanMode) return false;
    try {
      const locStr = date.toLocaleString('en-US', { timeZone: settings.timezone });
      const dt = new Date(locStr);
      const parts = new Intl.DateTimeFormat('en-u-ca-islamic', { timeZone: settings.timezone, month:'numeric' }).formatToParts(dt);
      const monthPart = parts.find(p => p.type === 'month');
      const monthNum = monthPart ? parseInt(monthPart.value) : 0;
      return monthNum === 9;
    } catch (e) {
      return false;
    }
  }
  dates.forEach(date => {
    // Compute prayer times for this date
    let times;
    let tz;
    try {
      tz = computeTzInfoFor(date);
      times = prayTime.getTimes(date, [settings.latitude, settings.longitude], tz.timeZone, tz.dst, 'x');
    } catch (e) {
      times = {};
    }
    // Compute Imsak if needed
    if (showImsakCol) {
      const fajrMs = parseInt(times.fajr);
      if (fajrMs && !isNaN(fajrMs)) {
        const offset = (isFinite(settings.imsakOffset) ? settings.imsakOffset : defaultSettings.imsakOffset) * 60000;
        times.imsak = fajrMs - offset;
      }
    }
    // Compute Jumu'ah times if Friday and fridayMode
    if (settings.fridayMode && isFri(date)) {
      const dhuhrMs = parseInt(times.dhuhr);
      if (dhuhrMs && !isNaN(dhuhrMs)) {
        const kDelay = parseInt(settings.jumuahKhutbahDelay) || 0;
        const pDelay = parseInt(settings.jumuahPrayerDelay) || 0;
        times.jumuahKhutbah = dhuhrMs + kDelay * 60000;
        times.jumuahPrayer = dhuhrMs + pDelay * 60000;
      }
    }
    // Build table row
    const row = document.createElement('tr');
    // Date cell: format as weekday short + day + month; convert digits if Arabic
    const locStr = date.toLocaleString('en-US', { timeZone: settings.timezone });
    const locDate = new Date(locStr);
    const dateLabel = new Intl.DateTimeFormat(locale, { weekday:'short', day:'numeric', month:'short' }).format(locDate);
    let dateText = dateLabel;
    if (settings.language === 'ar') dateText = toLatinDigits(dateText);
    const dateTd = document.createElement('td');
    dateTd.textContent = dateText;
    row.appendChild(dateTd);
    // Imsak cell if needed
    if (showImsakCol) {
      const imsTd = document.createElement('td');
      if (times.imsak) {
        imsTd.textContent = formatTime(new Date(times.imsak));
      } else {
        imsTd.textContent = '';
      }
      row.appendChild(imsTd);
    }
    // Add prayer times cells
    prayerCols.forEach(pr => {
      const td = document.createElement('td');
      if (pr === 'Dhuhr' && settings.fridayMode && isFri(date) && times.jumuahKhutbah) {
        const kh = times.jumuahKhutbah ? formatTime(new Date(times.jumuahKhutbah)) : '';
        const prTime = times.jumuahPrayer ? formatTime(new Date(times.jumuahPrayer)) : '';
        // Show both times separated by slash or newline
        td.innerHTML = `${kh}<br>${prTime}`;
      } else {
        const ms = parseInt(times[pr.toLowerCase()]);
        td.textContent = (ms && !isNaN(ms)) ? formatTime(new Date(ms)) : '';
      }
      row.appendChild(td);
    });
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
}

// Update digital clock and countdown to next event
function updateClockAndCountdown() {
  const now = new Date();
  // digital clock
  document.getElementById('digital-clock').textContent = formatTime(now) + (settings.timeFormat === '12h' ? '' : '');
  
  // countdown
  // Always compute the next event on each tick to ensure real-time updates (imsak and Jumu'ah events)
  nextEvent = computeNextEvent();
  if (nextEvent) {
    const diff = nextEvent.time - Date.now();
    const absDiff = Math.abs(diff);
    const h = Math.floor(absDiff / 3600000);
    const m = Math.floor((absDiff % 3600000) / 60000);
    const s = Math.floor((absDiff % 60000) / 1000);
    const hh = String(h).padStart(2,'0');
    const mm = String(m).padStart(2,'0');
    const ss = String(s).padStart(2,'0');
    const prayerName = translations[settings.language][nextEvent.prayer] || nextEvent.prayer;
    // Determine type label based on event type
    let typeLabel = '';
    if (nextEvent.type === 'iqamah') {
      typeLabel = translations[settings.language].Iqamah + ' ';
    } else if (nextEvent.type === 'khutbah') {
      typeLabel = translations[settings.language].Khutbah + ' ';
    } else if (nextEvent.type === 'prayer') {
      typeLabel = translations[settings.language].Prayer + ' ';
    } else {
      typeLabel = '';
    }
    // Build next event text with optional Iftar countdown
    let nextText = `${prayerName} ${typeLabel}${hh}:${mm}:${ss}`;
    // If Ramadan mode and Iftar countdown enabled, append countdown to Maghrib (Iftar) time
    if (settings.ramadanMode && settings.showIftarCountdown) {
      // Determine Iftar time: Maghrib adhan for today or tomorrow if already passed
      let iftarMs = null;
      const nowMs = Date.now();
      const maghribToday = parseInt(todayTimes.maghrib);
      const maghribTomorrow = parseInt(tomorrowTimes.maghrib);
      if (maghribToday && !isNaN(maghribToday)) {
        iftarMs = maghribToday >= nowMs ? maghribToday : (maghribTomorrow || null);
      } else if (maghribTomorrow && !isNaN(maghribTomorrow)) {
        iftarMs = maghribTomorrow;
      }
      if (iftarMs) {
        let diff2 = iftarMs - nowMs;
        const sign = diff2 < 0 ? -1 : 1;
        diff2 = Math.abs(diff2);
        const h2 = Math.floor(diff2 / 3600000);
        const m2 = Math.floor((diff2 % 3600000) / 60000);
        const s2 = Math.floor((diff2 % 60000) / 1000);
        const ihh = String(h2).padStart(2,'0');
        const imm = String(m2).padStart(2,'0');
        const iss = String(s2).padStart(2,'0');
        const iftarLabel = translations[settings.language].Iftar || 'Iftar';
        nextText += ` \u2022 ${iftarLabel}: ${ihh}:${imm}:${iss}`;
      }
    }
    const nextEl = document.getElementById('next-event');
    if (nextEl) {
      const badge = translations[settings.language].Next || 'Next';
      const text = toLatinDigits(nextText);
      nextEl.innerHTML = `<span class="next-event-badge">${badge}</span><span class="next-event-text">${text}</span>`;
    }
    
    // Check for prayer notifications
    if (settings.prayerNotifications && diff <= 0 && diff > -60000) { // Within 1 minute of prayer time
      showPrayerNotification(prayerName);
    }
    
    // Re-render cards to apply flash if necessary
    // Avoid infinite loop: only call render when seconds is zero or diff changes drastically
  } else {
    const nextEl = document.getElementById('next-event');
    if (nextEl) nextEl.textContent = '';
  }

  // Always update weather display each tick to reflect staleness
  renderWeather();
}

// Adjust the maximum height of the schedule container to ensure that long
// schedules (e.g., monthly view) remain scrollable. It subtracts the
// heights of the header, footer, and slideshow (if visible) from the
// viewport height and applies the result as max-height on the schedule
// container. Called after rendering the schedule and on window resize.
function adjustScheduleHeight() {
  const scheduleContainer = document.getElementById('schedule-container');
  if (!scheduleContainer || scheduleContainer.style.display === 'none') return;
  const headerEl = document.querySelector('header');
  const footerEl = document.querySelector('footer');
  const topHeight = headerEl ? headerEl.getBoundingClientRect().height : 0;
  const bottomHeight = footerEl ? footerEl.getBoundingClientRect().height : 0;
  const viewport = window.innerHeight;
  let subtract = topHeight + bottomHeight;
  // Account for slideshow height if phrases are present
  const slideshowEl = document.getElementById('slideshow');
  if (slideshowEl && slideshowEl.textContent && slideshowEl.textContent.trim() !== '') {
    subtract += slideshowEl.getBoundingClientRect().height;
  }
  // Also account for margins between sections (approximate 10px) to avoid touching edges
  const available = viewport - subtract - 10;
  if (available > 0) {
    // Set a fixed height rather than just a max-height so that the
    // schedule container always fills the available space and becomes
    // scrollable if the table is taller. Without setting a definitive
    // height some browsers may not allow scrolling to the very end.
    scheduleContainer.style.height = available + 'px';
    scheduleContainer.style.overflowY = 'auto';
  }
}

// Recompute schedule height when window is resized
window.addEventListener('resize', adjustScheduleHeight);

// Render the weather information in the header based on manual settings.  If
// weather is disabled, the display is hidden. If enabled, compose the
// weather string and apply stale colouring when expired.
function renderWeather() {
  const weatherEl = document.getElementById('weather-display');
  if (!weatherEl) return;
  if (!settings.weatherEnabled) {
    weatherEl.style.display = 'none';
    return;
  }
  const hasCoords = Number.isFinite(settings.latitude) && Number.isFinite(settings.longitude) && !(settings.latitude === 0 && settings.longitude === 0);
  
  // Show weather display even if no data yet
  weatherEl.style.display = 'flex';
  weatherEl.style.flexDirection = 'column';
  
  // Current weather section
  const currentEl = weatherEl.querySelector('.weather-current');
  if (currentEl) {
    const parts = [];
    // Determine and insert an icon: use uploaded icon if available; otherwise derive
    // an emoji based on the weather condition string.
    if (settings.weatherIcon) {
      parts.push(`<img src="${settings.weatherIcon}" alt="weather icon">`);
    } else {
      const emoji = getWeatherEmoji(settings.weatherCondition);
      if (emoji) {
        parts.push(`<span class="weather-emoji">${emoji}</span>`);
      }
    }
    // Temperature
    if (settings.weatherTemp !== '' && !isNaN(settings.weatherTemp)) {
      parts.push(`${settings.weatherTemp}${settings.weatherUnits === 'F' ? '°F' : '°C'}`);
    }
    // Condition
    if (settings.weatherCondition) {
      parts.push(settings.weatherCondition);
    }
    // High / Low
    const highs = [];
    if (settings.weatherHigh !== '' && !isNaN(settings.weatherHigh)) {
      highs.push(`H:${settings.weatherHigh}${settings.weatherUnits === 'F' ? '°F' : '°C'}`);
    }
    if (settings.weatherLow !== '' && !isNaN(settings.weatherLow)) {
      highs.push(`L:${settings.weatherLow}${settings.weatherUnits === 'F' ? '°F' : '°C'}`);
    }
    if (highs.length > 0) parts.push(highs.join(' '));
    // Humidity
    if (settings.weatherHumidity) {
      // Append % if value is numeric and doesn't already include it
      const hum = settings.weatherHumidity;
      const humStr = (/\d/.test(hum) && !/%/.test(hum)) ? `${hum}%` : hum;
      parts.push(humStr);
    }
    // Wind
    if (settings.weatherWind) {
      parts.push(settings.weatherWind);
    }
    
    // Air Quality
    if (settings.weatherAirQuality && settings.weatherAirQualityData) {
      const aqi = settings.weatherAirQualityData;
      let aqiClass = 'good';
      let aqiText = 'Good';
      if (aqi > 100) {
        aqiClass = 'poor';
        aqiText = 'Poor';
      } else if (aqi > 50) {
        aqiClass = 'moderate';
        aqiText = 'Moderate';
      }
      parts.push(`<span class="weather-air-quality ${aqiClass}">AQI: ${aqiText}</span>`);
    }
    
    // If no weather data is available yet, show a loading indicator or coordinates
    if (parts.length === 0) {
      if (settings.weatherMode === 'online' && hasCoords) {
        if (settings.enableLoadingStates !== false) {
          weatherEl.classList.add('loading');
          parts.push('🌡️ Loading weather...');
        } else {
          parts.push('🌡️ Loading weather...');
        }
      } else if (hasCoords) {
        parts.push(`📍 ${settings.latitude.toFixed(2)}, ${settings.longitude.toFixed(2)}`);
      } else {
        parts.push('🌡️ Set location in Settings');
      }
    }
    if (settings.weatherError) {
      parts.push(`⚠️ ${settings.weatherError}`);
    }
    // If only the icon is present and no other data (e.g., temperature/high/low/humidity/wind),
    // add a placeholder so the weather element isn't blank. This avoids an empty display when
    // the user hasn't provided a temperature or condition. The placeholder shows "N/A".
    if (parts.length === 1 && settings.weatherTemp === '') {
      if (settings.weatherMode === 'online') {
        parts.push('Waiting for weather...');
      } else {
        parts.push('N/A');
      }
    }
    // Join with middot separators
    const inner = parts.join(' • ');
    // Convert any Arabic-Indic digits to Latin digits when language is Arabic
    const innerLatin = toLatinDigits(inner);
    currentEl.innerHTML = innerLatin;
  }
  
  // Forecast section
  const forecastEl = weatherEl.querySelector('.weather-forecast');
  if (forecastEl && settings.weatherForecast && settings.weatherForecastData.length > 0) {
    forecastEl.style.display = 'flex';
    forecastEl.innerHTML = '';
    
    settings.weatherForecastData.slice(0, 5).forEach((day, index) => {
      const dayEl = document.createElement('div');
      dayEl.className = 'weather-forecast-day';
      
      const date = new Date();
      date.setDate(date.getDate() + index + 1);
      const dayName = date.toLocaleDateString(settings.language === 'ar' ? 'ar-SA' : 'en-US', { weekday: 'short' });
      
      const emoji = getWeatherEmoji(day.condition);
      const temp = `${Math.round(day.temp)}${settings.weatherUnits === 'F' ? '°F' : '°C'}`;
      
      dayEl.innerHTML = `
        <div>${dayName}</div>
        <div>${emoji || '🌤️'}</div>
        <div>${temp}</div>
      `;
      forecastEl.appendChild(dayEl);
    });
  } else if (forecastEl) {
    forecastEl.style.display = 'none';
  }
  
  // Alerts section
  const alertsEl = weatherEl.querySelector('.weather-alerts');
  if (alertsEl && settings.weatherAlerts && settings.weatherAlertsData.length > 0) {
    alertsEl.style.display = 'block';
    alertsEl.innerHTML = settings.weatherAlertsData.map(alert => 
      `<div class="weather-alert">⚠️ ${alert}</div>`
    ).join('');
  } else if (alertsEl) {
    alertsEl.style.display = 'none';
  }
  
  // Determine stale based on weatherLastUpdated and validity
  const now = Date.now();
  const validMs = (settings.weatherValidHours || defaultSettings.weatherValidHours) * 3600000;
  const stale = settings.weatherLastUpdated && (now - settings.weatherLastUpdated > validMs);
  if (stale) {
    weatherEl.classList.add('stale');
  } else {
    weatherEl.classList.remove('stale');
  }
}

// Fetch weather data from an online API if weatherMode is 'online'.
// This function respects the validity period (weatherValidHours) and only
// fetches new data when the existing weather information is stale or absent.
function fetchWeatherIfOnline() {
  if (settings.weatherMode !== 'online' || !settings.weatherEnabled) return;
  settings.weatherError = '';
  
  // Check if we have valid coordinates
  const lat = Number.isFinite(settings.latitude) ? settings.latitude : 0;
  const lon = Number.isFinite(settings.longitude) ? settings.longitude : 0;
  const hasCoords = Number.isFinite(settings.latitude) && Number.isFinite(settings.longitude) && !(lat === 0 && lon === 0);
  if (!hasCoords) {
    settings.weatherError = 'No coordinates available';
    console.log('Weather: No coordinates available, skipping fetch');
    return;
  }
  
  const now = Date.now();
  const validMs = (settings.weatherValidHours || defaultSettings.weatherValidHours) * 3600000;
  const hasCachedData = (settings.weatherTemp !== '' && !isNaN(settings.weatherTemp)) ||
    !!settings.weatherCondition ||
    (settings.weatherHigh !== '' && !isNaN(settings.weatherHigh)) ||
    (settings.weatherLow !== '' && !isNaN(settings.weatherLow)) ||
    !!settings.weatherHumidity ||
    !!settings.weatherWind ||
    (Array.isArray(settings.weatherForecastData) && settings.weatherForecastData.length > 0);
  if (settings.weatherLastUpdated && (now - settings.weatherLastUpdated) < validMs && hasCachedData) {
    console.log('Weather: Data still valid, skipping fetch');
    return;
  }
  
  console.log('Weather: Fetching weather data...');
  // Determine which provider to use: openweather or open-meteo. When using
  // OpenWeatherMap a valid API key is required. Open-Meteo is free and
  // open-source and does not require a key.
  const provider = (settings.weatherProvider || 'open-meteo').trim();
  let providerToUse = provider;
  // Helper to update settings and call renderWeather()
  function updateAndRender(temp, high, low, humidity, windSpeed, condition) {
    if (temp !== null && temp !== undefined && !isNaN(temp)) {
      settings.weatherTemp = Math.round(temp);
    }
    if (high !== null && high !== undefined && !isNaN(high)) {
      settings.weatherHigh = Math.round(high);
    } else {
      settings.weatherHigh = settings.weatherHigh || '';
    }
    if (low !== null && low !== undefined && !isNaN(low)) {
      settings.weatherLow = Math.round(low);
    } else {
      settings.weatherLow = settings.weatherLow || '';
    }
    if (humidity !== undefined && humidity !== null) {
      settings.weatherHumidity = humidity.toString();
    }
    if (windSpeed !== undefined && windSpeed !== null) {
      settings.weatherWind = windSpeed;
    }
    if (condition !== undefined && condition !== null) {
      settings.weatherCondition = condition;
    }
    settings.weatherError = '';
    settings.weatherLastUpdated = Date.now();
    saveSettings();
    
    // Remove loading state when weather data is loaded
    const weatherEl = document.getElementById('weather-display');
    if (weatherEl && settings.enableLoadingStates !== false) {
      weatherEl.classList.remove('loading');
    }
    
    renderWeather();
  }
  // Use OpenWeatherMap provider
  if (providerToUse === 'openweather') {
    const apiKey = settings.weatherApiKey ? settings.weatherApiKey.trim() : '';
    if (!apiKey) {
      console.warn('Weather: OpenWeather selected without API key, falling back to Open-Meteo.');
      providerToUse = 'open-meteo';
    }
  }

  if (providerToUse === 'openweather') {
    const apiKey = settings.weatherApiKey ? settings.weatherApiKey.trim() : '';
    if (!apiKey) return;
    // Determine units for API based on selected weatherUnits. 'imperial' yields Fahrenheit/mph, 'metric' yields Celsius/km/h
    const units = settings.weatherUnits === 'F' ? 'imperial' : 'metric';
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=${units}&appid=${apiKey}`;
    fetch(url).then(resp => resp.json()).then(data => {
      if (!data || !data.main || !data.weather || !data.weather[0]) return;
      const temp = data.main.temp;
      const high = data.main.temp_max;
      const low = data.main.temp_min;
      let humidityVal = '';
      if (typeof data.main.humidity === 'number') {
        humidityVal = data.main.humidity.toString();
      }
      let windStr = '';
      let speed = 0;
      if (data.wind && typeof data.wind.speed === 'number') {
        speed = data.wind.speed;
      }
      if (settings.weatherUnits === 'F') {
        windStr = Math.round(speed) + ' mph';
      } else {
        windStr = Math.round(speed * 3.6) + ' km/h';
      }
      // Condition description: capitalize first letter
      const desc = data.weather[0].description || '';
      const cond = desc.charAt(0).toUpperCase() + desc.slice(1);
      updateAndRender(temp, high, low, humidityVal, windStr, cond);
    }).then(data => {
      console.log('Weather: OpenWeather data received:', data);
    }).catch(err => {
      console.error('Weather fetch error (OpenWeather):', err);
      settings.weatherError = `OpenWeather error: ${err.message || err.toString()}`;
      renderWeather();
    });
    return;
  }
  // Use Open-Meteo provider (default). Open-Meteo does not require an API key.
  // Determine units for Open-Meteo based on selected weatherUnits.
  const tempUnit = settings.weatherUnits === 'F' ? 'fahrenheit' : 'celsius';
  const windUnit = settings.weatherUnits === 'F' ? 'mph' : 'kmh';
  
  // Enhanced weather parameters
  let url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code`;
  
  // Add daily forecast if enabled
  if (settings.weatherForecast) {
    url += `&daily=temperature_2m_max,temperature_2m_min,weather_code&temperature_unit=${tempUnit}&windspeed_unit=${windUnit}`;
  }
  
  // Add air quality if enabled
  if (settings.weatherAirQuality) {
    url += `&hourly=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,european_aqi`;
  }
  
  url += `&timezone=${encodeURIComponent(settings.timezone || 'auto')}`;
  fetch(url).then(resp => {
    if (!resp.ok) throw new Error(`Open-Meteo HTTP ${resp.status}`);
    return resp.json();
  }).then(data => {
    if (!data || !data.current) return;
    const current = data.current;
    const daily = data.daily || {};
    const temp = current.temperature_2m;
    // daily temperature arrays provide arrays for upcoming days; we take the first element (today)
    const high = daily.temperature_2m_max ? daily.temperature_2m_max[0] : null;
    const low = daily.temperature_2m_min ? daily.temperature_2m_min[0] : null;
    const humidityVal = (current.relative_humidity_2m != null) ? current.relative_humidity_2m.toString() : '';
    const windSp = current.wind_speed_10m != null ? Math.round(current.wind_speed_10m) + (settings.weatherUnits === 'F' ? ' mph' : ' km/h') : '';
    // Derive a textual condition from the weather code. Open-Meteo provides either
    // weather_code or weathercode depending on the API version. We check both.
    let code = null;
    if (typeof current.weather_code !== 'undefined') {
      code = current.weather_code;
    } else if (typeof current.weathercode !== 'undefined') {
      code = current.weathercode;
    }
    // Mapping of WMO weather codes to descriptive conditions. These names
    // are simplified to match our emoji mapping in getWeatherEmoji(). If
    // the code is undefined or unmapped, we'll leave the condition blank.
    const codeMap = {
      0: 'Clear',
      1: 'Mainly clear',
      2: 'Partly cloudy',
      3: 'Overcast',
      45: 'Fog',
      48: 'Fog',
      51: 'Drizzle',
      53: 'Drizzle',
      55: 'Drizzle',
      56: 'Freezing drizzle',
      57: 'Freezing drizzle',
      61: 'Rain',
      63: 'Rain',
      65: 'Rain',
      66: 'Freezing rain',
      67: 'Freezing rain',
      71: 'Snow',
      73: 'Snow',
      75: 'Snow',
      77: 'Snow',
      80: 'Rain showers',
      81: 'Rain showers',
      82: 'Rain showers',
      85: 'Snow showers',
      86: 'Snow showers',
      95: 'Thunderstorm',
      96: 'Thunderstorm',
      99: 'Thunderstorm'
    };
    let cond = '';
    if (code != null && codeMap.hasOwnProperty(code)) {
      cond = codeMap[code];
    }
    // Process enhanced weather data
    if (settings.weatherForecast && data.daily) {
      const forecast = [];
      for (let i = 1; i < Math.min(6, data.daily.time.length); i++) {
        const dayTemp = (data.daily.temperature_2m_max[i] + data.daily.temperature_2m_min[i]) / 2;
        const dayCode = data.daily.weather_code[i];
        const dayCondition = codeMap[dayCode] || 'Unknown';
        forecast.push({
          temp: Math.round(dayTemp),
          condition: dayCondition
        });
      }
      settings.weatherForecastData = forecast;
    }
    
    // Process air quality data
    if (settings.weatherAirQuality && data.hourly && data.hourly.european_aqi) {
      const currentHour = new Date().getHours();
      const aqi = data.hourly.european_aqi[currentHour] || data.hourly.european_aqi[0];
      settings.weatherAirQualityData = aqi;
    }
    
    // Process weather alerts (simulated for now)
    if (settings.weatherAlerts) {
      const alerts = [];
      if (temp > 35) alerts.push('High temperature warning');
      if (temp < -10) alerts.push('Freezing temperature warning');
      if (windSp && parseInt(windSp) > 30) alerts.push('High wind warning');
      settings.weatherAlertsData = alerts;
    }
    
    updateAndRender(temp, high, low, humidityVal, windSp, cond);
    console.log('Weather: Open-Meteo data processed successfully');
  }).catch(err => {
    console.error('Weather fetch error (Open-Meteo):', err);
    settings.weatherError = `Open-Meteo error: ${err.message || err.toString()}`;
    renderWeather();
    
    // Try fallback API if enabled
    if (settings.weatherFallbacks && providerToUse === 'open-meteo') {
      console.log('Weather: Trying fallback API...');
      fetchWeatherFallback(lat, lon);
    }
  });
}

// Calculate qibla direction angle
function calculateQiblaDirection(lat, lon) {
  // Kaaba coordinates (21.4225° N, 39.8262° E)
  const kaabaLat = 21.4225;
  const kaabaLon = 39.8262;
  
  // Convert to radians
  const latRad = lat * Math.PI / 180;
  const lonRad = lon * Math.PI / 180;
  const kaabaLatRad = kaabaLat * Math.PI / 180;
  const kaabaLonRad = kaabaLon * Math.PI / 180;
  
  // Calculate qibla angle
  const y = Math.sin(kaabaLonRad - lonRad);
  const x = Math.cos(latRad) * Math.tan(kaabaLatRad) - Math.sin(latRad) * Math.cos(kaabaLonRad - lonRad);
  const qiblaAngle = Math.atan2(y, x) * 180 / Math.PI;
  
  return (qiblaAngle + 360) % 360;
}

// Update qibla indicator
function updateQiblaIndicator() {
  if (!settings.qiblaDirection || !settings.latitude || !settings.longitude) {
    const qiblaEl = document.getElementById('qibla-indicator');
    if (qiblaEl) qiblaEl.style.display = 'none';
    return;
  }
  
  const qiblaEl = document.getElementById('qibla-indicator');
  const arrowEl = qiblaEl?.querySelector('.qibla-arrow');
  if (!qiblaEl || !arrowEl) return;
  
  const angle = calculateQiblaDirection(settings.latitude, settings.longitude);
  settings.qiblaAngle = angle;
  
  arrowEl.style.transform = `rotate(${angle}deg)`;
  qiblaEl.style.display = 'flex';
}

// Show prayer notification
function showPrayerNotification(prayerName) {
  if (!settings.prayerNotifications) return;
  
  const notification = document.createElement('div');
  notification.className = 'prayer-notification';
  notification.innerHTML = `
    <h3>🕌 Prayer Time</h3>
    <p>It's time for ${prayerName}</p>
  `;
  
  document.body.appendChild(notification);
  
  // Remove notification after 10 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 10000);
}

// Apply prayer time offsets
function applyPrayerTimeOffsets(times) {
  const offsets = settings.prayerTimeOffsets || {};
  const adjustedTimes = {};
  
  Object.keys(times).forEach(prayer => {
    if (times[prayer] && offsets[prayer]) {
      const offset = parseInt(offsets[prayer]) || 0;
      const time = new Date(times[prayer]);
      time.setMinutes(time.getMinutes() + offset);
      adjustedTimes[prayer] = time.getTime();
    } else {
      adjustedTimes[prayer] = times[prayer];
    }
  });
  
  return adjustedTimes;
}

// Share prayer times
function sharePrayerTimes() {
  if (!settings.prayerSharing || !navigator.share) return;
  
  const today = new Date();
  const dateStr = today.toLocaleDateString(settings.language === 'ar' ? 'ar-SA' : 'en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  const prayerTimes = Object.keys(todayTimes).map(prayer => {
    if (todayTimes[prayer]) {
      return `${prayer}: ${formatTime(new Date(todayTimes[prayer]))}`;
    }
    return null;
  }).filter(Boolean).join('\n');
  
  const shareText = `Prayer Times for ${dateStr}\n\n${prayerTimes}\n\n${settings.mosqueName || 'Mosque'}`;
  
  navigator.share({
    title: 'Prayer Times',
    text: shareText
  }).catch(err => {
    console.log('Share failed:', err);
  });
}

// Fallback weather API function for enhanced reliability
function fetchWeatherFallback(lat, lon) {
  console.log('Weather: Using fallback API...');
  const tempUnit = settings.weatherUnits === 'F' ? 'fahrenheit' : 'celsius';
  const windUnit = settings.weatherUnits === 'F' ? 'mph' : 'kmh';
  
  // Use a different Open-Meteo endpoint as fallback
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&temperature_unit=${tempUnit}&windspeed_unit=${windUnit}&timezone=auto`;
  
  fetch(url).then(resp => {
    if (!resp.ok) throw new Error(`Open-Meteo fallback HTTP ${resp.status}`);
    return resp.json();
  }).then(data => {
    if (!data || !data.current) return;
    const current = data.current;
    const temp = current.temperature_2m;
    const humidityVal = (current.relative_humidity_2m != null) ? current.relative_humidity_2m.toString() : '';
    const windSp = current.wind_speed_10m != null ? Math.round(current.wind_speed_10m) + (settings.weatherUnits === 'F' ? ' mph' : ' km/h') : '';
    
    // Simple condition mapping for fallback
    const code = current.weather_code;
    const codeMap = { 0: 'Clear', 1: 'Clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Fog', 51: 'Drizzle', 53: 'Drizzle', 55: 'Drizzle', 61: 'Rain', 63: 'Rain', 65: 'Rain', 71: 'Snow', 73: 'Snow', 75: 'Snow', 80: 'Rain showers', 81: 'Rain showers', 82: 'Rain showers', 85: 'Snow showers', 86: 'Snow showers', 95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm' };
    const cond = codeMap[code] || 'Unknown';
    
    updateAndRender(temp, null, null, humidityVal, windSp, cond);
    console.log('Weather: Fallback API data processed successfully');
  }).catch(err => {
    console.error('Weather: All APIs failed:', err);
    settings.weatherError = `Fallback error: ${err.message || err.toString()}`;
    renderWeather();
  });
}

// Fetch slideshow phrases from online APIs when using an online slideshow source. This
// function checks the last fetched timestamp and the user-specified refresh interval
// before making a network request. It populates the global slideshowData array
// with strings. Supported sources include:
// - quranRandom: uses Quran.com API to fetch a random verse with optional translation.
// - quranSeq: uses AlQuran.cloud API to fetch a random verse (can be adapted for sequential).
// - azkar: fetches morning adhkar from muslimKit JSON (ahegazy.github.io).
// - custom: fetches an array of strings from a user-provided API URL.
// After fetching, it updates settings.slideshowLastFetched and saves settings.
async function fetchSlideshowIfNeeded() {
  // Only proceed for online sources; manual mode requires no fetching
  if (settings.slideshowSource === 'manual') return;
  const now = Date.now();
  const refreshMs = (parseInt(settings.slideshowRefreshHours) || defaultSettings.slideshowRefreshHours) * 3600000;
  // If data exists and is still fresh, do not fetch again
  if (Array.isArray(slideshowData) && slideshowData.length > 0 && (now - settings.slideshowLastFetched) < refreshMs) {
    return;
  }
  try {
    let data = [];
    const source = settings.slideshowSource;
    // Helper to convert digits to Latin when Arabic is selected
    const toLatin = str => settings.language === 'ar' ? toLatinDigits(String(str)) : String(str);
    if (source === 'quranRandom') {
      // Fetch a random verse from Quran.com. The API returns Arabic text and an array of translations.
      // See: https://api.quran.com/api/v4/verses/random
      const transId = encodeURIComponent(settings.slideshowTranslation || defaultSettings.slideshowTranslation || '');
      const url = `https://api.quran.com/api/v4/verses/random?language=ar&translations=${transId}&words=false`;
      const resp = await fetch(url);
      const json = await resp.json();
      if (json && json.verse) {
        const verse = json.verse.text || '';
        let trans = '';
        if (Array.isArray(json.verse.translations) && json.verse.translations.length > 0) {
          trans = json.verse.translations[0].text || '';
        }
        const phrase = trans ? `${verse} – ${trans}` : verse;
        data.push(phrase);
      }
    } else if (source === 'quranSeq') {
      // Fetch a random ayah from AlQuran.cloud using selected edition for translation. This can be
      // adapted to sequential retrieval by storing the last ayah index externally.
      const verseId = Math.floor(Math.random() * 6236) + 1;
      const edition = settings.slideshowTranslation || 'en.pickthall';
      const url = `https://api.alquran.cloud/v1/ayah/${verseId}/editions/quran-uthmani,${edition}`;
      const resp = await fetch(url);
      const json = await resp.json();
      if (json && Array.isArray(json.data)) {
        let arabic = '';
        let translation = '';
        json.data.forEach(item => {
          if (item.edition && item.edition.identifier === 'quran-uthmani') arabic = item.text;
          if (item.edition && item.edition.identifier === edition) translation = item.text;
        });
        const phrase = translation ? `${arabic} – ${translation}` : arabic;
        data.push(phrase);
      }
    } else if (source === 'azkar') {
      // Fetch morning adhkar JSON. The structure includes a content array of objects with zekr property.
      // See: https://ahegazy.github.io/muslimKit/json/azkar_sabah.json
      const url = 'https://ahegazy.github.io/muslimKit/json/azkar_sabah.json';
      const resp = await fetch(url);
      const json = await resp.json();
      if (json && Array.isArray(json.content)) {
        data = json.content.map(item => item.zekr).filter(x => !!x);
      }
    } else if (source === 'custom') {
      const url = (settings.slideshowCustomUrl || '').trim();
      if (url) {
        const resp = await fetch(url);
        const json = await resp.json();
        if (Array.isArray(json)) {
          data = json.map(item => String(item));
        } else if (Array.isArray(json.items)) {
          data = json.items.map(item => item.text || String(item));
        }
      }
    }
    // If we got any data, update global array and timestamp
    if (Array.isArray(data) && data.length > 0) {
      // Convert digits to Latin when necessary and store strings only
      slideshowData = data.map(str => toLatin(str));
      settings.slideshowLastFetched = Date.now();
      saveSettings();
    }
  } catch (err) {
    console.error('Error fetching slideshow data:', err);
  }
}

// Schedule the next weather update when using online mode. This clears any existing
// timer and sets a new timeout based on how long until the weather becomes stale.
function scheduleWeatherUpdates() {
  if (weatherTimer) clearTimeout(weatherTimer);
  if (settings.weatherMode !== 'online' || !settings.weatherEnabled) return;
  const now = Date.now();
  const validMs = (settings.weatherValidHours || defaultSettings.weatherValidHours) * 3600000;
  let delay = 0;
  if (settings.weatherLastUpdated) {
    const nextUpdateAt = settings.weatherLastUpdated + validMs;
    delay = Math.max(nextUpdateAt - now, 0);
  }
  // Always schedule at least every valid period to refresh data
  weatherTimer = setTimeout(() => {
    fetchWeatherIfOnline();
    scheduleWeatherUpdates();
  }, delay + 1000);
}

// Display a temporary warning message at the top of the screen (e.g., geolocation denied)
function showGeoWarning(message) {
  const warn = document.getElementById('geo-warning');
  if (!warn) return;
  warn.textContent = message;
  warn.style.display = 'block';
  // Clear any existing timeout on this element
  if (warn._timeout) clearTimeout(warn._timeout);
  warn._timeout = setTimeout(() => {
    warn.style.display = 'none';
  }, 5000);
}

// Initialize or update the slideshow of phrases displayed below the prayer cards.
async function setupSlideshow() {
  const elem = document.getElementById('slideshow');
  if (!elem) return;
  // Clear any existing timer to avoid multiple intervals
  if (slideshowTimer) {
    clearInterval(slideshowTimer);
    slideshowTimer = null;
  }
  // Determine the source of slideshow phrases. When manual, use the text provided
  // by the user in the admin panel. For online sources, ensure data is fetched
  // and cached. If fetching fails or yields no data and fallback is enabled, revert
  // to the manual phrases.
  let phrases = [];
  if (settings.slideshowSource === 'manual') {
    const raw = settings.slideshowText || '';
    phrases = raw.split(/\n/).map(s => s.trim()).filter(s => s.length > 0);
  } else {
    // For online sources, fetch data if needed. This function updates
    // slideshowData and settings.slideshowLastFetched when successful.
    await fetchSlideshowIfNeeded();
    phrases = Array.isArray(slideshowData) ? slideshowData.slice() : [];
    // Optionally fall back to manual phrases if no data is available or fetch failed
    if ((!phrases || phrases.length === 0) && settings.slideshowFallback) {
      const raw = settings.slideshowText || '';
      phrases = raw.split(/\n/).map(s => s.trim()).filter(s => s.length > 0);
    }
  }
  // If no phrases are available, hide the slideshow element
  if (!phrases || phrases.length === 0) {
    elem.style.display = 'none';
    elem.textContent = '';
    return;
  }
  // Show the slideshow container and initialise index and first phrase
  elem.style.display = 'flex';
  slideshowIndex = 0;
  elem.textContent = phrases[slideshowIndex];
  elem.style.opacity = '1';
  // Determine slide duration in milliseconds. Use user setting or default value
  const dur = parseInt(settings.slideshowDuration);
  const interval = (isFinite(dur) && dur > 1 ? dur : defaultSettings.slideshowDuration) * 1000;
  // Rotate through phrases at configured interval with a fade effect
  slideshowTimer = setInterval(() => {
    slideshowIndex = (slideshowIndex + 1) % phrases.length;
    // Fade out
    elem.style.opacity = '0';
    // After half a second, update text and fade back in
    setTimeout(() => {
      elem.textContent = phrases[slideshowIndex];
      elem.style.opacity = '1';
    }, 500);
  }, interval);
}

// Translate admin panel based on selected language
function translateAdminPanel() {
  const lang = settings.adminPanelLanguage || 'en';
  const t = translations[lang] || translations.en;
  
  // Translate headings
  const headings = document.querySelectorAll('#admin-form h2, #admin-form h3');
  headings.forEach(heading => {
    const key = heading.textContent.trim();
    if (t[key]) {
      heading.textContent = t[key];
    }
  });
  
  // Translate labels
  const labels = document.querySelectorAll('#admin-form label');
  labels.forEach(label => {
    const text = label.childNodes[0]?.textContent?.trim();
    if (text && t[text]) {
      label.childNodes[0].textContent = t[text];
    }
  });
  
  // Translate select options
  const selects = document.querySelectorAll('#admin-form select option');
  selects.forEach(option => {
    const text = option.textContent.trim();
    if (t[text]) {
      option.textContent = t[text];
    }
  });
  
  // Translate buttons
  const buttons = document.querySelectorAll('#admin-form button');
  buttons.forEach(button => {
    const text = button.textContent.trim();
    if (t[text]) {
      button.textContent = t[text];
    }
  });
}

// Populate admin form with current settings
function populateAdminForm() {
  document.getElementById('admin-server-ip').value = settings.serverIp || 'prayerserver';
  document.getElementById('admin-server-port').value = settings.serverPort || '80';
  document.getElementById('admin-server-secured').value = settings.serverSecured || 'https';

  document.getElementById('admin-mosque-name').value = settings.mosqueName;
  document.getElementById('admin-location-label').value = settings.locationLabel;
  document.getElementById('admin-mode').value = settings.mode;
  document.getElementById('admin-lat').value = settings.latitude;
  document.getElementById('admin-lng').value = settings.longitude;
  document.getElementById('admin-tz').value = settings.timezone;
  document.getElementById('admin-method').value = settings.calculationMethod;
  document.getElementById('admin-asr').value = settings.asrMethod;
  document.getElementById('admin-global-iqamah').value = settings.iqamahDelay;
  // per prayer string
  const perList = ['Fajr','Dhuhr','Asr','Maghrib','Isha'].map(p => settings.perIqamah[p] || '').join(', ');
  document.getElementById('admin-per-iqamah').value = perList;
  document.getElementById('admin-lang').value = settings.language;
  document.getElementById('admin-panel-lang').value = settings.adminPanelLanguage || 'en';
  document.getElementById('admin-format').value = settings.timeFormat;
  document.getElementById('admin-hijri-offset').value = settings.hijriOffset;
  document.getElementById('admin-ticker').value = settings.tickerText;
  console.log('Ticker: Loaded ticker text:', settings.tickerText ? `"${settings.tickerText}"` : '(empty)');
  document.getElementById('admin-ticker-rtl').checked = !!settings.tickerForceRTL;
  document.getElementById('admin-ticker-size').value = settings.tickerSize || defaultSettings.tickerSize;
  document.getElementById('admin-footer-height').value = settings.footerHeight || defaultSettings.footerHeight;
  document.getElementById('admin-slideshow').value = settings.slideshowText || '';
  // Slideshow source fields
  const ssSelect = document.getElementById('admin-slideshow-source');
  if (ssSelect) ssSelect.value = settings.slideshowSource || 'manual';
  const transInput = document.getElementById('admin-slideshow-translation');
  if (transInput) transInput.value = settings.slideshowTranslation || '';
  const urlInput = document.getElementById('admin-slideshow-url');
  if (urlInput) urlInput.value = settings.slideshowCustomUrl || '';
  const refreshInput = document.getElementById('admin-slideshow-refresh');
  if (refreshInput) refreshInput.value = settings.slideshowRefreshHours || defaultSettings.slideshowRefreshHours;
  const durInput = document.getElementById('admin-slideshow-duration');
  if (durInput) durInput.value = settings.slideshowDuration || defaultSettings.slideshowDuration;
  const fallbackChk = document.getElementById('admin-slideshow-fallback');
  if (fallbackChk) fallbackChk.checked = settings.slideshowFallback;

  // Show or hide slideshow source-related fields based on current selection
  const ssVal = ssSelect ? ssSelect.value : 'manual';
  const transRowEl = document.querySelector('.slideshow-translation-row');
  const urlRowEl = document.querySelector('.slideshow-url-row');
  const refreshRowEl = document.querySelector('.slideshow-refresh-row');
  const durationRowEl = document.querySelector('.slideshow-duration-row');
  const fallbackRowEl = document.querySelector('.slideshow-fallback-row');
  if (transRowEl) transRowEl.style.display = (ssVal === 'quranRandom' || ssVal === 'quranSeq') ? '' : 'none';
  if (urlRowEl) urlRowEl.style.display = (ssVal === 'custom') ? '' : 'none';
  if (refreshRowEl) refreshRowEl.style.display = (ssVal !== 'manual') ? '' : 'none';
  if (durationRowEl) durationRowEl.style.display = (ssVal !== 'manual') ? '' : 'none';
  if (fallbackRowEl) fallbackRowEl.style.display = (ssVal !== 'manual') ? '' : 'none';
  document.getElementById('admin-card-height').value = settings.cardHeight;
  document.getElementById('admin-card-max-width').value = settings.cardMaxWidth;
  document.getElementById('admin-gap').value = settings.gap;
  document.getElementById('admin-flash-minutes').value = settings.flashMinutes;
  // Populate logo height field (rem). Use numeric value from settings or default.
  const lhField = document.getElementById('admin-logo-height');
  if (lhField) {
    lhField.value = settings.logoHeight;
  }
  // Typography fields
  const ff = document.getElementById('admin-font-family');
  if (ff) ff.value = settings.fontFamily;
  const cs = document.getElementById('admin-clock-size');
  if (cs) cs.value = settings.clockSize;
  const ns = document.getElementById('admin-next-size');
  if (ns) ns.value = settings.nextEventSize;
  const ssField = document.getElementById('admin-slideshow-size');
  if (ssField) ssField.value = settings.slideshowSize;
  const nameScale = document.getElementById('admin-card-name-scale');
  if (nameScale) nameScale.value = settings.cardNameScale;
  const timeScale = document.getElementById('admin-card-time-scale');
  if (timeScale) timeScale.value = settings.cardTimeScale;
  const iqScale = document.getElementById('admin-card-iqamah-scale');
  if (iqScale) iqScale.value = settings.cardIqamahScale;
  const sTop = document.getElementById('admin-slideshow-top');
  if (sTop) sTop.value = settings.slideshowMarginTop;
  const sBottom = document.getElementById('admin-slideshow-bottom');
  if (sBottom) sBottom.value = settings.slideshowMarginBottom;

  // Set the slideshow vertical alignment select. Map the settings value (e.g.,
  // 'flex-start', 'center', 'flex-end') directly.
  const ssAlign = document.getElementById('admin-slideshow-align');
  if (ssAlign) {
    // If the saved alignment isn't one of the options, default to center.
    const validAligns = ['flex-start','center','flex-end'];
    ssAlign.value = validAligns.includes(settings.slideshowAlign) ? settings.slideshowAlign : 'center';
  }

  // New layout options
  document.getElementById('admin-header-align').value = settings.headerAlign;
  document.getElementById('admin-board-align').value = settings.boardAlign;
  document.getElementById('admin-show-sunrise').checked = !!settings.showSunrise;

  // Weather settings
  const weatherEnabledEl = document.getElementById('admin-weather-enabled');
  if (weatherEnabledEl) weatherEnabledEl.checked = !!settings.weatherEnabled;
  const weatherModeEl = document.getElementById('admin-weather-mode');
  if (weatherModeEl) weatherModeEl.value = settings.weatherMode || 'manual';
  const weatherTempEl = document.getElementById('admin-weather-temp');
  if (weatherTempEl) weatherTempEl.value = settings.weatherTemp !== "" && settings.weatherTemp !== null && settings.weatherTemp !== undefined ? settings.weatherTemp : "";
  const weatherUnitsEl = document.getElementById('admin-weather-units');
  if (weatherUnitsEl) weatherUnitsEl.value = settings.weatherUnits || 'C';
  const weatherCondEl = document.getElementById('admin-weather-condition');
  if (weatherCondEl) weatherCondEl.value = settings.weatherCondition || '';
  const weatherHighEl = document.getElementById('admin-weather-high');
  if (weatherHighEl) weatherHighEl.value = settings.weatherHigh !== "" && settings.weatherHigh !== null && settings.weatherHigh !== undefined ? settings.weatherHigh : '';
  const weatherLowEl = document.getElementById('admin-weather-low');
  if (weatherLowEl) weatherLowEl.value = settings.weatherLow !== "" && settings.weatherLow !== null && settings.weatherLow !== undefined ? settings.weatherLow : '';
  const weatherHumEl = document.getElementById('admin-weather-humidity');
  if (weatherHumEl) weatherHumEl.value = settings.weatherHumidity || '';
  const weatherWindEl = document.getElementById('admin-weather-wind');
  if (weatherWindEl) weatherWindEl.value = settings.weatherWind || '';
  const weatherValidEl = document.getElementById('admin-weather-valid');
  if (weatherValidEl) weatherValidEl.value = settings.weatherValidHours;
  const weatherApiKeyEl = document.getElementById('admin-weather-api-key');
  if (weatherApiKeyEl) weatherApiKeyEl.value = settings.weatherApiKey || '';

  // Weather provider selection
  const weatherProvEl = document.getElementById('admin-weather-provider');
  if (weatherProvEl) weatherProvEl.value = settings.weatherProvider || 'open-meteo';
  
  // Enhanced weather features
  const weatherForecastEl = document.getElementById('admin-weather-forecast');
  if (weatherForecastEl) weatherForecastEl.checked = settings.weatherForecast;
  const weatherAirQualityEl = document.getElementById('admin-weather-air-quality');
  if (weatherAirQualityEl) weatherAirQualityEl.checked = settings.weatherAirQuality;
  const weatherAlertsEl = document.getElementById('admin-weather-alerts');
  if (weatherAlertsEl) weatherAlertsEl.checked = settings.weatherAlerts;
  const weatherFallbacksEl = document.getElementById('admin-weather-fallbacks');
  if (weatherFallbacksEl) weatherFallbacksEl.checked = settings.weatherFallbacks;

  // Prayer Time Enhancements
  const prayerNotificationsEl = document.getElementById('admin-prayer-notifications');
  if (prayerNotificationsEl) prayerNotificationsEl.checked = settings.prayerNotifications;
  const qiblaDirectionEl = document.getElementById('admin-qibla-direction');
  if (qiblaDirectionEl) qiblaDirectionEl.checked = settings.qiblaDirection;
  const prayerSharingEl = document.getElementById('admin-prayer-sharing');
  if (prayerSharingEl) prayerSharingEl.checked = settings.prayerSharing;
  
  // Prayer time offsets
  const prayerOffsetsEl = document.getElementById('admin-prayer-offsets');
  if (prayerOffsetsEl) {
    const offsets = settings.prayerTimeOffsets || {};
    const prayers = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
    const offsetsString = prayers.map(prayer => offsets[prayer] || 0).join(', ');
    prayerOffsetsEl.value = offsetsString;
  }

  // View mode selection
  const viewModeEl = document.getElementById('admin-view-mode');
  if (viewModeEl) viewModeEl.value = settings.viewMode || 'day';

  // UX/UI Settings
  const themeEl = document.getElementById('admin-theme');
  if (themeEl) themeEl.value = settings.theme || 'dark';
  
  const fontSizeEl = document.getElementById('admin-font-size');
  if (fontSizeEl) fontSizeEl.value = settings.fontSize || 1;
  
  const enableAnimationsEl = document.getElementById('admin-enable-animations');
  if (enableAnimationsEl) enableAnimationsEl.checked = settings.enableAnimations !== false;
  
  const enableHoverEffectsEl = document.getElementById('admin-enable-hover-effects');
  if (enableHoverEffectsEl) enableHoverEffectsEl.checked = settings.enableHoverEffects !== false;
  
  const enableLoadingStatesEl = document.getElementById('admin-enable-loading-states');
  if (enableLoadingStatesEl) enableLoadingStatesEl.checked = settings.enableLoadingStates !== false;
  
  const enableAccessibilityEl = document.getElementById('admin-enable-accessibility');
  if (enableAccessibilityEl) enableAccessibilityEl.checked = settings.enableAccessibility !== false;
  
  const enableProgressIndicatorEl = document.getElementById('admin-enable-progress-indicator');
  if (enableProgressIndicatorEl) enableProgressIndicatorEl.checked = settings.enableProgressIndicator !== false;
  
  const showSettingsControlsEl = document.getElementById('admin-show-settings-controls');
  if (showSettingsControlsEl) showSettingsControlsEl.checked = settings.showSettingsControls === true;

  // Friday mode
  const fridayChk = document.getElementById('admin-friday-mode');
  if (fridayChk) fridayChk.checked = !!settings.fridayMode;
  const jKhutEl = document.getElementById('admin-jumuah-khutbah');
  if (jKhutEl) jKhutEl.value = settings.jumuahKhutbahDelay != null ? settings.jumuahKhutbahDelay : 0;
  const jPrEl = document.getElementById('admin-jumuah-prayer');
  if (jPrEl) jPrEl.value = settings.jumuahPrayerDelay != null ? settings.jumuahPrayerDelay : 0;

  // Ramadan mode
  const ramChk = document.getElementById('admin-ramadan-mode');
  if (ramChk) ramChk.checked = !!settings.ramadanMode;
  const imsakEl = document.getElementById('admin-imsak-offset');
  if (imsakEl) imsakEl.value = settings.imsakOffset != null ? settings.imsakOffset : 10;
  const iftarChk = document.getElementById('admin-show-iftar');
  if (iftarChk) iftarChk.checked = !!settings.showIftarCountdown;

  // Show/hide manual and online weather rows based on mode
  function toggleWeatherAdminRows() {
    const mode = (weatherModeEl && weatherModeEl.value) || 'manual';
    const manualRows = document.querySelectorAll('.weather-manual-row');
    manualRows.forEach(row => {
      row.style.display = (mode === 'manual') ? '' : 'none';
    });
    const onlineRows = document.querySelectorAll('.weather-online-row');
    onlineRows.forEach(row => {
      row.style.display = (mode === 'online') ? '' : 'none';
    });
    // Show or hide API key field based on provider. Only needed when provider is openweather.
    const prov = weatherProvEl ? weatherProvEl.value : 'open-meteo';
    // The API key row uses class 'weather-online-row', so it's already hidden when mode is manual.
    if (prov === 'openweather' && mode === 'online') {
      if (weatherApiKeyEl) weatherApiKeyEl.parentElement.style.display = '';
    } else {
      if (weatherApiKeyEl) weatherApiKeyEl.parentElement.style.display = 'none';
    }
  }
  // Attach change event once
  if (weatherModeEl && !weatherModeEl._toggleListenerAdded) {
    weatherModeEl.addEventListener('change', toggleWeatherAdminRows);
    weatherModeEl._toggleListenerAdded = true;
  }
  if (weatherProvEl && !weatherProvEl._providerToggleAdded) {
    weatherProvEl.addEventListener('change', toggleWeatherAdminRows);
    weatherProvEl._providerToggleAdded = true;
  }
  // Initial toggle
  toggleWeatherAdminRows();

  // Slideshow source toggling. Show or hide translation, custom API URL,
  // refresh interval, slide duration and fallback options based on the
  // chosen slideshow source. These fields live in the same group as ticker
  // settings and should respond immediately when the user changes the source.
  const slideshowSourceEl2 = document.getElementById('admin-slideshow-source');
  const sTransRow2 = document.querySelector('.slideshow-translation-row');
  const sUrlRow2 = document.querySelector('.slideshow-url-row');
  const sRefreshRow2 = document.querySelector('.slideshow-refresh-row');
  const sDurationRow2 = document.querySelector('.slideshow-duration-row');
  const sFallbackRow2 = document.querySelector('.slideshow-fallback-row');
  function toggleSlideshowRowsPopulate() {
    const val = slideshowSourceEl2 ? slideshowSourceEl2.value : 'manual';
    const showTrans = (val === 'quranRandom' || val === 'quranSeq');
    const showUrl = (val === 'custom');
    const showOnline = (val !== 'manual');
    if (sTransRow2) sTransRow2.style.display = showTrans ? '' : 'none';
    if (sUrlRow2) sUrlRow2.style.display = showUrl ? '' : 'none';
    if (sRefreshRow2) sRefreshRow2.style.display = showOnline ? '' : 'none';
    if (sDurationRow2) sDurationRow2.style.display = showOnline ? '' : 'none';
    if (sFallbackRow2) sFallbackRow2.style.display = showOnline ? '' : 'none';
  }
  if (slideshowSourceEl2 && !slideshowSourceEl2._slideshowToggleAdded) {
    slideshowSourceEl2.addEventListener('change', toggleSlideshowRowsPopulate);
    slideshowSourceEl2._slideshowToggleAdded = true;
  }
  // Run once to initialise visibility based on saved source
  toggleSlideshowRowsPopulate();

  // Toggle functions for Friday and Ramadan settings visibility
  function toggleFridayRows() {
    const fChecked = fridayChk && fridayChk.checked;
    // Show or hide delay inputs
    if (jKhutEl) jKhutEl.parentElement.style.display = fChecked ? '' : 'none';
    if (jPrEl) jPrEl.parentElement.style.display = fChecked ? '' : 'none';
  }
  function toggleRamadanRows() {
    const rChecked = ramChk && ramChk.checked;
    if (imsakEl) imsakEl.parentElement.style.display = rChecked ? '' : 'none';
    if (iftarChk) iftarChk.parentElement.style.display = rChecked ? '' : 'none';
  }
  // Attach listeners if not added
  if (fridayChk && !fridayChk._toggleListenerAdded) {
    fridayChk.addEventListener('change', toggleFridayRows);
    fridayChk._toggleListenerAdded = true;
  }
  if (ramChk && !ramChk._toggleListenerAdded) {
    ramChk.addEventListener('change', toggleRamadanRows);
    ramChk._toggleListenerAdded = true;
  }
  // Initial toggle for Friday/Ramadan
  toggleFridayRows();
  toggleRamadanRows();
}

// Show or hide admin panel
function toggleAdminPanel(show) {
  const panel = document.getElementById('admin-panel');
  if (show) {
    populateAdminForm();
    translateAdminPanel();
    panel.classList.add('active');
  } else {
    panel.classList.remove('active');
  }
}

// Handle admin actions
function setupAdminHandlers() {
  setupAdminTabs();
  // Add event listener for admin panel language change
  const adminPanelLangSelect = document.getElementById('admin-panel-lang');
  if (adminPanelLangSelect) {
    adminPanelLangSelect.addEventListener('change', () => {
      settings.adminPanelLanguage = adminPanelLangSelect.value;
      translateAdminPanel();
    });
  }
  document.querySelector('.save').addEventListener('click', () => {
    settings.serverIp = document.getElementById('admin-server-ip').value.trim() || 'prayerserver';
    settings.serverPort = document.getElementById('admin-server-port').value.trim() || '80';
    settings.serverSecured = document.getElementById('admin-server-secured').value || 'https';

    // Save values from form
    settings.mosqueName = document.getElementById('admin-mosque-name').value.trim();
    settings.locationLabel = document.getElementById('admin-location-label').value.trim();
    const modeVal = document.getElementById('admin-mode').value;
    settings.mode = modeVal;
    const latInput = document.getElementById('admin-lat').value;
    const lngInput = document.getElementById('admin-lng').value;
    const tzInput = document.getElementById('admin-tz').value.trim();
    if (modeVal === 'manual') {
      settings.latitude = parseFloat(latInput) || 0;
      settings.longitude = parseFloat(lngInput) || 0;
      settings.timezone = tzInput || settings.timezone;
    } else {
      // In auto mode, keep existing coordinates unless valid manual values are present.
      const latVal = parseFloat(latInput);
      const lngVal = parseFloat(lngInput);
      if (isFinite(latVal) && isFinite(lngVal) && !(latVal === 0 && lngVal === 0)) {
        settings.latitude = latVal;
        settings.longitude = lngVal;
      }
      if (tzInput) settings.timezone = tzInput;
    }
    settings.calculationMethod = document.getElementById('admin-method').value;
    settings.asrMethod = document.getElementById('admin-asr').value;
    settings.iqamahDelay = parseInt(document.getElementById('admin-global-iqamah').value) || 0;
    // per prayer iqamah
    const perString = document.getElementById('admin-per-iqamah').value;
    const parts = perString.split(',').map(s => s.trim());
    ['Fajr','Dhuhr','Asr','Maghrib','Isha'].forEach((p,i) => {
      settings.perIqamah[p] = parts[i] || "";
    });
    settings.language = document.getElementById('admin-lang').value;
    settings.adminPanelLanguage = document.getElementById('admin-panel-lang').value;
    settings.timeFormat = document.getElementById('admin-format').value;
    settings.hijriOffset = parseInt(document.getElementById('admin-hijri-offset').value) || 0;
    settings.tickerText = document.getElementById('admin-ticker').value;
    console.log('Ticker: Saved ticker text:', settings.tickerText ? `"${settings.tickerText}"` : '(empty)');
    settings.tickerForceRTL = document.getElementById('admin-ticker-rtl').checked;
    const tickerSizeVal = parseFloat(document.getElementById('admin-ticker-size').value);
    settings.tickerSize = (isFinite(tickerSizeVal) && tickerSizeVal > 0) ? tickerSizeVal : defaultSettings.tickerSize;
    const footerHeightVal = parseFloat(document.getElementById('admin-footer-height').value);
    settings.footerHeight = (isFinite(footerHeightVal) && footerHeightVal > 0) ? footerHeightVal : defaultSettings.footerHeight;
    settings.slideshowText = document.getElementById('admin-slideshow').value;
    settings.cardHeight = parseInt(document.getElementById('admin-card-height').value) || defaultSettings.cardHeight;
    settings.cardMaxWidth = parseInt(document.getElementById('admin-card-max-width').value) || defaultSettings.cardMaxWidth;
    settings.gap = parseInt(document.getElementById('admin-gap').value) || defaultSettings.gap;
    // Logo height is stored in rem units (floating). Allow decimals. Use default if invalid.
    const logoHeightVal = parseFloat(document.getElementById('admin-logo-height').value);
    settings.logoHeight = (isFinite(logoHeightVal) && logoHeightVal > 0) ? logoHeightVal : defaultSettings.logoHeight;
    settings.flashMinutes = parseInt(document.getElementById('admin-flash-minutes').value) || 0;
    // New layout options
    settings.headerAlign = document.getElementById('admin-header-align').value;
    settings.boardAlign = document.getElementById('admin-board-align').value;
    settings.showSunrise = document.getElementById('admin-show-sunrise').checked;
    // Typography options
    const ffInput = document.getElementById('admin-font-family').value.trim();
    settings.fontFamily = ffInput || defaultSettings.fontFamily;
    const csize = parseFloat(document.getElementById('admin-clock-size').value);
    settings.clockSize = (isFinite(csize) && csize > 0) ? csize : defaultSettings.clockSize;
    const nsize = parseFloat(document.getElementById('admin-next-size').value);
    settings.nextEventSize = (isFinite(nsize) && nsize > 0) ? nsize : defaultSettings.nextEventSize;
    const ssize = parseFloat(document.getElementById('admin-slideshow-size').value);
    settings.slideshowSize = (isFinite(ssize) && ssize > 0) ? ssize : defaultSettings.slideshowSize;
    const nameScaleInput = parseFloat(document.getElementById('admin-card-name-scale').value);
    settings.cardNameScale = (isFinite(nameScaleInput) && nameScaleInput > 0) ? nameScaleInput : defaultSettings.cardNameScale;
    const timeScaleInput = parseFloat(document.getElementById('admin-card-time-scale').value);
    settings.cardTimeScale = (isFinite(timeScaleInput) && timeScaleInput > 0) ? timeScaleInput : defaultSettings.cardTimeScale;
    const iqScaleInput = parseFloat(document.getElementById('admin-card-iqamah-scale').value);
    settings.cardIqamahScale = (isFinite(iqScaleInput) && iqScaleInput > 0) ? iqScaleInput : defaultSettings.cardIqamahScale;

    // Slideshow margins
    settings.slideshowMarginTop = parseInt(document.getElementById('admin-slideshow-top').value) || defaultSettings.slideshowMarginTop;
    settings.slideshowMarginBottom = parseInt(document.getElementById('admin-slideshow-bottom').value) || defaultSettings.slideshowMarginBottom;
    // Slideshow vertical alignment. Use direct value from select. Valid options are 'flex-start', 'center', 'flex-end'.
    const slideshowAlignVal = document.getElementById('admin-slideshow-align').value;
    settings.slideshowAlign = slideshowAlignVal || defaultSettings.slideshowAlign;

    // Weather settings
    settings.weatherEnabled = document.getElementById('admin-weather-enabled').checked;
    settings.weatherMode = document.getElementById('admin-weather-mode').value || 'manual';
    // Temperature values may be empty string or number; use parseFloat but allow ''
    const tmpVal = document.getElementById('admin-weather-temp').value;
    settings.weatherTemp = tmpVal !== '' ? parseFloat(tmpVal) : '';
    settings.weatherUnits = document.getElementById('admin-weather-units').value || 'C';
    settings.weatherCondition = document.getElementById('admin-weather-condition').value.trim();
    const highVal = document.getElementById('admin-weather-high').value;
    settings.weatherHigh = highVal !== '' ? parseFloat(highVal) : '';
    const lowVal = document.getElementById('admin-weather-low').value;
    settings.weatherLow = lowVal !== '' ? parseFloat(lowVal) : '';
    settings.weatherHumidity = document.getElementById('admin-weather-humidity').value.trim();
    settings.weatherWind = document.getElementById('admin-weather-wind').value.trim();
    const validHoursVal = parseFloat(document.getElementById('admin-weather-valid').value);
    settings.weatherValidHours = isFinite(validHoursVal) && validHoursVal >= 0 ? validHoursVal : defaultSettings.weatherValidHours;
    // Record update timestamp for manual weather when saving settings.
    // For online mode, do not update the timestamp here so that a fresh fetch
    // will occur immediately when reinitialising the app.
    if (settings.weatherMode === 'manual') {
      settings.weatherLastUpdated = Date.now();
    }
    // Weather API key for online mode
    settings.weatherApiKey = document.getElementById('admin-weather-api-key').value.trim();

    // Weather provider
    settings.weatherProvider = document.getElementById('admin-weather-provider').value || defaultSettings.weatherProvider;
    
    // Enhanced weather features
    settings.weatherForecast = document.getElementById('admin-weather-forecast').checked;
    settings.weatherAirQuality = document.getElementById('admin-weather-air-quality').checked;
    settings.weatherAlerts = document.getElementById('admin-weather-alerts').checked;
    settings.weatherFallbacks = document.getElementById('admin-weather-fallbacks').checked;

    // Prayer Time Enhancements
    settings.prayerNotifications = document.getElementById('admin-prayer-notifications').checked;
    settings.qiblaDirection = document.getElementById('admin-qibla-direction').checked;
    settings.prayerSharing = document.getElementById('admin-prayer-sharing').checked;
    
    // Parse prayer time offsets
    const offsetsString = document.getElementById('admin-prayer-offsets').value;
    if (offsetsString) {
      const offsets = offsetsString.split(',').map(s => s.trim());
      const prayers = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
      prayers.forEach((prayer, index) => {
        settings.prayerTimeOffsets[prayer] = parseInt(offsets[index]) || 0;
      });
    }

    // View mode
    settings.viewMode = document.getElementById('admin-view-mode').value || defaultSettings.viewMode;

    // Friday mode and Jumu'ah delays
    settings.fridayMode = document.getElementById('admin-friday-mode').checked;
    settings.jumuahKhutbahDelay = parseInt(document.getElementById('admin-jumuah-khutbah').value) || 0;
    settings.jumuahPrayerDelay = parseInt(document.getElementById('admin-jumuah-prayer').value) || 0;
    // Ramadan mode and settings
    settings.ramadanMode = document.getElementById('admin-ramadan-mode').checked;
    settings.imsakOffset = parseInt(document.getElementById('admin-imsak-offset').value) || defaultSettings.imsakOffset;
    settings.showIftarCountdown = document.getElementById('admin-show-iftar').checked;

    // Slideshow source settings
    settings.slideshowSource = document.getElementById('admin-slideshow-source').value || 'manual';
    settings.slideshowTranslation = document.getElementById('admin-slideshow-translation').value.trim();
    settings.slideshowCustomUrl = document.getElementById('admin-slideshow-url').value.trim();
    const ssRefreshVal = parseInt(document.getElementById('admin-slideshow-refresh').value);
    settings.slideshowRefreshHours = (isFinite(ssRefreshVal) && ssRefreshVal > 0) ? ssRefreshVal : defaultSettings.slideshowRefreshHours;
    const ssDurVal = parseInt(document.getElementById('admin-slideshow-duration').value);
    settings.slideshowDuration = (isFinite(ssDurVal) && ssDurVal > 1) ? ssDurVal : defaultSettings.slideshowDuration;
    settings.slideshowFallback = document.getElementById('admin-slideshow-fallback').checked;
    
    // UX/UI Settings
    settings.theme = document.getElementById('admin-theme').value || 'dark';
    
    const fontSizeVal = parseFloat(document.getElementById('admin-font-size').value);
    settings.fontSize = (isFinite(fontSizeVal) && fontSizeVal >= 0.8 && fontSizeVal <= 1.5) ? fontSizeVal : 1;
    
    settings.enableAnimations = document.getElementById('admin-enable-animations').checked;
    settings.enableHoverEffects = document.getElementById('admin-enable-hover-effects').checked;
    settings.enableLoadingStates = document.getElementById('admin-enable-loading-states').checked;
    settings.enableAccessibility = document.getElementById('admin-enable-accessibility').checked;
    settings.enableProgressIndicator = document.getElementById('admin-enable-progress-indicator').checked;
    settings.showSettingsControls = document.getElementById('admin-show-settings-controls').checked;
    
    // File inputs
    const logoInput = document.getElementById('admin-logo');
    if (logoInput.files && logoInput.files[0]) {
      const reader = new FileReader();
      reader.onload = () => {
        settings.logoDataUrl = reader.result;
        saveSettings();
        init();
      };
      reader.readAsDataURL(logoInput.files[0]);
    }
    const bgInput = document.getElementById('admin-bg');
    if (bgInput.files && bgInput.files[0]) {
      const reader2 = new FileReader();
      reader2.onload = () => {
        settings.backgroundDataUrl = reader2.result;
        saveSettings();
        init();
      };
      reader2.readAsDataURL(bgInput.files[0]);
    }

    // Weather icon file upload
    const wIconInput = document.getElementById('admin-weather-icon');
    if (wIconInput && wIconInput.files && wIconInput.files[0]) {
      const readerW = new FileReader();
      readerW.onload = () => {
        settings.weatherIcon = readerW.result;
        saveSettings();
        init();
      };
      readerW.readAsDataURL(wIconInput.files[0]);
    }
    // Save and reinitialize if no images
    saveSettings();
    toggleAdminPanel(false);
    init();
  });
  
  document.querySelector('.cancel').addEventListener('click', () => {
    toggleAdminPanel(false);
  });
  
  document.querySelector('.reset').addEventListener('click', () => {
    if (confirm("Reset all settings to factory defaults?")) {
      settings = Object.assign({}, defaultSettings, {
        serverIp: settings.serverIp || 'prayerserver',
        serverPort: settings.serverPort || '80',
        serverSecured: settings.serverSecured || 'https'
      });
      saveSettings();
      toggleAdminPanel(false);
      init();
    }
  });

  // Clear logo/background buttons
  const logoClearBtn = document.getElementById('admin-logo-clear');
  if (logoClearBtn) {
    logoClearBtn.addEventListener('click', () => {
      settings.logoDataUrl = '';
      const logoInput = document.getElementById('admin-logo');
      if (logoInput) logoInput.value = '';
      saveSettings();
      init();
    });
  }
  const bgClearBtn = document.getElementById('admin-bg-clear');
  if (bgClearBtn) {
    bgClearBtn.addEventListener('click', () => {
      settings.backgroundDataUrl = '';
      const bgInput = document.getElementById('admin-bg');
      if (bgInput) bgInput.value = '';
      saveSettings();
      init();
    });
  }
  
  document.getElementById('admin-mode').addEventListener('change', (e) => {
    const manual = e.target.value === 'manual';
    document.getElementById('admin-lat').disabled = !manual;
    document.getElementById('admin-lng').disabled = !manual;
    document.getElementById('admin-tz').disabled = !manual;
  });

  // Quick preset button for Deltebre, Spain
  const presetBtn = document.getElementById('preset-deltebre');
  if (presetBtn) {
    presetBtn.addEventListener('click', () => {
      // Fill preset values: lat 40.7196, lng 0.7082, Europe/Madrid, method MWL, asr Standard
      settings.mode = 'manual';
      settings.latitude = 40.7196;
      settings.longitude = 0.7082;
      settings.timezone = 'Europe/Madrid';
      settings.calculationMethod = 'MWL';
      settings.asrMethod = 'Standard';
      // Apply to form fields
      populateAdminForm();
      // Ensure manual fields are enabled
      document.getElementById('admin-mode').value = 'manual';
      document.getElementById('admin-lat').disabled = false;
      document.getElementById('admin-lng').disabled = false;
      document.getElementById('admin-tz').disabled = false;
    });
  }

  // Click handler for the visible Admin button in the header
  const adminBtn = document.getElementById('admin-btn');
  if (adminBtn) {
    adminBtn.addEventListener('click', () => {
      const panel = document.getElementById('admin-panel');
      toggleAdminPanel(!panel.classList.contains('active'));
    });
  }
}

function setupAdminTabs() {
  const tabs = Array.from(document.querySelectorAll('.admin-tab'));
  const sections = Array.from(document.querySelectorAll('.admin-section'));
  if (tabs.length === 0 || sections.length === 0) return;
  const activate = (tabId) => {
    tabs.forEach(btn => {
      const isActive = btn.dataset.tab === tabId;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    sections.forEach(sec => {
      sec.classList.toggle('active', sec.dataset.tabSection === tabId);
    });
  };
  tabs.forEach(btn => {
    btn.addEventListener('click', () => activate(btn.dataset.tab));
  });
  const defaultTab = tabs.find(t => t.classList.contains('active'))?.dataset.tab || tabs[0].dataset.tab;
  activate(defaultTab);
}

// Listen for global hotkeys
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.code === 'KeyA') {
    e.preventDefault();
    const panel = document.getElementById('admin-panel');
    toggleAdminPanel(!panel.classList.contains('active'));
  }
  if (e.code === 'Escape') {
    const panel = document.getElementById('admin-panel');
    if (panel.classList.contains('active')) {
      toggleAdminPanel(false);
    }
  }
});

// Theme toggle functionality
function setupThemeToggle() {
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const themes = ['dark', 'light', 'high-contrast'];
      const currentTheme = settings.theme || 'dark';
      const currentIndex = themes.indexOf(currentTheme);
      const nextIndex = (currentIndex + 1) % themes.length;
      const newTheme = themes[nextIndex];
      
      settings.theme = newTheme;
      saveSettings();
      applyUXUISettings();
    });
  }
}

// Settings toggle functionality
function setupSettingsToggle() {
  const settingsToggle = document.getElementById('settings-toggle');
  if (settingsToggle) {
    settingsToggle.addEventListener('click', () => {
      settings.showSettingsControls = !settings.showSettingsControls;
      saveSettings();
      applyUXUISettings();
    });
  }
}

// Font size controls functionality
function setupFontControls() {
  const fontDecrease = document.getElementById('font-decrease');
  const fontReset = document.getElementById('font-reset');
  const fontIncrease = document.getElementById('font-increase');
  
  if (fontDecrease) {
    fontDecrease.addEventListener('click', () => {
      const currentSize = parseFloat(settings.fontSize) || 1;
      const newSize = Math.max(0.8, currentSize - 0.1);
      settings.fontSize = newSize;
      saveSettings();
      applyUXUISettings();
    });
  }
  
  if (fontReset) {
    fontReset.addEventListener('click', () => {
      settings.fontSize = 1;
      saveSettings();
      applyUXUISettings();
    });
  }
  
  if (fontIncrease) {
    fontIncrease.addEventListener('click', () => {
      const currentSize = parseFloat(settings.fontSize) || 1;
      const newSize = Math.min(1.5, currentSize + 0.1);
      settings.fontSize = newSize;
      saveSettings();
      applyUXUISettings();
    });
  }
}

// Test function for ticker (can be called from browser console)
function testTicker() {
  console.log('Testing ticker functionality...');
  console.log('Current ticker text:', settings.tickerText);
  console.log('Ticker element:', document.getElementById('ticker'));
      console.log('Ticker container:', document.getElementById('ticker'));
  
  // Force a ticker update
  const ticker = document.getElementById('ticker');
  if (ticker) {
    console.log('Ticker element found, forcing update...');
    // This will trigger the ticker update function
    render();
  } else {
    console.error('Ticker element not found!');
  }
}

// Function to manually set ticker text for testing
function setTickerText(text) {
  console.log('Setting ticker text to:', text);
  settings.tickerText = text;
  saveSettings();
  render();
}

// Function to test RTL ticker with Arabic text (content-based detection)
function testRTLTicker() {
  console.log('Testing RTL ticker with Arabic text (content-based detection)...');
  // Set language to English but use Arabic text - should still be RTL
  settings.language = 'en';
  settings.tickerText = 'مرحباً بكم في مسجدنا! أوقات الصلاة معروضة أعلاه. يرجى التحقق من الجدول لصلوات اليوم.';
  saveSettings();
  render();
}

// Function to test LTR ticker with English text (content-based detection)
function testLTRTicker() {
  console.log('Testing LTR ticker with English text (content-based detection)...');
  // Set language to Arabic but use English text - should still be LTR
  settings.language = 'ar';
  settings.tickerText = 'Welcome to our mosque! Prayer times are displayed above. Please check the schedule for today\'s prayers.';
  saveSettings();
  render();
}

// Function to test mixed content (should default to LTR)
function testMixedTicker() {
  console.log('Testing mixed content ticker...');
  settings.language = 'en';
  settings.tickerText = 'Welcome to our mosque! مرحباً بكم في مسجدنا! Prayer times are displayed above.';
  saveSettings();
  render();
}

// Function to test Arabic text in English mode
function testArabicInEnglishMode() {
  console.log('Testing Arabic text in English mode...');
  settings.language = 'en';
  settings.tickerText = 'أوقات الصلاة اليوم: الفجر 5:30، الظهر 12:30، العصر 3:45، المغرب 6:15، العشاء 7:45';
  saveSettings();
  render();
}

// Function to test English text in Arabic mode
function testEnglishInArabicMode() {
  console.log('Testing English text in Arabic mode...');
  settings.language = 'ar';
  settings.tickerText = 'Today\'s prayer times: Fajr 5:30 AM, Dhuhr 12:30 PM, Asr 3:45 PM, Maghrib 6:15 PM, Isha 7:45 PM';
  saveSettings();
  render();
}

// Function to test manual RTL override with English text
function testManualRTLOverride() {
  console.log('Testing manual RTL override with English text...');
  settings.language = 'en';
  settings.tickerText = 'This is English text but will scroll RTL due to manual override!';
  settings.tickerForceRTL = true; // Force RTL direction
  saveSettings();
  render();
}

// Function to test manual LTR override with Arabic text
function testManualLTROverride() {
  console.log('Testing manual LTR override with Arabic text...');
  settings.language = 'ar';
  settings.tickerText = 'هذا نص عربي لكنه سيتحرك من اليسار إلى اليمين بسبب التجاوز اليدوي!';
  settings.tickerForceRTL = false; // Force LTR direction
  saveSettings();
  render();
}

// On page load
window.addEventListener('load', async () => {
  if (typeof initServerSettings === 'function') {
    await initServerSettings();
  }
  loadSettings();
  applyLayout();
  setupAdminHandlers();
  setupSettingsToggle();
  setupThemeToggle();
  setupFontControls();
  
  // Setup share button
  const shareBtn = document.getElementById('share-btn');
  if (shareBtn) {
    shareBtn.addEventListener('click', sharePrayerTimes);
  }
  
  init();
  
  // Auto-test ticker after a short delay
  setTimeout(() => {
    console.log('Auto-testing ticker...');
    testTicker();
    
    // Test setting a custom ticker text
    if (!settings.tickerText || settings.tickerText.trim() === '') {
      console.log('No ticker text found, setting test text...');
      setTickerText('Test ticker message - This should scroll from right to left!');
    }
    
    // Additional debugging
    const tickerContainer = document.getElementById('ticker');
    const ticker = document.getElementById('ticker');
    if (tickerContainer) {
      console.log('Ticker container styles:', {
        display: getComputedStyle(tickerContainer).display,
        visibility: getComputedStyle(tickerContainer).visibility,
        height: getComputedStyle(tickerContainer).height,
        width: getComputedStyle(tickerContainer).width,
        background: getComputedStyle(tickerContainer).background
      });
    }
    if (ticker) {
      console.log('Ticker element styles:', {
        display: getComputedStyle(ticker).display,
        visibility: getComputedStyle(ticker).visibility,
        height: getComputedStyle(ticker).height,
        width: getComputedStyle(ticker).width,
        innerHTML: ticker.innerHTML
      });
    }
  }, 2000);
});
