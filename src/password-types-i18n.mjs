/**
 * Password Types Internationalization (i18n)
 * Translations for password type descriptions, examples, and hints
 */

export const PASSWORD_TYPES_I18N = {
  birthday: {
    en: {
      description: "An 8-digit password derived from a birth date in DDMMYYYY format (e.g. 15081990 for 15 Aug 1990). Very common choice because it is easy to remember. People may use their own birthday, a family member's, or even a descendant's (child/grandchild). Only plausible calendar dates are valid: days 01–31, months 01–12, years 1920–2050 (131 years, ~47,848 valid dates).",
      exampleNote: "Examples: 01011990, 24121985, 07031975, 15082020",
      crackingHint: "⚡ ~47,800 combinations — crackable in milliseconds. The year range (1920–2050) and calendar constraints reduce the space dramatically."
    },
    de: {
      description: "Ein 8-stelliges Passwort, abgeleitet von einem Geburtsdatum im Format TTMMJJJJ (z.B. 15081990 für 15. Aug. 1990). Sehr häufige Wahl, da leicht zu merken. Personen verwenden oft ihr eigenes Geburtsdatum, das eines Familienmitglieds oder sogar eines Nachkommens (Kind/Enkelkind). Nur plausible Kalenderdaten sind gültig: Tage 01–31, Monate 01–12, Jahre 1920–2050 (131 Jahre, ~47.800 gültige Daten).",
      exampleNote: "Beispiele: 01011990, 24121985, 07031975, 15082020",
      crackingHint: "⚡ ~47.800 Kombinationen — in Millisekunden knackbar. Der Jahresbereich (1920–2050) und die Kalenderbeschränkungen reduzieren den Suchraum drastisch."
    }
  },
  
  digits8: {
    en: {
      description: "Any 8-digit numeric string using digits 0–9 with no constraints. Includes PINs, random numbers, and non-date patterns like 12345678 or 00000000.",
      exampleNote: "Examples: 00000000, 12345678, 87654321, 39471628",
      crackingHint: "⚡ 100 million combinations — a modern GPU can crack unsalted SHA-256 in seconds. Sequential patterns (12345678) are found instantly."
    },
    de: {
      description: "Beliebige 8-stellige Zahlenkette aus Ziffern 0–9 ohne Einschränkungen. Umfasst PINs, Zufallszahlen und Muster wie 12345678 oder 00000000.",
      exampleNote: "Beispiele: 00000000, 12345678, 87654321, 39471628",
      crackingHint: "⚡ 100 Millionen Kombinationen — eine moderne GPU kann ungesalzenes SHA-256 in Sekunden knacken. Sequenzielle Muster (12345678) werden sofort gefunden."
    }
  },
  
  lowercase8: {
    en: {
      description: "An 8-character password using only lowercase letters (a–z). No digits, uppercase, or special characters. Common words like 'password' or 'sunshine' are vulnerable to dictionary attacks.",
      exampleNote: "Examples: password, sunshine, abcdefgh, qwertyui",
      crackingHint: "⚡ 208 billion combinations — takes days in a browser, but only seconds on a GPU. Dictionary attacks crack common words instantly."
    },
    de: {
      description: "Ein 8-Zeichen-Passwort mit nur Kleinbuchstaben (a–z). Keine Ziffern, Großbuchstaben oder Sonderzeichen. Gängige Wörter wie 'password' oder 'sunshine' sind anfällig für Wörterbuchangriffe.",
      exampleNote: "Beispiele: password, sunshine, abcdefgh, qwertyui",
      crackingHint: "⚡ 208 Milliarden Kombinationen — dauert Tage im Browser, aber nur Sekunden auf einer GPU. Wörterbuchangriffe knacken häufige Wörter sofort."
    }
  },
  
  alphanumeric8: {
    en: {
      description: "An 8-character password using lowercase, uppercase letters, and digits (a-z, A-Z, 0-9). No special characters. More secure than lowercase-only but still vulnerable to dictionary attacks for patterns like 'Admin123' or 'Password1'.",
      exampleNote: "Examples: Admin123, Pass2024, Test1234, aB3xY9z1",
      crackingHint: "⚡ 218 trillion combinations — takes ~7 years in a browser, but only ~3 hours on a high-end GPU. Common patterns (Admin123, Password1) crack instantly via dictionary attacks."
    },
    de: {
      description: "Ein 8-Zeichen-Passwort mit Kleinbuchstaben, Großbuchstaben und Ziffern (a-z, A-Z, 0-9). Keine Sonderzeichen. Sicherer als nur Kleinbuchstaben, aber immer noch anfällig für Wörterbuchangriffe bei Mustern wie 'Admin123' oder 'Password1'.",
      exampleNote: "Beispiele: Admin123, Pass2024, Test1234, aB3xY9z1",
      crackingHint: "⚡ 218 Billionen Kombinationen — dauert ~7 Jahre im Browser, aber nur ~3 Stunden auf einer High-End-GPU. Häufige Muster (Admin123, Password1) werden sofort durch Wörterbuchangriffe geknackt."
    }
  }
};

/**
 * Get localized password type information
 */
export function getPasswordTypeI18n(typeId, lang = 'en') {
  const translations = PASSWORD_TYPES_I18N[typeId];
  if (!translations) return null;
  
  const locale = translations[lang] || translations['en'];
  return locale;
}

/**
 * Get all localized labels for UI display
 */
export function getPasswordTypeLabels(lang = 'en') {
  const labels = {
    birthday: {
      en: 'Birthday (DDMMYYYY)',
      de: 'Geburtstag (TTMMJJJJ)'
    },
    digits8: {
      en: '8-Digit PIN (00000000–99999999)',
      de: '8-stellige PIN (00000000–99999999)'
    },
    lowercase8: {
      en: '8 Lowercase Letters (a–z)',
      de: '8 Kleinbuchstaben (a–z)'
    },
    alphanumeric8: {
      en: '8-Char Alphanumeric (a-z, A-Z, 0-9)',
      de: '8-Zeichen Alphanumerisch (a-z, A-Z, 0-9)'
    }
  };
  
  return Object.entries(labels).reduce((acc, [key, value]) => {
    acc[key] = value[lang] || value['en'];
    return acc;
  }, {});
}
