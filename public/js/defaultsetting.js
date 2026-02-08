// Default settings
let  defaultSettings = {
  mosqueName: "Mosque",
  locationLabel: "",
  mode: "auto",
  latitude: 0,
  longitude: 0,
  timezone: "",
  calculationMethod: "MWL",
  asrMethod: "Standard",
  iqamahDelay: 0, // minutes
  perIqamah: {Fajr:"", Dhuhr:"", Asr:"", Maghrib:"", Isha:""},
  language: "en",
  adminPanelLanguage: "en", // Admin panel language (en/es)
  timeFormat: "24h",
  hijriOffset: 0,
  tickerText: "Welcome to our mosque! Prayer times are displayed above. Please check the schedule for today's prayers.",
  tickerForceRTL: false, // Manual override for ticker direction (RTL/LTR)
  tickerSize: 1.5, // Font size for ticker text (in rem)
  footerHeight: 3, // Height of footer (in rem)
  logoDataUrl: "",
  backgroundDataUrl: "",
  // Default logo height (in rem). Users can customise this through the admin panel.
  logoHeight: 3,
  // Typography defaults
  fontFamily: "'Segoe UI', Tahoma, sans-serif",
  clockSize: 2,
  nextEventSize: 1.5,
  slideshowSize: 2.5,
  cardNameScale: 0.25,
  cardTimeScale: 0.3,
  cardIqamahScale: 0.18,
  // Slideshow vertical margin settings in pixels. Adjust these to move the
  // slideshow text up (decrease top margin or increase bottom margin) or down.
  slideshowMarginTop: 8,
  slideshowMarginBottom: 8,
  // Text for the slideshow displayed below the prayer cards. Enter multiple phrases
  // separated by newlines in the admin panel.
  slideshowText: "",
  cardHeight: 96, // px
  cardMaxWidth: 256, // px
  gap: 12, // px
  flashMinutes: 0
  , headerAlign: "space-between" // options: start, center, end/space-between
  , boardAlign: "start" // options: start or center alignment for prayer cards grid
  , showSunrise: false // whether to display Sunrise card
  , slideshowAlign: "center" // vertical alignment of slideshow text: start, center, end
  // Source for slideshow phrases. When 'manual', phrases come from slideshowText.
  // Other options trigger online fetching: 'quranRandom' (random Quran verse),
  // 'azkar' (morning/evening adhkar), or 'custom' (user-defined API returning JSON).
  , slideshowSource: "manual"
  // Custom API URL for slideshow data when slideshowSource is 'custom'
  , slideshowCustomUrl: ""
  // Timestamp (ms) of last successful fetch of slideshow data. Used for refresh logic.
  , slideshowLastFetched: 0
  // Number of hours after which slideshow data should be refreshed when using online sources.
  , slideshowRefreshHours: 6
  // Translation identifier or edition used when fetching Quran verses. For quranRandom this is
  // a translation ID on Quran.com (e.g., 131 for Saheeh International). For quranSeq this is
  // an edition identifier on AlQuran.cloud (e.g., en.pickthall). Leave empty to omit translation.
  , slideshowTranslation: "131"
  // Duration of each slide in seconds when rotating slideshow phrases. Only applies to online
  // sources; manual mode uses default 8-second rotation if not set.
  , slideshowDuration: 8
  // Whether to fall back to manual phrases when online sources fail or have no data.
  , slideshowFallback: true
  , weatherMode: "online" // 'manual' or 'online' option for weather
  , weatherEnabled: true // whether to display weather information
  , weatherTemp: "" // current temperature value (number or string)
  , weatherUnits: "C" // units for temperature: 'C' or 'F'
  , weatherCondition: "" // textual description of the weather (e.g., Clear, Rain)
  , weatherHigh: "" // high temperature value
  , weatherLow: "" // low temperature value
  , weatherHumidity: "" // humidity percentage or description
  , weatherWind: "" // wind information (e.g., 12 km/h)
  , weatherIcon: "" // Data URL of uploaded weather icon
  , weatherValidHours: 3 // number of hours after which weather info is considered stale
  , weatherLastUpdated: 0 // timestamp of last weather update
  , weatherApiKey: "" // API key used for online weather fetching
  , weatherProvider: "open-meteo" // provider for online weather (open-meteo is open source and requires no key)
  // Enhanced weather features
  , weatherForecast: false // show 5-day forecast
  , weatherAirQuality: false // show air quality information
  , weatherAlerts: false // show weather alerts
  , weatherFallbacks: true // enable API fallbacks for reliability
  , weatherForecastData: [] // store forecast data
  , weatherAirQualityData: null // store air quality data
  , weatherAlertsData: [] // store weather alerts
  // Prayer Time Enhancements
  , prayerNotifications: false // enable prayer time notifications
  , qiblaDirection: false // show qibla direction indicator
  , prayerTimeOffsets: {Fajr: 0, Dhuhr: 0, Asr: 0, Maghrib: 0, Isha: 0} // custom prayer time offsets
  , prayerSharing: false // enable prayer time sharing functionality
  , qiblaAngle: 0 // qibla direction angle in degrees
  , adhanEnabled: true // play adhan when prayer notifications trigger
  , adhanAudio: "audio/adhan/Beautiful_adhan.ogg" // built-in adhan audio file path
  // Friday mode: on Fridays replace Dhuhr with Jumu'ah card showing Khutbah and Prayer times.
  , fridayMode: false
  , jumuahKhutbahDelay: 0 // minutes after Dhuhr adhan to start Khutbah
  , jumuahPrayerDelay: 20 // minutes after Dhuhr adhan to start Jumu'ah prayer
  // Ramadan mode: enables Imsak card and optional Iftar countdown.
  , ramadanMode: false
  , imsakOffset: 10 // minutes before Fajr to compute Imsak
  , showIftarCountdown: false
  // View mode: choose between day, week or month view for prayer times
  , viewMode: "day"
  // UX/UI Settings
  , theme: "dark" // 'dark', 'light', 'high-contrast'
  , fontSize: 1 // Font size multiplier (0.8 to 1.5)
  , enableAnimations: true // Enable/disable animations and transitions
  , enableHoverEffects: true // Enable/disable hover effects
  , enableLoadingStates: true // Enable/disable loading animations
  , enableAccessibility: true // Enable/disable accessibility features
  , enableProgressIndicator: true // Enable/disable prayer time progress indicator
  , showSettingsControls: false // Show/hide theme and font controls
};
