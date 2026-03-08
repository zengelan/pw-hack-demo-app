// translations.js - Multilingual support for English and German

const translations = {
  en: {
    // Header
    pageTitle: "Password Security Demo",
    headerTitle: "Password Security Demo",
    
    // Step 1
    step1Title: "Step 1: Select Your Event / Classroom",
    step1Description: "This demo is running as a <strong>live event</strong>. Your instructor has created a dedicated room (event) for your class session &mdash; multiple instructors may be running this demo simultaneously in different classrooms. Please select the <strong>correct event or room</strong> that matches your current class session.",
    selectPlaceholder: "-- Select your event / classroom --",
    
    // Step 2
    step2Title: "Step 2: Enter Your Birthday as Password",
    formatLabel: "Format: <strong>DDMMYYYY</strong> &nbsp; Example: 15031998",
    passwordPlaceholder: "DDMMYYYY",
    calendarTooltip: "Open Date Picker",
    hashGeneratedLabel: "&#x26A1; SHA-256 Hash Generated:",
    fingerprintText: "This 64-character string is the <strong>\"fingerprint\"</strong> of your password. It is the <strong>only thing</strong> sent to the server.",
    submitButton: "Submit Hash to Instructor",
    metaToggle: "What information is sent along with your hash?",
    
    // Project Explanation
    aboutTitle: "&#x1F4DA; About This Project",
    aboutDescription: "This application is a security demonstration designed to show how authentication works in modern web apps &mdash; and why certain common practices are dangerous.",
    hashingTitle: "&#x1F512; How Hashing Works",
    hashingDescription: "When you type or pick your birthday, your browser runs it through a <strong>hash function</strong> (SHA-256). This creates a unique fingerprint which is sent to the server. <strong>Your actual birthday never leaves your device.</strong>",
    cowAnalogy: "&#x1F404; <strong>The Cow to Burger Analogy:</strong><br>Think of it like turning a cow into a burger. It is easy to go from cow &rarr; burger, but <strong>absolutely impossible to reconstruct the original cow from the burger</strong>. Hashing is a one-way mathematical function designed exactly like this.",
    hashingFooter: "Your password is never sent to the server. Instead, your browser computes this one-way fingerprint &mdash; and only the hash is transmitted.",
    warningTitle: "&#x26A0; The Illusion of Safety:",
    warningText: "Even though we use a secure <strong>SHA-256 hash</strong> (meaning the server never sees your password), this system is still extremely easy to hack. Why? Because birthdays are <strong>predictable</strong>.",
    attackDescription: "An attacker doesn't need to \"reverse\" the hash. They just use a <strong>brute-force function</strong>: they take every possible date in a 100-year range (~36,500 dates), hash each one, and compare them to your hash. On a modern computer, this takes <strong>less than a second</strong>. This project proves that even with strong math (hashing), a weak or predictable password makes your security irrelevant.",
    
    // Password Space Analysis
    passwordSpaceTitle: "&#x1F522; Password Character Space &amp; Brute Force Times",
    passwordSpaceIntro: "The <strong>character space</strong> of a password is the total number of possible combinations an attacker must try to guarantee cracking it. This table shows various password types ranked by strength (weakest &rarr; strongest), the size of their character space, and how long a brute-force attack would take using two different methods:",
    browserMethod: "<strong>Browser (1M hashes/sec):</strong> Using JavaScript in a web browser (SHA-256 via WebCrypto API)",
    gpuMethod: "<strong><a href=\"https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/rtx-4090/\" class=\"gpu-link\" target=\"_blank\" rel=\"noopener\">GPU RTX 4090<span class=\"gpu-tooltip\"><img src=\"gpu.png\" alt=\"NVIDIA RTX 4090\" class=\"gpu-image\"></span></a> (22B hashes/sec):</strong> Using a consumer GPU with hashcat for password cracking",
    
    // Table headers
    tablePasswordType: "Password Type",
    tableCharacterSet: "Character Set",
    tableFormula: "Formula",
    tableCombinations: "Combinations<br>(Digit Count)",
    tableBrowser: "Browser<br>(1M/s)",
    tableGPU: "GPU RTX 4090<br>(22B/s)",
    
    // Password types
    pwType4Pin: "4-digit PIN",
    pwTypeBirthday: "8-digit birthday (DDMMYYYY)",
    pwType6Digit: "6-digit number",
    pwType8Lower: "8-char lowercase only",
    pwType8Alnum: "8-char alphanumeric",
    pwType8Special: "8-char + special chars",
    pwType12Alnum: "12-char alphanumeric",
    pwType12Special: "12-char + special chars",
    
    // Character sets
    charSetDigits: "Digits 0–9",
    charSetDates: "Valid calendar dates",
    charSetLower: "a–z (26 chars)",
    charSetAlnum: "a–z, A–Z, 0–9 (62)",
    charSetAscii: "94 printable ASCII",
    
    // Time estimates
    timeInstant: "Instant",
    time10ms: "~10 ms",
    time37ms: "~37 ms",
    time1sec: "~1 second",
    time24days: "~2.4 days",
    time95sec: "~9.5 seconds",
    time69years: "~6.9 years",
    time28hours: "~2.8 hours",
    time193years: "~193 years",
    time32days: "~3.2 days",
    time102myears: "~102 million years",
    time4647years: "~4,647 years",
    time151byears: "~15.1 billion years",
    time685kyears: "~685,500 years",
    
    // Key takeaways
    keyTakeawaysTitle: "&#x1F4A1; Key Takeaways",
    takeaway1: "<strong>Birthdays are trivial to crack</strong> &mdash; under 40 milliseconds, even in a browser",
    takeaway2: "<strong>Length beats complexity</strong> &mdash; 12-char alphanumeric (102M years) &gt;&gt; 8-char + special chars (193 years)",
    takeaway3: "<strong>GPUs obliterate weak passwords</strong> &mdash; what takes 6.9 years in a browser falls to 2.8 hours on a $1,600 GPU",
    takeaway4: "<strong>This assumes NO salting</strong> &mdash; with proper salting, GPU attacks become impractical even for weak passwords",
    
    // Status messages
    statusSelectSpace: "Please select a space first.",
    statusEnterPassword: "Please enter a password.",
    statusInvalid8Digits: "Password must be 8 digits (DDMMYYYY).",
    statusSubmitting: "Submitting...",
    statusAccessDenied: "Access denied.",
    statusYourIP: "Your IP: ",
    statusMaxSubmissions: "Maximum submissions reached. No more passwords accepted.",
    statusSuccess: "Hash submitted successfully!",
    statusHash: "Hash: ",
    statusFailed: "Submission failed.",
    statusNetworkError: "Network error: ",
    
    // Space info table
    spaceLabel: "Space",
    locationLabel: "Location",
    descriptionLabel: "Description"
  },
  
  de: {
    // Header
    pageTitle: "Passwort-Sicherheits-Demo",
    headerTitle: "Passwort-Sicherheits-Demo",
    
    // Step 1
    step1Title: "Schritt 1: Wähle dein Event / Klassenzimmer",
    step1Description: "Diese Demo läuft als <strong>Live-Event</strong>. Dein Dozent hat einen dedizierten Raum (Event) für deine Unterrichtsstunde erstellt &mdash; mehrere Dozenten können diese Demo gleichzeitig in verschiedenen Klassenzimmern durchführen. Bitte wähle das <strong>richtige Event oder den richtigen Raum</strong>, der zu deiner aktuellen Unterrichtsstunde passt.",
    selectPlaceholder: "-- Wähle dein Event / Klassenzimmer --",
    
    // Step 2
    step2Title: "Schritt 2: Gib dein Geburtsdatum als Passwort ein",
    formatLabel: "Format: <strong>TTMMJJJJ</strong> &nbsp; Beispiel: 15031998",
    passwordPlaceholder: "TTMMJJJJ",
    calendarTooltip: "Datumsauswahl öffnen",
    hashGeneratedLabel: "&#x26A1; SHA-256 Hash generiert:",
    fingerprintText: "Diese 64-stellige Zeichenkette ist der <strong>\"Fingerabdruck\"</strong> deines Passworts. Es ist das <strong>einzige</strong>, was an den Server gesendet wird.",
    submitButton: "Hash an Dozent senden",
    metaToggle: "Welche Informationen werden zusammen mit deinem Hash gesendet?",
    
    // Project Explanation
    aboutTitle: "&#x1F4DA; Über dieses Projekt",
    aboutDescription: "Diese Anwendung ist eine Sicherheitsdemonstration, die zeigt, wie Authentifizierung in modernen Web-Apps funktioniert &mdash; und warum bestimmte gängige Praktiken gefährlich sind.",
    hashingTitle: "&#x1F512; Wie Hashing funktioniert",
    hashingDescription: "Wenn du dein Geburtsdatum eingibst oder auswählst, führt dein Browser es durch eine <strong>Hash-Funktion</strong> (SHA-256). Dies erstellt einen eindeutigen Fingerabdruck, der an den Server gesendet wird. <strong>Dein tatsächliches Geburtsdatum verlässt nie dein Gerät.</strong>",
    cowAnalogy: "&#x1F404; <strong>Die Kuh-zu-Burger-Analogie:</strong><br>Stell dir vor, du verwandelst eine Kuh in einen Burger. Es ist einfach, von Kuh &rarr; Burger zu gehen, aber <strong>absolut unmöglich, die ursprüngliche Kuh aus dem Burger zu rekonstruieren</strong>. Hashing ist eine mathematische Einwegfunktion, die genau so konzipiert ist.",
    hashingFooter: "Dein Passwort wird niemals an den Server gesendet. Stattdessen berechnet dein Browser diesen Einweg-Fingerabdruck &mdash; und nur der Hash wird übertragen.",
    warningTitle: "&#x26A0; Die Illusion der Sicherheit:",
    warningText: "Obwohl wir einen sicheren <strong>SHA-256-Hash</strong> verwenden (was bedeutet, dass der Server dein Passwort nie sieht), ist dieses System immer noch extrem leicht zu hacken. Warum? Weil Geburtsdaten <strong>vorhersehbar</strong> sind.",
    attackDescription: "Ein Angreifer muss den Hash nicht \"umkehren\". Er verwendet einfach eine <strong>Brute-Force-Funktion</strong>: Er nimmt jedes mögliche Datum in einem 100-Jahres-Bereich (~36.500 Daten), hasht jedes einzelne und vergleicht sie mit deinem Hash. Auf einem modernen Computer dauert das <strong>weniger als eine Sekunde</strong>. Dieses Projekt beweist, dass selbst mit starker Mathematik (Hashing) ein schwaches oder vorhersehbares Passwort deine Sicherheit irrelevant macht.",
    
    // Password Space Analysis
    passwordSpaceTitle: "&#x1F522; Passwort-Zeichenraum &amp; Brute-Force-Zeiten",
    passwordSpaceIntro: "Der <strong>Zeichenraum</strong> eines Passworts ist die Gesamtzahl möglicher Kombinationen, die ein Angreifer ausprobieren muss, um es garantiert zu knacken. Diese Tabelle zeigt verschiedene Passworttypen nach Stärke sortiert (schwächste &rarr; stärkste), die Größe ihres Zeichenraums und wie lange ein Brute-Force-Angriff mit zwei verschiedenen Methoden dauern würde:",
    browserMethod: "<strong>Browser (1M Hashes/Sek):</strong> Mit JavaScript in einem Webbrowser (SHA-256 über WebCrypto API)",
    gpuMethod: "<strong><a href=\"https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/rtx-4090/\" class=\"gpu-link\" target=\"_blank\" rel=\"noopener\">GPU RTX 4090<span class=\"gpu-tooltip\"><img src=\"gpu.png\" alt=\"NVIDIA RTX 4090\" class=\"gpu-image\"></span></a> (22B Hashes/Sek):</strong> Mit einer Consumer-GPU und hashcat zum Passwort-Knacken",
    
    // Table headers
    tablePasswordType: "Passwort-Typ",
    tableCharacterSet: "Zeichensatz",
    tableFormula: "Formel",
    tableCombinations: "Kombinationen<br>(Stellenanzahl)",
    tableBrowser: "Browser<br>(1M/s)",
    tableGPU: "GPU RTX 4090<br>(22B/s)",
    
    // Password types
    pwType4Pin: "4-stellige PIN",
    pwTypeBirthday: "8-stelliges Geburtsdatum (TTMMJJJJ)",
    pwType6Digit: "6-stellige Zahl",
    pwType8Lower: "8 Zeichen nur Kleinbuchstaben",
    pwType8Alnum: "8 Zeichen alphanumerisch",
    pwType8Special: "8 Zeichen + Sonderzeichen",
    pwType12Alnum: "12 Zeichen alphanumerisch",
    pwType12Special: "12 Zeichen + Sonderzeichen",
    
    // Character sets
    charSetDigits: "Ziffern 0–9",
    charSetDates: "Gültige Kalenderdaten",
    charSetLower: "a–z (26 Zeichen)",
    charSetAlnum: "a–z, A–Z, 0–9 (62)",
    charSetAscii: "94 druckbare ASCII",
    
    // Time estimates
    timeInstant: "Sofort",
    time10ms: "~10 ms",
    time37ms: "~37 ms",
    time1sec: "~1 Sekunde",
    time24days: "~2,4 Tage",
    time95sec: "~9,5 Sekunden",
    time69years: "~6,9 Jahre",
    time28hours: "~2,8 Stunden",
    time193years: "~193 Jahre",
    time32days: "~3,2 Tage",
    time102myears: "~102 Millionen Jahre",
    time4647years: "~4.647 Jahre",
    time151byears: "~15,1 Milliarden Jahre",
    time685kyears: "~685.500 Jahre",
    
    // Key takeaways
    keyTakeawaysTitle: "&#x1F4A1; Wichtige Erkenntnisse",
    takeaway1: "<strong>Geburtsdaten sind trivial zu knacken</strong> &mdash; unter 40 Millisekunden, sogar in einem Browser",
    takeaway2: "<strong>Länge schlägt Komplexität</strong> &mdash; 12 Zeichen alphanumerisch (102M Jahre) &gt;&gt; 8 Zeichen + Sonderzeichen (193 Jahre)",
    takeaway3: "<strong>GPUs vernichten schwache Passwörter</strong> &mdash; was 6,9 Jahre im Browser dauert, fällt auf 2,8 Stunden mit einer $1.600 GPU",
    takeaway4: "<strong>Dies setzt KEIN Salting voraus</strong> &mdash; mit ordnungsgemäßem Salting werden GPU-Angriffe selbst für schwache Passwörter unpraktisch",
    
    // Status messages
    statusSelectSpace: "Bitte wähle zuerst einen Raum.",
    statusEnterPassword: "Bitte gib ein Passwort ein.",
    statusInvalid8Digits: "Passwort muss 8 Ziffern sein (TTMMJJJJ).",
    statusSubmitting: "Wird gesendet...",
    statusAccessDenied: "Zugriff verweigert.",
    statusYourIP: "Deine IP: ",
    statusMaxSubmissions: "Maximale Anzahl an Übermittlungen erreicht. Keine weiteren Passwörter akzeptiert.",
    statusSuccess: "Hash erfolgreich übermittelt!",
    statusHash: "Hash: ",
    statusFailed: "Übermittlung fehlgeschlagen.",
    statusNetworkError: "Netzwerkfehler: ",
    
    // Space info table
    spaceLabel: "Raum",
    locationLabel: "Standort",
    descriptionLabel: "Beschreibung"
  }
};

// Current language state
let currentLanguage = 'de'; // Default to German

// Initialize language from localStorage or browser
function initLanguage() {
  const saved = localStorage.getItem('appLanguage');
  const browserLang = navigator.language.split('-')[0];
  currentLanguage = saved || (browserLang === 'de' ? 'de' : 'en');
  return currentLanguage;
}

// Get translation for current language
function t(key) {
  return translations[currentLanguage][key] || translations['en'][key] || key;
}

// Set language and save to localStorage
function setLanguage(lang) {
  if (translations[lang]) {
    currentLanguage = lang;
    localStorage.setItem('appLanguage', lang);
    updatePageLanguage();
  }
}

// Update all page elements with translations
function updatePageLanguage() {
  // Update document title
  document.title = t('pageTitle');
  
  // Update header
  const header = document.querySelector('.app-header h1');
  if (header) header.innerHTML = t('headerTitle');
  
  // Update Step 1
  updateElement('[data-i18n="step1Title"]', t('step1Title'));
  updateElement('[data-i18n="step1Description"]', t('step1Description'));
  
  const selectPlaceholder = document.querySelector('#space-select option[value=""]');
  if (selectPlaceholder) selectPlaceholder.textContent = t('selectPlaceholder');
  
  // Update Step 2
  updateElement('[data-i18n="step2Title"]', t('step2Title'));
  updateElement('[data-i18n="formatLabel"]', t('formatLabel'));
  
  const pwInput = document.getElementById('pw-input');
  if (pwInput) pwInput.placeholder = t('passwordPlaceholder');
  
  const calendarBtn = document.getElementById('calendar-trigger');
  if (calendarBtn) calendarBtn.title = t('calendarTooltip');
  
  updateElement('[data-i18n="hashGeneratedLabel"]', t('hashGeneratedLabel'));
  updateElement('[data-i18n="fingerprintText"]', t('fingerprintText'));
  
  const submitBtn = document.getElementById('submit-btn');
  if (submitBtn) submitBtn.textContent = t('submitButton');
  
  const metaToggle = document.getElementById('meta-toggle');
  if (metaToggle) metaToggle.textContent = t('metaToggle');
  
  // Update About section
  updateElement('[data-i18n="aboutTitle"]', t('aboutTitle'));
  updateElement('[data-i18n="aboutDescription"]', t('aboutDescription'));
  updateElement('[data-i18n="hashingTitle"]', t('hashingTitle'));
  updateElement('[data-i18n="hashingDescription"]', t('hashingDescription'));
  updateElement('[data-i18n="cowAnalogy"]', t('cowAnalogy'));
  updateElement('[data-i18n="hashingFooter"]', t('hashingFooter'));
  updateElement('[data-i18n="warningTitle"]', t('warningTitle'));
  updateElement('[data-i18n="warningText"]', t('warningText'));
  updateElement('[data-i18n="attackDescription"]', t('attackDescription'));
  
  // Update Password Space Analysis
  updateElement('[data-i18n="passwordSpaceTitle"]', t('passwordSpaceTitle'));
  updateElement('[data-i18n="passwordSpaceIntro"]', t('passwordSpaceIntro'));
  updateElement('[data-i18n="browserMethod"]', t('browserMethod'));
  updateElement('[data-i18n="gpuMethod"]', t('gpuMethod'));
  
  // Update table headers
  updateElement('[data-i18n="tablePasswordType"]', t('tablePasswordType'));
  updateElement('[data-i18n="tableCharacterSet"]', t('tableCharacterSet'));
  updateElement('[data-i18n="tableFormula"]', t('tableFormula'));
  updateElement('[data-i18n="tableCombinations"]', t('tableCombinations'));
  updateElement('[data-i18n="tableBrowser"]', t('tableBrowser'));
  updateElement('[data-i18n="tableGPU"]', t('tableGPU'));
  
  // Update password types
  updateElement('[data-i18n="pwType4Pin"]', t('pwType4Pin'));
  updateElement('[data-i18n="pwTypeBirthday"]', t('pwTypeBirthday'));
  updateElement('[data-i18n="pwType6Digit"]', t('pwType6Digit'));
  updateElement('[data-i18n="pwType8Lower"]', t('pwType8Lower'));
  updateElement('[data-i18n="pwType8Alnum"]', t('pwType8Alnum'));
  updateElement('[data-i18n="pwType8Special"]', t('pwType8Special'));
  updateElement('[data-i18n="pwType12Alnum"]', t('pwType12Alnum'));
  updateElement('[data-i18n="pwType12Special"]', t('pwType12Special'));
  
  // Update character sets
  updateElement('[data-i18n="charSetDigits"]', t('charSetDigits'));
  updateElement('[data-i18n="charSetDates"]', t('charSetDates'));
  updateElement('[data-i18n="charSetLower"]', t('charSetLower'));
  updateElement('[data-i18n="charSetAlnum"]', t('charSetAlnum'));
  updateElement('[data-i18n="charSetAscii"]', t('charSetAscii'));
  
  // Update key takeaways
  updateElement('[data-i18n="keyTakeawaysTitle"]', t('keyTakeawaysTitle'));
  updateElement('[data-i18n="takeaway1"]', t('takeaway1'));
  updateElement('[data-i18n="takeaway2"]', t('takeaway2'));
  updateElement('[data-i18n="takeaway3"]', t('takeaway3'));
  updateElement('[data-i18n="takeaway4"]', t('takeaway4'));
  
  // Update language selector
  document.getElementById('lang-select').value = currentLanguage;
}

function updateElement(selector, content) {
  const el = document.querySelector(selector);
  if (el) el.innerHTML = content;
}

// Export functions for use in other scripts
window.i18n = {
  t,
  setLanguage,
  initLanguage,
  updatePageLanguage,
  getCurrentLanguage: () => currentLanguage
};
