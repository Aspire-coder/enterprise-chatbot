const detectMessageLanguage = (message = "") => {
  if (/[\u3040-\u30ff\u3400-\u9fff]/.test(message)) return "Japanese";
  if (/[\u0400-\u04ff]|\b(zdravo|hvala|molim|proizvod\w*|proizvodi|srbija|srpski|kako|koji|koja|koje|šta|sta|uputstva|uslovi|poslovna\s+prilika)\b/i.test(message)) return "Serbian";
  if (/[ąćęłńóśźż]|\b(dzień|polski|produkty)\b/i.test(message)) return "Polish";
  if (/[\u00e4\u00f6\u00fc\u00df\u00c4\u00d6\u00dc]|\b(welche|welcher|welches|produkte|produkt|sind|enth[aä]lt|enthalten|programm|artikel|bitte|empfehlen|haarpflege|informationen|adresse|b[üu]ro|deutschland)\b/i.test(message)) return "German";
  if (/[\u00e9\u00e8\u00ea\u00eb\u00e0\u00e2\u00ee\u00ef\u00f4\u00fb\u00f9\u00e7\u0153]|\b(bonjour|quels?|quelles?|produits?|contient|programme|article|cheveux|recommande|adresse|bureau|france)\b/i.test(message)) return "French";
  if (/\b(ciao|raccontami|dimmi|come|quali|prodott[io]|contenut[oi]|programma|articolo|gravidanza|allattamento|farmaci|italia|indirizzo|ufficio)\b|[ìò]/i.test(message)) return "Italian";
  if (/[\u00e1\u00ed\u00f3\u00fa\u00f1\u00bf\u00a1]|\b(hola|qu[eé]|cu[aá]les?|productos?|art[ií]culo|cabello|recomienda|recomendar|direcci[oó]n|oficina|espa[nñ]a)\b/i.test(message)) return "Spanish";
  if (/\b(hallo|vertel|producten|nederland|zwanger|borstvoeding|medicatie|apotheker)\b/i.test(message)) return "Dutch";
  if (/\b(what|how|tell|show|recommend|products|please|help|can|should|is|are|the|about)\b/i.test(message)) return "English";

  return "";
};

const shouldUseSelectedLanguage = (message = "") =>
  /^show me forever living/i.test(message) ||
  /^the user replied/i.test(message);

const detectResponseLanguage = (message = "", selectedLanguage = "") => {
  if (selectedLanguage && shouldUseSelectedLanguage(message)) return selectedLanguage;

  if (["German", "Italian", "Serbian", "French", "Spanish"].includes(selectedLanguage)) {
    return selectedLanguage;
  }

  const messageLanguage = detectMessageLanguage(message);
  const shouldPreserveSelectedLanguage =
    selectedLanguage &&
    selectedLanguage !== "English" &&
    (!messageLanguage || messageLanguage === "English");

  if (shouldPreserveSelectedLanguage) return selectedLanguage;

  if (messageLanguage) return messageLanguage;

  return selectedLanguage || "English";
};

export {
  detectMessageLanguage,
  detectResponseLanguage,
};
