import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  History,
  MessageCircle,
  MoreVertical,
  RefreshCw,
  Settings,
  X,
  Send,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  ExternalLink,
  Globe2,
  Languages,
  ShoppingCart,
  Star,
  UserRound,
  CheckCircle2,
} from "lucide-react";
import { countryLanguageOptions } from "./countryLanguageOptions";

const documentLinks = [
  {
    label: "Privacy Notice",
    href: "/documents/privacy-notice.docx",
    download: "privacy-notice.docx",
  },
  {
    label: "Privacy Notice (U.S. Addendum)",
    href: "/documents/privacy-notice-us-addendum.docx",
    download: "privacy-notice-us-addendum.docx",
  },
  {
    label: "Company Policy (USA)",
    href: "/documents/company-policy-usa.docx",
    download: "company-policy-usa.docx",
  },
  {
    label: "FLP Individual Arbitration and Class Action Waiver Agreement",
    href: "/documents/flp-arbitration-class-action-waiver.docx",
    download: "flp-arbitration-class-action-waiver.docx",
  },
];

const navigationTree = [
  {
    label: "Products",
    children: [
      { label: "Aloe Products", prompt: "Show me Forever Living aloe product recommendations." },
      { label: "Bee Products", prompt: "Show me Forever Living bee product recommendations, including honey, propolis, pollen, and royal jelly products." },
      { label: "Skincare", prompt: "Show me Forever Living skincare product recommendations, including skin care, moisturiser, lotion, cream, serum, and body care options." },
      { label: "Hair Care", prompt: "Show me Forever Living hair care product recommendations, including shampoo, conditioner, and hair oil options." },
      { label: "Nutrition", prompt: "Show me Forever Living nutrition product recommendations, including supplements, vitamins, and wellness options." },
      { label: "Weight Management", prompt: "Show me Forever Living weight management product recommendations, including shake, fibre, protein, and Clean 9 options." },
    ],
  },
  {
    label: "Business Opportunity",
    children: [
      { label: "Become a Forever Business Owner" },
      { label: "Become a Manager" },
      { label: "Compensation Plan" },
      { label: "Incentive Qualification" },
      { label: "Business Training" },
      { label: "International Business Opportunities" },
    ],
  },
  {
    label: "Incentives & Recognition",
    children: [
      { label: "Current Incentives" },
      { label: "Chairman's Bonus" },
      { label: "Travel Programs" },
      { label: "Recognition Programs" },
      { label: "Qualification Requirements" },
    ],
  },
  {
    label: "Orders & Returns",
    children: [
      { label: "Track an Order" },
      { label: "Return a Product" },
      { label: "Refund Information" },
      { label: "Shipping Information" },
    ],
  },
  {
    label: "Training & Learning",
    children: [
      { label: "Product Training" },
      { label: "Business Training" },
      { label: "Getting Started" },
      { label: "Frequently Asked Questions" },
    ],
  },
  {
    label: "Contact Support",
    children: [
      { label: "Talk to a Human" },
      { label: "Contact Customer Service" },
      { label: "Technical Support" },
    ],
  },
];

const countryOptions = countryLanguageOptions.map(({ country: label }) => ({
  code: label,
  label,
}));

const countryByBrowserCode = {
  AU: "Australia",
  BR: "Brazil",
  CA: "Canada",
  DK: "Denmark",
  EC: "Ecuador",
  FR: "France",
  DE: "Germany",
  IN: "India",
  IE: "Ireland",
  IT: "Italy",
  JP: "Japan",
  KR: "South Korea",
  MX: "Mexico",
  NL: "Netherlands",
  NO: "Norway",
  SG: "Singapore",
  ZA: "South Africa",
  ES: "Spain",
  SE: "Sweden",
  GB: "United Kingdom",
  US: "United States",
};

const languageCodeByLabel = {
  Albanian: "sq",
  Arabic: "ar",
  Azerbaijani: "az",
  Bosnia: "bs",
  Bulgarian: "bg",
  Chinese: "zh",
  Croatian: "hr",
  Czech: "cs",
  Danish: "da",
  Dutch: "nl",
  English: "en",
  Estonian: "et",
  "F.Y.R.O.Macedonia": "mk",
  Finnish: "fi",
  French: "fr",
  Georgian: "ka",
  German: "de",
  Greek: "el",
  Hebrew: "he",
  Hungarian: "hu",
  Italian: "it",
  Japanese: "ja",
  Kazakh: "kk",
  Khmer: "km",
  Korean: "ko",
  Kurdish: "ku",
  Kyrgyz: "ky",
  Latvian: "lv",
  Lithuanian: "lt",
  Malay: "ms",
  Montenegrin: "cnr",
  Mongolian: "mn",
  Norwegian: "no",
  Polish: "pl",
  Portuguese: "pt",
  Romanian: "ro",
  Russian: "ru",
  Serbian: "sr",
  Slovak: "sk",
  Slovenian: "sl",
  Spanish: "es",
  Swedish: "sv",
  Thai: "th",
  Turkish: "tr",
  Ukrainian: "uk",
  Uzbek: "uz",
  Vietnamese: "vi",
};

const toLanguageCode = (label) =>
  languageCodeByLabel[label] || label.toLowerCase().replace(/[^a-z0-9]+/g, "-");

const toLanguageOption = (label) => ({
  code: toLanguageCode(label),
  label,
});

const getCountryLanguages = (countryCode) => {
  const languages =
    countryLanguageOptions.find((option) => option.country === countryCode)
      ?.languages || ["English"];

  return Array.isArray(languages) ? languages : [languages];
};

const getLanguageOptionsForCountry = (countryCode) =>
  getCountryLanguages(countryCode).map(toLanguageOption);

const getInitialCountry = (countryCode) => {
  const matchedCountry = countryByBrowserCode[countryCode] || countryCode;

  return countryOptions.some((option) => option.code === matchedCountry)
    ? matchedCountry
    : "United Kingdom";
};

const getInitialLanguage = (countryCode, languageCode) => {
  const availableLanguages = getLanguageOptionsForCountry(countryCode);

  return (
    availableLanguages.find((option) => option.code === languageCode)?.code ||
    availableLanguages[0]?.code ||
    "en"
  );
};

const getDetectedLocale = () => {
  const browserLanguage =
    typeof navigator !== "undefined" ? navigator.language || "en-GB" : "en-GB";
  const parts = browserLanguage.split("-");
  const languageCode = parts[0] || "en";
  const countryCode = (parts[1] || "GB").toUpperCase();

  return {
    countryCode,
    languageCode,
  };
};

const createWelcomeMessage = () => ({
  role: "assistant",
  text: `Hello, I'm ASK Vera, your Forever Living AI assistant.

I can help with product information, distributor guidance, market-specific documents, and support topics based on the country you select.

Ask a question below or choose a topic to get started.`,
  showSource: false,
});

const createLocaleMessage = (detectedCountry = "United Kingdom") => ({
  role: "assistant",
  type: "locale",
  text: `Hi! 👋 We sensed you're in **${detectedCountry}**. Does that sound right?

I'm here to help with everything specific to your market. Would you like to continue with ${detectedCountry} or choose a different country/language?`,
  showSource: false,
});

const consentMessageByLanguage = {
  English: (country) => `Thank you for confirming ${country}.

Before we continue, please note that ASK Vera is a generative AI assistant, not a human, doctor, pharmacist, financial advisor, or legal advisor.

By clicking "I agree", you acknowledge that your conversation will be used to retrieve helpful, approved information from Forever Living's ${country}-specific knowledge base and documents. All responses are grounded in official sources only.

You can withdraw consent anytime by contacting the Forever Living team.`,
  Italian: (country) => `Grazie per aver confermato ${country}.

Prima di continuare, tieni presente che ASK Vera è un assistente AI generativo, non una persona, un medico, un farmacista, un consulente finanziario o un consulente legale.

Cliccando su "Accetto", riconosci che la tua conversazione verrà utilizzata per recuperare informazioni utili e approvate dalla knowledge base e dai documenti Forever Living specifici per ${country}. Tutte le risposte si basano esclusivamente su fonti ufficiali.

Puoi ritirare il consenso in qualsiasi momento contattando il team Forever Living.`,
  Dutch: (country) => `Bedankt voor het bevestigen van ${country}.

Voordat we verdergaan: ASK Vera is een generatieve AI-assistent, geen mens, arts, apotheker, financieel adviseur of juridisch adviseur.

Door op "Ik ga akkoord" te klikken, erken je dat je gesprek wordt gebruikt om behulpzame, goedgekeurde informatie op te halen uit de knowledgebase en documenten van Forever Living die specifiek zijn voor ${country}. Alle antwoorden zijn uitsluitend gebaseerd op officiële bronnen.

Je kunt je toestemming op elk moment intrekken door contact op te nemen met het Forever Living-team.`,
  French: (country) => `Merci d’avoir confirmé ${country}.

Avant de continuer, veuillez noter que ASK Vera est une assistante d’IA générative, et non une personne, un médecin, un pharmacien, un conseiller financier ou un conseiller juridique.

En cliquant sur « J’accepte », vous reconnaissez que votre conversation sera utilisée pour rechercher des informations utiles et approuvées dans la base de connaissances et les documents Forever Living spécifiques à ${country}. Toutes les réponses s’appuient uniquement sur des sources officielles.

Vous pouvez retirer votre consentement à tout moment en contactant l’équipe Forever Living.`,
  Serbian: (country) => `Hvala što ste potvrdili ${country}.

Pre nego što nastavimo, imajte u vidu da je ASK Vera generativni AI asistent, a ne čovek, lekar, farmaceut, finansijski savetnik ili pravni savetnik.

Klikom na „Slažem se” potvrđujete da će se vaš razgovor koristiti za pronalaženje korisnih i odobrenih informacija iz baze znanja i dokumenata Forever Living specifičnih za ${country}. Svi odgovori se zasnivaju isključivo na zvaničnim izvorima.

Svoju saglasnost možete povući u bilo kom trenutku kontaktiranjem Forever Living tima.`,
};

const createConsentMessage = (country = "your country", language = "English") => ({
  role: "assistant",
  type: "consent",
  text: (consentMessageByLanguage[language] || consentMessageByLanguage.English)(country),
  showSource: false,
});


const loadingTextByLanguage = {
  English: "ASK Vera is looking that up for you...",
  German: "ASK Vera sucht das gerade für dich heraus...",
  French: "ASK Vera recherche cela pour vous...",
  Spanish: "ASK Vera está buscando eso para ti...",
  Japanese: "ASK Vera が確認しています...",
};

const getLoadingText = (languageLabel = "English") =>
  loadingTextByLanguage[languageLabel] || loadingTextByLanguage.English;

const consentButtonLabelByLanguage = {
  English: "I agree",
  Italian: "Accetto",
  Dutch: "Ik ga akkoord",
  French: "J’accepte",
  Serbian: "Slažem se",
};

const consentSuccessTextByLanguage = {
  English:
    "Thank you for accepting the Terms of Use. Your privacy is important to us and we maintain safeguards to protect your data.",
  Italian:
    "Grazie per aver accettato i Termini di utilizzo. La tua privacy è importante per noi e manteniamo misure di sicurezza per proteggere i tuoi dati.",
  Dutch:
    "Bedankt voor het accepteren van de gebruiksvoorwaarden. Je privacy is belangrijk voor ons en we nemen maatregelen om je gegevens te beschermen.",
  French:
    "Merci d’avoir accepté les Conditions d’utilisation. Votre confidentialité est importante pour nous et nous maintenons des mesures de protection pour vos données.",
  Serbian:
    "Hvala što ste prihvatili Uslove korišćenja. Vaša privatnost nam je važna i primenjujemo mere zaštite vaših podataka.",
};

const getConsentButtonLabel = (languageLabel = "English") =>
  consentButtonLabelByLanguage[languageLabel] || consentButtonLabelByLanguage.English;

const getConsentSuccessText = (languageLabel = "English") =>
  consentSuccessTextByLanguage[languageLabel] || consentSuccessTextByLanguage.English;

const isGreeting = (text) => /^(hi|hello|hey|hiya|good morning|good afternoon|good evening)[.! ]*$/i.test(text);

const isShortFollowUp = (text) =>
  /^(yes|yeah|yep|sure|ok|okay|please|more|tell me more|continue|go on|no|not now|no thanks)[.! ]*$/i.test(
    text.trim(),
  );

const getContextualFollowUpPrompt = (question, messages, selectedLanguageLabel = "English") => {
  if (!isShortFollowUp(question)) return question;

  const previousUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user");
  const previousAssistantMessage = [...messages]
    .reverse()
    .find(
      (message) =>
        message.role === "assistant" &&
        !["locale", "consent", "handoff"].includes(message.type),
    );

  if (!previousUserMessage || !previousAssistantMessage) return question;

  return [
    `The user replied "${question}" to the previous answer.`,
    `Previous user topic: ${previousUserMessage.text}`,
    `Previous assistant answer: ${previousAssistantMessage.text}`,
    `Continue from that context and answer the user's follow-up in ${selectedLanguageLabel}. Do not treat the short reply as a standalone request.`,
  ].join("\n\n");
};

const renderMessageText = (text) =>
  text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }

    return part;
  });


const stripVisibleProductJson = (text = "") =>
  text
    .replace(/\{[\s\S]*"product_cards"[\s\S]*\}/g, "")
    .replace(/\{\s*\\"product_cards\\"[\s\S]*?\}\s*\]?/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const splitProductAnswer = (text = "", hasProducts = false) => {
  const cleanText = stripVisibleProductJson(text);

  if (!hasProducts || !cleanText) {
    return { summary: cleanText, details: "" };
  }

  const paragraphs = cleanText.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);

  if (paragraphs.length > 1) {
    return {
      summary: paragraphs[0],
      details: paragraphs.slice(1).join("\n\n"),
    };
  }

  const sentences = cleanText.match(/[^.!?ã€‚ï¼ï¼Ÿ]+[.!?ã€‚ï¼ï¼Ÿ]+|[^.!?ã€‚ï¼ï¼Ÿ]+$/g) || [cleanText];
  const summary = sentences.slice(0, 2).join(" ").trim();
  const details = sentences.slice(2).join(" ").trim();

  return { summary, details };
};

const formatProductCategory = (category = "") =>
  category.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const getProductDescription = (product) => {
  const directDescription = product.approvedBenefit || product.description;

  if (directDescription) {
    return directDescription;
  }

  const category = product.categories?.[0];

  return category
    ? `A Forever Living ${formatProductCategory(category)} product. Open product details to learn more.`
    : "Open product details to learn more.";
};

const isSubstantiveDetails = (value = "") => {
  const compact = stripVisibleProductJson(value)
    .replace(/\*\*[^*]+:\*\*/g, "")
    .replace(/^[\s:–—-]+|[\s:–—-]+$/g, "")
    .trim();

  return compact.length >= 80 && /[.!?ã€‚ï¼ï¼Ÿ]/.test(compact);
};

function ImageCards({ images }) {
  if (!images?.length) return null;

  return (
    <div className="mt-5 space-y-3">
      <div className="text-xs font-medium text-[#6b756c]">
        Related visual guide
      </div>

      <div className="grid gap-3">
        {images.map((image, index) => (
          <a
            key={`${image.url}-${index}`}
            href={image.url}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-[20px] border border-[#e5ded2] bg-white shadow-sm hover:border-[#9ccfc1] transition"
          >
            <img
              src={image.url}
              alt={image.alt || image.title || "Related visual guide"}
              className="w-full max-h-[300px] object-contain bg-white"
              loading="lazy"
            />
            {image.title && (
              <div className="border-t border-[#e5ded2] px-4 py-3 text-sm font-semibold text-[#1f2937]">
                {image.title}
              </div>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}
function MessageBody({ msg }) {
  const hasProducts = msg.productCards?.length > 0;
  const hasImages = msg.imageCards?.length > 0;
  const { summary, details } = splitProductAnswer(msg.text, hasProducts);
  const hasSubstantiveDetails = isSubstantiveDetails(details);

  return (
    <>
      {summary && (
        <p className="text-[14.75px] leading-[1.72] whitespace-pre-line">
          {renderMessageText(summary)}
        </p>
      )}

      {hasImages && (
        <ImageCards images={msg.imageCards.slice(0, 3)} />
      )}

      {hasProducts && (
        <ProductCarousel products={msg.productCards} />
      )}

      {hasProducts && hasSubstantiveDetails && (
        <details className="mt-4 rounded-[18px] border border-[#e8e0d4] bg-[#fbf8f1] px-4 py-3 group">
          <summary className="cursor-pointer list-none text-[13.5px] font-semibold text-[#245f54] flex items-center justify-between gap-3">
            <span>Why these?</span>
            <ChevronRight
              size={16}
              className="transition-transform group-open:rotate-90"
            />
          </summary>

          <p className="mt-3 text-[13.5px] leading-6 text-[#4b5b52] whitespace-pre-line">
            {renderMessageText(details)}
          </p>
        </details>
      )}
    </>
  );
}
function ProductCarousel({ products }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [expandedReasons, setExpandedReasons] = useState({});
  const maxIndex = Math.max(products.length - 2, 0);

  if (!products?.length) return null;

  const previous = () => setActiveIndex((value) => Math.max(value - 1, 0));
  const next = () => setActiveIndex((value) => Math.min(value + 1, maxIndex));
  const toggleReason = (index) =>
    setExpandedReasons((current) => ({
      ...current,
      [index]: !current[index],
    }));

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-semibold tracking-wider uppercase text-[#5c6b60]">
          Recommended Products
        </span>

        {products.length > 2 && (
          <div className="flex gap-2">
            <button
              onClick={previous}
              disabled={activeIndex === 0}
              className="w-8 h-8 rounded-full bg-[#eef5ef] text-[#0f766e] disabled:opacity-40 flex items-center justify-center"
              aria-label="Previous products"
            >
              <ChevronLeft size={16} />
            </button>

            <button
              onClick={next}
              disabled={activeIndex === maxIndex}
              className="w-8 h-8 rounded-full bg-[#eef5ef] text-[#0f766e] disabled:opacity-40 flex items-center justify-center"
              aria-label="Next products"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      <div className="overflow-hidden">
        <motion.div
          animate={{ x: `-${activeIndex * 50}%` }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="flex"
        >
          {products.map((product, index) => {
            const productUrl = product.buyUrl || product.url;
            const productDescription = getProductDescription(product);
            const isReasonExpanded = Boolean(expandedReasons[index]);
            const hasLongReason = productDescription.length > 72;

            return (
              <div key={`${product.name}-${index}`} className="min-w-[50%] pr-3">
                <div className="min-h-[490px] rounded-3xl border border-[#e6dcc9] bg-white shadow-sm hover:shadow-xl overflow-hidden flex flex-col transition-all duration-300">
                  <a
                    href={product.url || productUrl || undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="block h-[168px] bg-gradient-to-br from-[#f0f4f1] to-[#e8f0e8] relative overflow-hidden shrink-0"
                  >
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-full h-full object-contain p-5 bg-white transition-transform hover:scale-105 duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center px-6 text-center text-sm font-medium text-[#2f6f61] bg-white">
                        {product.name || "Forever Living Product"}
                      </div>
                    )}

                    {product.priceGbp && (
                      <div className="absolute left-4 bottom-4 rounded-2xl bg-white/95 backdrop-blur px-4 py-1 text-xs font-semibold text-[#1f2a24] shadow border border-white/80">
                        {product.priceGbp}
                      </div>
                    )}
                  </a>

                  <div className="p-3 flex flex-col flex-1 min-h-0">
                    <a
                      href={product.url || productUrl || undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[15.5px] font-semibold leading-tight text-[#1c2a24] hover:text-[#2f6f61] transition line-clamp-2 min-h-[44px]"
                    >
                      {product.name || "Product details"}
                    </a>

                    {(product.categories?.length > 0 || product.rating) && (
                      <div className="mt-2 flex items-center justify-between gap-2 min-h-[18px]">
                        <span className="text-xs text-[#7a847b] truncate">
                          {product.categories?.slice(0, 2).join(", ")}
                        </span>

                        {product.rating && (
                          <span className="flex items-center gap-1 text-xs text-[#111827] shrink-0">
                            <Star size={12} fill="currentColor" />
                            {product.rating}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="mt-3 text-[13px] leading-relaxed text-[#47544a] min-h-[138px]">
                      <div className="font-semibold text-[#2f6f61] mb-2 tracking-wide text-xs">
                        WHY THIS PRODUCT?
                      </div>
                      <p className={isReasonExpanded ? "" : "line-clamp-4"}>
                        {productDescription}
                      </p>
                      {hasLongReason && (
                        <button
                          type="button"
                          onClick={() => toggleReason(index)}
                          className="mt-2 cursor-pointer text-left text-xs font-medium text-[#2f6f61] hover:text-[#1e5248] flex items-center gap-1 transition"
                          aria-expanded={isReasonExpanded}
                        >
                          {isReasonExpanded ? "Show less" : "Read more"}
                          <ChevronRight size={13} className={`transition ${isReasonExpanded ? 'rotate-90' : ''}`} />
                        </button>
                      )}
                      {productUrl && (
                        <a
                          href={productUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex items-center gap-1 font-semibold text-[#2f6f61] hover:text-[#1e5a4f] transition"
                        >
                          View product details
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>

                    <div className="mt-auto pt-3 grid grid-cols-[1fr_40px] gap-2">
                      <a
                        href={productUrl || undefined}
                        target="_blank"
                        rel="noreferrer"
                        className="h-10 rounded-2xl border border-[#2f6f61] px-3 text-center text-xs font-semibold text-[#2f6f61] hover:bg-[#f0f7f4] transition flex items-center justify-center leading-tight"
                      >
                        Buy Now
                      </a>

                      <a
                        href={productUrl || undefined}
                        target="_blank"
                        rel="noreferrer"
                        className="w-10 h-10 rounded-2xl bg-[#2f6f61] text-white flex items-center justify-center hover:bg-[#1e5a4f] transition shadow-sm"
                        aria-label={`Open ${product.name || "product"} cart page`}
                      >
                        <ShoppingCart size={17} />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}

export default function App() {
  const detectedLocale = useRef(getDetectedLocale());
  const initialCountry = getInitialCountry(detectedLocale.current.countryCode);
  const [open, setOpen] = useState(false);
  const [country, setCountry] = useState(initialCountry);
  const [language, setLanguage] = useState(() =>
    getInitialLanguage(initialCountry, detectedLocale.current.languageCode),
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [localeConfirmed, setLocaleConfirmed] = useState(false);
  const [showCountrySelector, setShowCountrySelector] = useState(false);
  const [hasConsented, setHasConsented] = useState(false);
  const [consentMode, setConsentMode] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [showConsentSuccess, setShowConsentSuccess] = useState(false);
  const [conversationId, setConversationId] = useState(null); 
  const [navigationCards, setNavigationCards] = useState([]);
  const messagesEndRef = useRef(null);
  const latestAssistantRef = useRef(null);

  const [messages, setMessages] = useState([
    createWelcomeMessage(),
    createLocaleMessage(initialCountry),
  ]);
  const availableLanguageOptions = getLanguageOptionsForCountry(country);
  const selectedCountryLabel =
    countryOptions.find((option) => option.code === country)?.label ||
    country;
  const selectedLanguageLabel =
    availableLanguageOptions.find((option) => option.code === language)?.label ||
    language.toUpperCase();
  const isRootNavigation =
    navigationCards.length === navigationTree.length &&
    navigationCards.every((card, index) => card.label === navigationTree[index].label);

  const handleCountryChange = (event) => {
    const nextCountry = event.target.value;
    const nextLanguageOptions = getLanguageOptionsForCountry(nextCountry);

    setCountry(nextCountry);
    setLanguage(nextLanguageOptions[0]?.code || "en");
  };

  useEffect(() => {
    if (!showConsentSuccess) return;

    const timer = window.setTimeout(() => {
      setShowConsentSuccess(false);
    }, 4200);

    return () => window.clearTimeout(timer);
  }, [showConsentSuccess]);

  useEffect(() => {
    if (loading || pendingQuestion) {
      messagesEndRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });

      return;
    }

    const latestMessage = messages[messages.length - 1];

    if (latestMessage?.role === "assistant") {
      latestAssistantRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });

      return;
    }

    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, loading, pendingQuestion, consentMode, localeConfirmed]);

  const startConsentFlow = () => {
    setLocaleConfirmed(true);
    setShowCountrySelector(false);
    setConsentMode(true);
    setMessages((prev) => {
      const alreadyHasConsent = prev.some((message) => message.type === "consent");

      return alreadyHasConsent
        ? prev
        : [...prev, createConsentMessage(selectedCountryLabel, selectedLanguageLabel)];
    });
  };

  const submitQuestion = async (question) => {
    setLoading(true);

    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";
      const response = await fetch(`${apiBase}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: question, selectedCountry: selectedCountryLabel, selectedLanguage: selectedLanguageLabel, conversationId: conversationId  }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to reach ASK Vera right now.");
      }
	  if (data.conversationId) {
  setConversationId(data.conversationId);   }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: data.answer,
          citations: data.citations || [],
          productCards: data.productCards || [],
          imageCards: data.imageCards || [],
        },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text:
            error.message ||
            "I couldn't reach ASK Vera right now. Please try again.",
          showSource: false,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (value = input) => {
    const question = value.trim();

    if (!question || loading) return;

    if (!localeConfirmed) {
      setShowCountrySelector(true);
      return;
    }

    const userMessage = {
      role: "user",
      text: question,
    };

    setNavigationCards([]);
    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    if (!hasConsented) {
      setPendingQuestion(question);
      setConsentMode(true);
      setMessages((prev) => [
        ...prev,
        createConsentMessage(selectedCountryLabel, selectedLanguageLabel),
      ]);
      return;
    }

    await submitQuestion(
      getContextualFollowUpPrompt(question, messages, selectedLanguageLabel),
    );
  };

  const handleAgree = async () => {
    const question = pendingQuestion;

    setHasConsented(true);
    setNavigationCards(navigationTree);
    setShowConsentSuccess(true);
    setConsentMode(false);
    setPendingQuestion("");

    if (question && isGreeting(question)) {
      setMessages((prev) => [...prev, createWelcomeMessage()]);
      return;
    }

    if (question) {
      await submitQuestion(question);
    }
  };

  const handleNavigationCardSelect = async (card) => {
    if (loading) return;

    if (card.children?.length) {
      setNavigationCards(card.children);
      return;
    }

    setNavigationCards([]);

    const userMessage = {
      role: "user",
      text: card.label,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    await submitQuestion(card.prompt || card.label);
  };


  const handleEscalate = async () => {
    if (escalating) return;

    const recentMessages = messages
      .filter((message) => !["locale", "consent"].includes(message.type))
      .slice(-8)
      .map((message) => ({
        role: message.role,
        text: message.text || "",
      }));
    const latestUserQuestion =
      [...messages].reverse().find((message) => message.role === "user")?.text ||
      input ||
      "Customer requested support";

    setEscalating(true);

    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";
      const response = await fetch(`${apiBase}/api/escalations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: latestUserQuestion,
          selectedCountry: selectedCountryLabel,
          selectedLanguage: selectedLanguageLabel,
          reason: "manual",
          transcript: recentMessages,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to create a handoff right now.");
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          type: "handoff",
          text:
            "I have shared this conversation with the customer care team. A support teammate can review the question, country, language, and recent chat context.",
          showSource: false,
        },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          type: "handoff",
          text:
            error.message ||
            "I could not create the handoff right now. Please try again.",
          showSource: false,
        },
      ]);
    } finally {
      setEscalating(false);
    }
  };

  const handleNewChat = () => {
    setMessages([createWelcomeMessage(), createLocaleMessage()]);
    setInput("");
    setPendingQuestion("");
    setLocaleConfirmed(false);
    setShowCountrySelector(false);
    setHasConsented(false);
    setConsentMode(false);
    setShowConsentSuccess(false);
    setNavigationCards([]);
    setLoading(false);
    setEscalating(false);
    setMenuOpen(false);
	setConversationId(null); 
  };

  return (
    <div className="min-h-screen bg-[#0b0d12] text-white overflow-hidden relative">
      {/* Ambient Background */}
      <div className="absolute top-[-300px] left-[-200px] w-[600px] h-[600px] bg-[#294866] opacity-[0.08] blur-[180px]" />

      <div className="absolute bottom-[-300px] right-[-200px] w-[600px] h-[600px] bg-[#1c2735] opacity-[0.08] blur-[180px]" />

      {/* Hero */}
      <div className="relative z-10 max-w-7xl mx-auto px-10 pt-32 pb-40">
        <motion.div
          initial={{ opacity: 0, y: 35 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
          className="max-w-3xl"
        >
          {/* Badge */}
          <div className="inline-flex items-center gap-3 bg-white/[0.03] border border-white/[0.06] rounded-full px-5 py-3 mb-8 backdrop-blur-xl">
            <div className="w-9 h-9 rounded-full bg-[#1f2937] flex items-center justify-center">
              <Sparkles size={16} className="text-[#9fb3c8]" />
            </div>

            <div>
              <div className="text-sm font-medium text-[#d4dce5]">
                Enterprise AI Assistant
              </div>

              <div className="text-xs text-[#7c8795]">
                Retrieval-Augmented Generation Platform
              </div>
            </div>
          </div>

          {/* Headline */}
          <h1 className="text-[72px] leading-[78px] tracking-[-0.04em] font-semibold text-[#f5f7fa] mb-8">
            Intelligent support
            <br />
            for enterprise operations
          </h1>

          {/* Description */}
          <p className="text-[20px] leading-[38px] text-[#8f98a3] max-w-2xl mb-14">
            Grounded AI assistant powered by operational documentation,
            compliance frameworks, compensation policies, and country-aware
            enterprise retrieval systems.
          </p>

          {/* Cards */}
          <div className="flex flex-wrap gap-5">
            <div className="w-[280px] bg-white/[0.03] border border-white/[0.06] rounded-[28px] p-7 backdrop-blur-xl">
              <div className="w-12 h-12 rounded-2xl bg-[#151922] flex items-center justify-center mb-5">
                <div className="w-2 h-2 rounded-full bg-[#8ba4be]" />
              </div>

              <h3 className="text-lg font-medium text-[#eef2f6] mb-3">
                Grounded Responses
              </h3>

              <p className="text-sm leading-7 text-[#7d8794]">
                Responses generated using approved enterprise knowledge sources
                and operational documentation.
              </p>
            </div>

            <div className="w-[280px] bg-white/[0.03] border border-white/[0.06] rounded-[28px] p-7 backdrop-blur-xl">
              <div className="w-12 h-12 rounded-2xl bg-[#151922] flex items-center justify-center mb-5">
                <div className="w-2 h-2 rounded-full bg-[#8ba4be]" />
              </div>

              <h3 className="text-lg font-medium text-[#eef2f6] mb-3">
                Country-Aware Retrieval
              </h3>

              <p className="text-sm leading-7 text-[#7d8794]">
                Dynamically retrieves regional policy information based on
                operational jurisdiction and document metadata.
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Floating Button - premium warm enterprise */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ scale: 0, rotate: -8 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0 }}
            whileHover={{ scale: 1.08, rotate: 6 }}
            whileTap={{ scale: 0.92 }}
            onClick={() => setOpen(true)}
            className="fixed bottom-8 right-8 z-50 w-[70px] h-[70px] rounded-3xl bg-gradient-to-br from-[#2f6f61] to-[#1e5a4f] shadow-2xl flex items-center justify-center hover:shadow-[0_25px_60px_-10px_rgb(47,111,97)] border border-white/20 transition-all duration-200"
            aria-label="Talk to ASK Vera"
          >
            <MessageCircle size={29} className="text-white" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat Widget - warm enterprise grade */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
            className="fixed bottom-8 right-8 w-[440px] h-[760px] bg-[#fbfaf6] border border-[#ddd4c4] rounded-[28px] overflow-hidden z-50 shadow-[0_30px_80px_-18px_rgba(18,45,39,0.32)] flex flex-col"
          >
            {/* Premium Warm Header */}
            <div className="px-6 py-5 border-b border-[#e4dccd] bg-[#fffdf8] flex items-center justify-between shadow-[0_1px_0_rgba(255,255,255,0.8)]">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-2xl bg-[#245f54] flex items-center justify-center shadow-sm ring-1 ring-[#d9eadf]">
                  <Sparkles size={21} className="text-white" />
                </div>
                <div>
                  <h2 className="font-semibold text-[22px] leading-6 text-[#172620]">ASK Vera</h2>
                  <div className="mt-1 flex items-center gap-2 text-[12px] font-medium text-[#60756d]">
                    <div className="w-2 h-2 bg-[#20b46a] rounded-full ring-2 ring-[#d9f4e6]" />
                    <span>Online • {selectedCountryLabel}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMenuOpen((value) => !value)}
                  className="w-10 h-10 rounded-2xl hover:bg-[#f0e9d9] flex items-center justify-center text-[#5c6b60] hover:text-[#2f6f61] transition-all active:scale-95"
                  aria-label="Menu"
                >
                  <MoreVertical size={21} />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="w-10 h-10 rounded-2xl hover:bg-[#f0e9d9] flex items-center justify-center text-[#5c6b60] hover:text-[#2f6f61] transition-all active:scale-95"
                  aria-label="Close chat"
                >
                  <X size={22} />
                </button>
              </div>

              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.98 }}
                    transition={{ duration: 0.16 }}
                    className="absolute right-14 top-16 z-50 w-[210px] rounded-2xl bg-[#f8fafc] text-[#111827] border border-black/10 shadow-[0_20px_60px_rgba(0,0,0,0.35)] py-2"
                  >
                    <button className="w-full px-4 py-3 flex items-center gap-3 text-sm hover:bg-black/[0.04] transition text-left">
                      <Settings size={16} />
                      Settings
                    </button>

                    <button
                      onClick={handleNewChat}
                      className="w-full px-4 py-3 flex items-center gap-3 text-sm hover:bg-black/[0.04] transition text-left"
                    >
                      <RefreshCw size={16} />
                      Start New Chat
                    </button>

                    <button className="w-full px-4 py-3 flex items-center gap-3 text-sm hover:bg-black/[0.04] transition text-left">
                      <History size={16} />
                      Chat History
                    </button>

                    <button className="w-full px-4 py-3 flex items-center gap-3 text-sm hover:bg-black/[0.04] transition text-left">
                      <UserRound size={16} />
                      Sign up/Login
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>


            <AnimatePresence>
              {showConsentSuccess && (
                <motion.div
                  initial={{ opacity: 0, y: -12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -12, scale: 0.98 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="absolute top-[92px] left-5 right-5 z-40 rounded-2xl border border-[#b8dfd0] bg-[#ecfdf5] px-4 py-3 shadow-[0_18px_45px_rgba(15,118,110,0.18)] flex items-start gap-3 text-[#1f3f36]"
                >
                  <CheckCircle2 size={20} className="text-[#2f7d64] mt-0.5 shrink-0" />

                  <div className="flex-1 text-sm leading-6">
                    {getConsentSuccessText(selectedLanguageLabel)}
                  </div>

                  <button
                    onClick={() => setShowConsentSuccess(false)}
                    className="text-[#4b635b] hover:text-[#111827] transition"
                    aria-label="Dismiss consent confirmation"
                  >
                    <X size={18} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Messages */}
            <div className="px-5 py-5 flex-1 min-h-0 overflow-y-auto space-y-4 bg-gradient-to-b from-[#f7f1e7] via-[#f8f5ef] to-[#eef6f1] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#cfc4b3] hover:[&::-webkit-scrollbar-thumb]:bg-[#b8aa95]">
              {messages.map((msg, idx) => (
                <motion.div
                  key={idx}
                  ref={
                    msg.role === "assistant" && idx === messages.length - 1
                      ? latestAssistantRef
                      : null
                  }
                  layout
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                  className={`flex ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`${
                      msg.productCards?.length || msg.imageCards?.length ? "max-w-[98%]" : "max-w-[86%]"
                    } rounded-[22px] px-5 py-4 transition-all duration-200 ${
                      msg.role === "user"
                        ? "bg-[#245f54] text-white rounded-br-md shadow-[0_10px_24px_rgba(36,95,84,0.22)]"
                        : "bg-[#fffdf9] border border-[#e7dece] text-[#24322c] shadow-[0_8px_22px_rgba(38,54,45,0.08)]"
                    }`}
                  >
                    <MessageBody msg={msg} />

                    {msg.type === "locale" && (
                      <div className="mt-4 rounded-3xl border border-[#d4c9b8] bg-white p-6 shadow-sm">
                        <div className="flex items-start gap-4">
                          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#e8f0e8] to-[#d4e6d4] flex items-center justify-center text-[#2f6f61] shrink-0 border border-[#c5d9c5]">
                            <Globe2 size={22} />
                          </div>

                         <div className="flex-1 pt-1">
  <div className="font-semibold text-lg text-[#1f2937]">Select your country & language</div>
  <p className="mt-1 text-sm text-[#6b756c]">We'll personalise ASK Vera's responses to your market.</p>
</div>
                        </div>

                        {showCountrySelector && (
                          <div className="mt-6 space-y-5">
                            <div>
                              <label className="block text-xs font-medium text-[#4b6b5e] mb-2">Country / Market</label>
                              <select
                                value={country}
                                onChange={handleCountryChange}
                                className="w-full rounded-2xl border border-[#d4c9b8] bg-white px-5 py-3.5 text-base text-[#1f2937] outline-none focus:border-[#2f6f61] focus:ring-4 focus:ring-[#d4e6d4]"
                              >
                                {countryOptions.map((option) => (
                                  <option key={option.code} value={option.code}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-[#4b6b5e] mb-2">Preferred Language</label>
                              <select
                                value={language}
                                onChange={(event) => setLanguage(event.target.value)}
                                className="w-full rounded-2xl border border-[#d4c9b8] bg-white px-5 py-3.5 text-base text-[#1f2937] outline-none focus:border-[#2f6f61] focus:ring-4 focus:ring-[#d4e6d4]"
                              >
                                {availableLanguageOptions.map((option) => (
                                  <option key={option.code} value={option.code}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        )}

                        <div className="mt-8 flex gap-3">
                          <button
                            onClick={startConsentFlow}
                            className="flex-1 rounded-2xl bg-[#2f6f61] py-3.5 text-base font-semibold text-white shadow-sm hover:bg-[#265a50] active:bg-[#1e4a42] transition-all"
                          >
                            {showCountrySelector ? "Continue with selected region" : "Yes, that’s correct"}
                          </button>

                          <button
                            onClick={() => setShowCountrySelector(!showCountrySelector)}
                            className="flex-1 rounded-2xl border-2 border-[#2f6f61] bg-white py-3.5 text-base font-semibold text-[#2f6f61] hover:bg-[#f0f7f4] transition-all"
                          >
                            Change country
                          </button>
                        </div>
                        {availableLanguageOptions.length > 1 && (
                          <div className="mt-3 flex items-center gap-2 text-xs text-[#6b756c]">
                            <Languages size={14} />
                            {selectedCountryLabel} supports {availableLanguageOptions.map((option) => option.label).join(" and ")}; choose any language above.
                          </div>
                        )}
                      </div>
                    )}

                    {msg.type === "consent" && (
                      <div className="mt-6 bg-[#f8f4eb] border border-[#d4c9b8] rounded-3xl p-6">
                        <div className="text-xs uppercase tracking-widest text-[#6b756c] mb-4 font-medium">Legal & Privacy</div>
                        <div className="space-y-4 text-sm leading-relaxed text-[#374151]">
                          {documentLinks.map((link) => (
                            <a
                              key={link.label}
                              href={link.href}
                              download={link.download}
                              rel="noreferrer"
                              className="flex items-center justify-between group hover:bg-white/70 -mx-3 px-3 py-2 rounded-2xl transition"
                            >
                              <span className="text-[#2f6f61] group-hover:underline">{link.label}</span>
                              <ExternalLink size={14} className="text-[#9ca3af] group-hover:text-[#2f6f61]" />
                            </a>
                          ))}
                        </div>
                        <p className="mt-6 text-xs text-[#6b756c] border-t border-[#e0d9c7] pt-4">
                          Your data is protected. All conversations are used solely to retrieve accurate, market-specific information from official Forever Living documentation.
                        </p>
                      </div>
                    )}

                    {msg.role === "assistant" && msg.showSource !== false && (
                      <>
                        <div className="mt-6 pt-5 border-t border-[#e0d9c7] flex items-center gap-2 text-xs text-[#647067]">
                          <div className="px-3 py-1 bg-white rounded-full border border-[#d4c9b8]">📄</div>
                          <span>
                            {msg.citations?.length
                              ? "Sources from official documentation"
                              : `Grounded in ${selectedCountryLabel} knowledge base`}
                          </span>
                        </div>

                        {msg.citations?.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-3">
                            {msg.citations.map((citation) => (
                              <a
                                key={citation.uri}
                                href={citation.uri}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 bg-white border border-[#d4c9b8] hover:border-[#2f6f61] px-4 py-1.5 rounded-3xl text-xs text-[#374151] transition-all hover:shadow"
                              >
                                {citation.title}
                                <ExternalLink size={12} />
                              </a>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </motion.div>
              ))}

              {hasConsented &&
                navigationCards.length > 0 &&
                !loading &&
                !pendingQuestion &&
                !consentMode && (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: [0.23, 1.0, 0.32, 1] }}
                  className="flex justify-start"
                >
                  <div className="max-w-[94%]">
                    {isRootNavigation && (
                      <div className="mb-3 inline-block rounded-[20px] bg-[#fffdf9] border border-[#e7dece] px-5 py-3.5 text-[14.5px] leading-6 text-[#24322c] shadow-[0_8px_22px_rgba(38,54,45,0.08)]">
                        Please choose a topic to get started.
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                    {navigationCards.map((card) => (
                      <button
                        key={card.label}
                        onClick={() => handleNavigationCardSelect(card)}
                        className="rounded-[18px] bg-[#fffdf9] hover:bg-[#f2f8f4] border border-[#e2d8c7] hover:border-[#6fa494] px-4 py-2.5 text-[13.5px] text-[#24382f] shadow-[0_5px_14px_rgba(38,54,45,0.06)] hover:shadow-[0_8px_18px_rgba(38,54,45,0.1)] active:scale-[0.985] transition-all font-medium"
                      >
                        {card.label}
                      </button>
                    ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {loading && (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="flex justify-start"
                >
                  <div className="max-w-[85%] rounded-[22px] px-5 py-4 bg-[#fffdf9] border border-[#e7dece] shadow-[0_8px_22px_rgba(38,54,45,0.08)] flex items-center gap-3">
                    <div className="w-4 h-4 border-2 border-[#245f54] border-t-transparent rounded-full animate-spin" />
                    <p className="text-[14.5px] text-[#52685d]">
                      {getLoadingText(selectedLanguageLabel)}
                    </p>
                  </div>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Premium Input Area */}
            <div className="px-5 py-4 border-t border-[#e4dccd] bg-[#fffdf8] shadow-[0_-8px_20px_rgba(38,54,45,0.04)]">
              {!localeConfirmed ? (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowCountrySelector(true)}
                    className="flex-1 bg-[#edf6f1] text-[#245f54] rounded-[18px] px-4 py-3 text-sm font-semibold hover:bg-[#dcefe7] transition"
                  >
                    Confirm country and language
                  </button>

                  <button
                    onClick={startConsentFlow}
                    className="w-12 h-12 rounded-[18px] bg-[#245f54] hover:bg-[#1b4d44] transition flex items-center justify-center text-white shadow-sm"
                    aria-label="Continue with detected region"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              ) : pendingQuestion || consentMode ? (
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleAgree}
                    className="flex-1 bg-[#245f54] text-white rounded-[18px] px-4 py-3 text-sm font-semibold hover:bg-[#1b4d44] transition shadow-sm"
                  >
                    {getConsentButtonLabel(selectedLanguageLabel)}
                  </button>

                  <button
                    onClick={handleNewChat}
                    className="w-12 h-12 rounded-[18px] bg-[#edf6f1] hover:bg-[#dcefe7] transition flex items-center justify-center text-[#245f54]"
                    aria-label="Start over"
                  >
                    <X size={18} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleSend();
                      }
                    }}
                    disabled={loading}
                    placeholder="Ask anything about your market..."
                    className="flex-1 bg-[#f8f5ee] border border-[#e5dccd] rounded-[20px] px-5 py-3.5 outline-none text-[#223129] placeholder:text-[#8f9b94] focus:border-[#3f8174] focus:ring-4 focus:ring-[#d4e6d4]/60 text-[15px] shadow-inner transition-all"
                  />

                  <button
                    onClick={() => handleSend()}
                    disabled={loading || !input.trim()}
                    className="w-12 h-12 rounded-[18px] bg-[#245f54] hover:bg-[#1b4d44] disabled:opacity-50 transition-all flex items-center justify-center shadow-[0_8px_18px_rgba(36,95,84,0.24)] active:scale-95"
                  >
                    <Send size={19} className="text-white -rotate-12" />
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between mt-3 px-1 text-[11.5px]">
                <span className="text-[#647067]">
                  Grounded in official {selectedCountryLabel} documentation
                </span>

                <button
                  type="button"
                  onClick={handleEscalate}
                  disabled={escalating}
                  className="flex items-center gap-1 text-[#647067] hover:text-[#2f6f61] disabled:opacity-50 transition font-medium"
                >
                  {escalating ? "Connecting support..." : "Talk to human"}
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}















