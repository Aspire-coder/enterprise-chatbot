import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "express";
import cors from "cors";
import { BedrockAgentRuntimeClient, RetrieveAndGenerateCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const app = express();
const port = process.env.PORT || 3001;
const defaultMarket = "United Kingdom";
const PRODUCT_CARD_LIMIT = 10;

const client = new BedrockAgentRuntimeClient({
  region: process.env.AWS_REGION,
});

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
});
// ====================== SIMPLE RATE LIMITER (demo protection) ======================
const rateLimitMap = new Map();
const RATE_LIMIT_MS = 60 * 1000;          // 1 minute window
const MAX_REQUESTS_PER_WINDOW = 30;

const rateLimiter = (req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  let record = rateLimitMap.get(ip) || { count: 0, resetTime: now + RATE_LIMIT_MS };

  if (now > record.resetTime) {
    record = { count: 0, resetTime: now + RATE_LIMIT_MS };
  }

  record.count++;
  rateLimitMap.set(ip, record);

  if (record.count > MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({ error: "Too many requests. Please slow down a bit." });
  }
  next();
};

const toMarketEnvKey = (market = "") =>
  market
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const getMarketKnowledgeBaseId = (selectedCountry = defaultMarket) => {
  const marketSpecificKnowledgeBaseId =
    process.env[`BEDROCK_KNOWLEDGE_BASE_ID_${toMarketEnvKey(selectedCountry)}`];

  if (marketSpecificKnowledgeBaseId) {
    return marketSpecificKnowledgeBaseId;
  }

  if (selectedCountry === defaultMarket && process.env.BEDROCK_KNOWLEDGE_BASE_ID) {
    return process.env.BEDROCK_KNOWLEDGE_BASE_ID;
  }

  const globalKnowledgeBaseId = process.env.BEDROCK_GLOBAL_KNOWLEDGE_BASE_ID;

  if (globalKnowledgeBaseId) {
    return globalKnowledgeBaseId;
  }

  return null;
};

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

const marketUnavailableMessages = {
  Japanese: (market) =>
    `${market} \u7528\u306e Knowledge Base \u306f\u307e\u3060\u8a2d\u5b9a\u3055\u308c\u3066\u3044\u307e\u305b\u3093\u3002${market} \u56fa\u6709\u306e\u60c5\u5831\u306b\u3064\u3044\u3066\u306f Forever Living \u30c1\u30fc\u30e0\u306b\u304a\u554f\u3044\u5408\u308f\u305b\u304f\u3060\u3055\u3044\u3002`,
  German: (market) =>
    `Für ${market} ist noch keine Knowledge Base eingerichtet. Bitte wenden Sie sich für ${market}-spezifische Informationen an das Forever Living Team.`,
  French: (market) =>
    `La Knowledge Base pour ${market} n'est pas encore configurée. Pour des informations propres à ${market}, veuillez contacter l'équipe Forever Living.`,
  Spanish: (market) =>
    `La Knowledge Base de ${market} aún no está configurada. Para información específica de ${market}, contacta con el equipo de Forever Living.`,
  English: (market) =>
    `I do not have a configured Knowledge Base for ${market} yet. Please contact the Forever Living team for ${market}-specific guidance.`,
};

const getMarketUnavailableMessage = (selectedCountry, responseLanguage) =>
  (marketUnavailableMessages[responseLanguage] || marketUnavailableMessages.English)(
    selectedCountry || "this market",
  );

const medicalEmergencyPattern =
  /\b(emergency|medical emergency|urgent medical|call ambulance|call 911|call emergency|heart pain|heart hurts|pain in my heart|heart problem|cardiac pain|chest pain|chest tightness|tight chest|severe chest|heart attack|difficulty breathing|trouble breathing|can't breathe|cannot breathe|shortness of breath|stroke|face droop|slurred speech|sudden weakness|sudden numbness|severe allergic|anaphylaxis|swollen throat|throat closing|loss of consciousness|unconscious|fainting|seizure|severe bleeding|heavy bleeding|pregnancy emergency|pregnant and bleeding|bleeding while pregnant|severe pregnancy pain|suicidal|suicide|self harm|overdose)\b|dolore al petto|dolore al cuore|infarto|difficolt[aà] respirator|non riesco a respirare|ictus|reazione allergica grave|perdita di coscienza|emergenza medica|emergenza in gravidanza|bewusteloos|beroerte|hartaanval|hartpijn|pijn op de borst|ademhalingsproblemen|ernstige allergische|urgence m[ée]dicale|douleur thoracique|douleur au c[œo]ur|crise cardiaque|difficult[ée] [àa] respirer|attaque c[ée]r[ée]brale|urgence grossesse|emergencia m[ée]dica|dolor en el pecho|dolor de coraz[oó]n|ataque al coraz[oó]n|dificultad para respirar|derrame cerebral|emergencia embarazo/i;

const healthSafetyPattern =
  /\b(pregnan\w*|breastfeed\w*|nursing|medication|medicine|prescription|drug interaction|doctor|pharmacist|medical|condition|disease|diagnos\w*|treat\w*|cure|prevent|diabet\w*|blood pressure|heart condition|allerg\w*|asthma|cancer|kidney|liver|autoimmune|safe to use|is it safe|contraindicat\w*|side effects?|symptoms?|pain|fever|infection|rash|dizzy|dizziness|nausea|vomit\w*|diarrhea|headache|migraine|surgery|chemotherapy|insulin|antibiotic|antidepressant|blood thinner|supplement interaction|can i take|should i take|safe for me|safe with)\b|gravidanza|incinta|allattamento|farmac[oi]|medicin[ae]|prescrizione|dottore|medico|farmacista|condizione medica|malattia|diagnosi|trattare|curare|diabete|pressione|allergia|sicuro|controindic|dolore|febbre|infezione|sintomi|zwanger|zwangerschap|borstvoeding|medicatie|geneesmiddel|recept|arts|apotheker|medische aandoening|ziekte|diagnose|behandelen|genezen|diabetes|bloeddruk|allergie|veilig|contra-indicatie|douleur|fi[eè]vre|sympt[oô]mes|m[ée]dicament|embarazo|lactancia|medicamento|dolor|fiebre|s[ií]ntomas|seguro/i;

const isMedicalEmergencyQuestion = (message = "") =>
  medicalEmergencyPattern.test(message);

const isHealthSafetyQuestion = (message = "") =>
  isMedicalEmergencyQuestion(message) || healthSafetyPattern.test(message);

const medicalEmergencyMessages = {
  English:
    "I’m sorry you’re dealing with this. Please seek immediate professional medical assistance now. If you believe you are experiencing a medical emergency, contact your local emergency services immediately.",
  Italian:
    "Mi dispiace che tu stia affrontando questa situazione. Ti invito a cercare subito assistenza medica professionale. Se pensi di essere in presenza di un’emergenza medica, contatta immediatamente i servizi di emergenza locali.",
  Dutch:
    "Het spijt me dat je hiermee te maken hebt. Zoek nu onmiddellijk professionele medische hulp. Als je denkt dat er sprake is van een medisch noodgeval, neem dan onmiddellijk contact op met de lokale hulpdiensten.",
  German:
    "Es tut mir leid, dass du das erlebst. Bitte suche sofort professionelle medizinische Hilfe. Wenn du glaubst, dass es sich um einen medizinischen Notfall handelt, kontaktiere sofort den örtlichen Notdienst.",
  French:
    "Je suis désolé que vous viviez cela. Veuillez demander immédiatement une aide médicale professionnelle. Si vous pensez vivre une urgence médicale, contactez immédiatement les services d’urgence locaux.",
  Spanish:
    "Siento que estés pasando por esto. Busca asistencia médica profesional inmediata. Si crees que estás experimentando una emergencia médica, contacta de inmediato con los servicios de emergencia locales.",
  Japanese:
    "大変な状況かもしれません。今すぐ医療専門家による緊急の支援を受けてください。医学的な緊急事態だと思う場合は、直ちに地域の緊急サービスに連絡してください。",
};

const healthGuidanceMessages = {
  English:
    "I can share general information from approved Forever Living content when it is available, but I can’t decide whether a product is safe, unsafe, recommended, or contraindicated for pregnancy, breastfeeding, medication use, symptoms, pain, or any medical condition. Please consult a qualified healthcare professional, doctor, pharmacist, or other appropriate medical provider for advice based on your personal situation. If you believe you are experiencing a medical emergency, contact your local emergency services immediately.",
  Italian:
    "Posso condividere informazioni generali dai contenuti approvati Forever Living quando disponibili, ma non posso stabilire se un prodotto sia sicuro, non sicuro, raccomandato o controindicato in gravidanza, durante l’allattamento, con farmaci o in presenza di una condizione medica. Consulta un professionista sanitario qualificato, un medico, un farmacista o un altro operatore sanitario appropriato per ricevere indicazioni adatte alla tua situazione personale.",
  Dutch:
    "Ik kan algemene informatie uit goedgekeurde Forever Living-content delen wanneer die beschikbaar is, maar ik kan niet bepalen of een product veilig, onveilig, aanbevolen of gecontra-indiceerd is bij zwangerschap, borstvoeding, medicatiegebruik of een medische aandoening. Raadpleeg een gekwalificeerde zorgverlener, arts, apotheker of andere geschikte medische professional voor advies dat past bij jouw persoonlijke situatie.",
  German:
    "Ich kann allgemeine Informationen aus freigegebenen Forever Living-Inhalten teilen, sofern sie verfügbar sind. Ich kann jedoch nicht beurteilen, ob ein Produkt bei Schwangerschaft, Stillzeit, Medikamenteneinnahme oder einer Erkrankung sicher, unsicher, empfohlen oder kontraindiziert ist. Bitte wende dich an qualifiziertes medizinisches Fachpersonal, einen Arzt, Apotheker oder eine andere geeignete medizinische Stelle.",
  French:
    "Je peux partager des informations générales issues des contenus approuvés Forever Living lorsqu’elles sont disponibles, mais je ne peux pas déterminer si un produit est sûr, dangereux, recommandé ou contre-indiqué pendant la grossesse, l’allaitement, la prise de médicaments ou en cas de condition médicale. Veuillez consulter un professionnel de santé qualifié, un médecin, un pharmacien ou un autre prestataire médical approprié.",
  Spanish:
    "Puedo compartir información general de contenidos aprobados de Forever Living cuando esté disponible, pero no puedo determinar si un producto es seguro, inseguro, recomendado o contraindicado durante el embarazo, la lactancia, el uso de medicamentos o una condición médica. Consulta a un profesional sanitario cualificado, médico, farmacéutico u otro proveedor médico adecuado.",
  Japanese:
    "承認済みのForever Livingコンテンツに情報がある場合は一般的な情報を共有できますが、妊娠中、授乳中、服薬中、または医学的状態がある場合に、製品が安全か、安全でないか、推奨されるか、禁忌かを判断することはできません。あなたの状況に応じた助言については、資格のある医療専門家、医師、薬剤師、または適切な医療提供者に相談してください。",
};

const getLocalizedSafetyMessage = (messages, responseLanguage = "English") =>
  messages[responseLanguage] || messages.English;

const appendHealthGuidance = (answer = "", responseLanguage = "English") => {
  const guidance = getLocalizedSafetyMessage(healthGuidanceMessages, responseLanguage);

  if (!answer || isUnavailableAnswer(answer)) return guidance;
  if (answer.includes(guidance.slice(0, 40))) return answer;

  return `${answer.trim()}\n\n${guidance}`;
};

const incomeOpportunityPattern =
  /\b(rich|wealthy|millionaire|make money|earn money|income|financial freedom|guaranteed income|guarantee.*income|how much.*earn|can i earn|can i make|profit|commission|compensation|bonus|join forever|join forever living|business opportunity|become an fbo|forever business owner)\b|diventare ricc[oa]|guadagnare|reddito|compenso|opportunit[aà]\s+di\s+business|devenir riche|revenu|gagner de l'argent|oportunidad de negocio|hacerme rico|ganar dinero|ingresos|bogat|zarad|prihod/i;

const isIncomeOpportunityQuestion = (message = "") =>
  incomeOpportunityPattern.test(message);

const incomeOpportunityMessages = {
  English:
    "Forever Living can offer a business opportunity, but it would not be appropriate to promise that you will become rich or guarantee any level of income. Income varies by individual effort, skills, time, market, customer base, and leadership activity. Please review the official income disclosure, compensation plan, and local market documents, and speak with the Forever Living team in your market before making a decision.",
  Italian:
    "Forever Living può offrire un'opportunità di business, ma non sarebbe corretto promettere che diventerai ricco o garantire un determinato livello di reddito. Il reddito varia in base all'impegno individuale, alle competenze, al tempo dedicato, al mercato, alla clientela e all'attività di leadership. Consulta i documenti ufficiali sul reddito, il piano compensi e i documenti del tuo mercato locale, e parla con il team Forever Living del tuo paese prima di prendere una decisione.",
  German:
    "Forever Living kann eine Geschäftsmöglichkeit bieten, aber es wäre nicht korrekt zu versprechen, dass du reich wirst oder ein bestimmtes Einkommen garantiert ist. Einkommen variiert je nach persönlichem Einsatz, Fähigkeiten, Zeitaufwand, Markt, Kundenbasis und Führungsaktivität. Bitte prüfe die offiziellen Einkommenshinweise, den Vergütungsplan und die Dokumente deines lokalen Marktes und sprich mit dem Forever Living Team in deinem Markt, bevor du eine Entscheidung triffst.",
  French:
    "Forever Living peut offrir une opportunité commerciale, mais il ne serait pas approprié de promettre que vous deviendrez riche ou de garantir un niveau de revenu. Les revenus varient selon l'effort individuel, les compétences, le temps consacré, le marché, la clientèle et l'activité de leadership. Veuillez consulter les documents officiels sur les revenus, le plan de rémunération et les documents de votre marché local, puis contacter l'équipe Forever Living de votre marché avant de prendre une décision.",
  Spanish:
    "Forever Living puede ofrecer una oportunidad de negocio, pero no sería apropiado prometer que te harás rico ni garantizar ningún nivel de ingresos. Los ingresos varían según el esfuerzo individual, las habilidades, el tiempo dedicado, el mercado, la base de clientes y la actividad de liderazgo. Consulta la divulgación oficial de ingresos, el plan de compensación y los documentos de tu mercado local, y habla con el equipo de Forever Living de tu mercado antes de tomar una decisión.",
  Serbian:
    "Forever Living može ponuditi poslovnu priliku, ali nije primereno obećati da ćeš postati bogat ili garantovati bilo koji nivo prihoda. Prihod zavisi od individualnog truda, veština, uloženog vremena, tržišta, baze kupaca i liderskih aktivnosti. Pregledaj zvanične dokumente o prihodima, plan kompenzacije i dokumente lokalnog tržišta, i razgovaraj sa Forever Living timom u svom tržištu pre donošenja odluke.",
  Dutch:
    "Forever Living kan een zakelijke kans bieden, maar het is niet passend om te beloven dat je rijk wordt of een bepaald inkomen te garanderen. Inkomen varieert per individuele inzet, vaardigheden, tijdsbesteding, markt, klantenbestand en leiderschapsactiviteit. Bekijk de officiële inkomensinformatie, het compensatieplan en de documenten voor jouw lokale markt, en spreek met het Forever Living-team in jouw markt voordat je een beslissing neemt.",
};

const getIncomeOpportunityMessage = (responseLanguage = "English") =>
  incomeOpportunityMessages[responseLanguage] || incomeOpportunityMessages.English;

const appendIncomeOpportunityGuidance = (answer = "", responseLanguage = "English") => {
  const guidance = getIncomeOpportunityMessage(responseLanguage);

  if (!answer || isUnavailableAnswer(answer)) return guidance;
  if (/income varies by individual effort/i.test(answer) || answer.includes(guidance.slice(0, 45))) {
    return answer;
  }

  return `${answer.trim()}\n\n${guidance}`;
};

// ====================== VERA PROMPT TEMPLATE (easy to edit) ======================
const veraPromptTemplate = `
You are Vera, a warm, friendly, and exceptionally patient AI assistant for Forever Living Products in the selected market, with access to global content that applies to all markets.

Tone: Speak like a calm, helpful friend. Use warm, encouraging language. Short sentences. Be patient and reassuring.

Core Rules (never break these):
- Use ONLY the retrieved Knowledge Base search results. Never use outside knowledge, the internet, or hallucinate.
- The selected country/market has already been strictly enforced by the server.
- You may answer using selected-market results and any retrieved global-scoped results. Global-scoped results apply to every selected market.
- If global-scoped results include international office, staff, contact, or directory information for another country, you may provide that information even when the selected market is different.
- Do not use another country's market-specific policy, product, price, promotion, compensation, or legal guidance unless the retrieved result is explicitly global-scoped.
- If the answer is not in selected-market or global-scoped retrieved results: politely say the information is not available in the approved documents.
- Never invent products, prices, benefits, clinical results, testimonials, URLs, emails, or contact details.
- Never imply or state that any product treats, cures, prevents, reverses, or diagnoses any medical condition.
- For income, compensation, or bonus questions: Clearly state that "income varies by individual effort and market" and refer to the official IDS or compensation documents.
- Answer entirely in the Required response language. If the retrieved results are written in another language, translate the answer into the Required response language while preserving all company, product, legal, and document terms exactly.
- Do not answer in English unless the Required response language is English.
- Preserve product names, program names, article numbers, SKU numbers, product IDs, numeric prefixes, symbols, and casing exactly as retrieved. Never shorten or rewrite titles such as "13-Day-Fit-Program 4759".
- Keep responses practical, warm, concise, and helpful.

Retrieved Knowledge Base search results:
$search_results$

User question and server instructions:
$query$

$output_format_instructions$
`;

const getSourceName = (uri = "") => {
  const fileName = decodeURIComponent(uri.split("/").pop() || uri);

  return fileName || "policy document";
};

const formatCitations = (citations = []) => {
  const sources = citations.flatMap((citation) =>
    (citation.retrievedReferences || []).map((reference) => {
      const uri =
        reference.location?.s3Location?.uri ||
        reference.location?.webLocation?.url ||
        "";

      return {
        title: getSourceName(uri),
        uri,
      };
    }),
  );

  return Array.from(
    new Map(sources.filter((source) => source.uri).map((source) => [source.uri, source])).values(),
  );
};


const stripInlineMetadataBlocks = (text = "") =>
  text
    .replace(/METADATA\s*[\s\S]*?\s*END_METADATA/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
const stripProductCardJson = (answer = "") =>
  answer
    .replace(/\{[\s\S]*"product_cards"[\s\S]*\}/g, "")
    .replace(/\{\s*\\"product_cards\\"[\s\S]*?\}\s*\]?/g, "")
    .replace(/product cards:\s*$/i, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();


const currencySymbolByCountry = {
  "United Kingdom": "£",
  Germany: "€",
  France: "€",
  Spain: "€",
  Italy: "€",
  Netherlands: "€",
  Belgium: "€",
  Ireland: "€",
  Finland: "€",
  Canada: "$",
  "United States": "$",
  Australia: "$",
  "New Zealand": "$",
  Singapore: "$",
  Ecuador: "$",
  Brazil: "R$",
  Mexico: "$",
  India: "₹",
  Japan: "¥",
  "South Korea": "₩",
  Denmark: "kr",
  Sweden: "kr",
  Norway: "kr",
  "South Africa": "R",
};

const getCurrencySymbolForCountry = (selectedCountry = defaultMarket) =>
  process.env[`BEDROCK_PRODUCT_CURRENCY_${toMarketEnvKey(selectedCountry)}`] ||
  currencySymbolByCountry[selectedCountry] ||
  "";

const firstMetadataValue = (metadata = {}, keys = []) => {
  for (const key of keys) {
    const value = metadata[key];

    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }

  return "";
};

const normalizeMetadataUrl = (value = "") =>
  String(value)
    .split(",")
    .map((part) => part.trim())
    .find((part) => /^https?:\/\//i.test(part)) || "";


const parseS3Uri = (uri = "") => {
  const match = String(uri).match(/^s3:\/\/([^/]+)\/(.+)$/i);

  return match
    ? {
        bucket: match[1],
        key: decodeURIComponent(match[2]),
      }
    : null;
};

const isImagePath = (value = "") => /\.(png|jpe?g|webp|gif)$/i.test(value);

const getContentTypeForImage = (key = "") => {
  if (/\.png$/i.test(key)) return "image/png";
  if (/\.webp$/i.test(key)) return "image/webp";
  if (/\.gif$/i.test(key)) return "image/gif";

  return "image/jpeg";
};

const getFileTitle = (value = "") =>
  decodeURIComponent(String(value).split("/").pop() || "Related image")
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const toChatImageUrl = (value = "") => {
  const trimmedValue = String(value).trim();

  if (/^https?:\/\//i.test(trimmedValue)) return trimmedValue;
  if (/^s3:\/\//i.test(trimmedValue) && isImagePath(trimmedValue)) {
    return `http://localhost:${port}/api/assets/s3-image?uri=${encodeURIComponent(trimmedValue)}`;
  }

  return "";
};

const normalizeProductAssetUrl = (value = "") => {
  const firstValue = String(value || "")
    .split(",")
    .map((part) => part.trim())
    .find(Boolean) || "";

  return toChatImageUrl(firstValue) || firstValue;
};

const getImageCardsFromCitations = (citations = []) => {
  const seen = new Set();

  return citations
    .flatMap((citation) => citation.retrievedReferences || [])
    .flatMap((reference) => {
      const metadata = reference.metadata || {};
      const uri =
        reference.location?.s3Location?.uri ||
        reference.location?.webLocation?.url ||
        "";
      const candidates = [
        firstMetadataValue(metadata, [
          "image_url",
          "imageUrl",
          "image_urls",
          "imageUrls",
          "visual_url",
          "visualUrl",
          "diagram_url",
          "diagramUrl",
          "related_image_url",
          "relatedImageUrl",
          "asset_url",
          "assetUrl",
          "s3_image_uri",
          "s3ImageUri",
        ]),
        isImagePath(uri) ? uri : "",
      ]
        .join(",")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);

      return candidates
        .map((candidate) => {
          const url = toChatImageUrl(candidate);

          if (!url || seen.has(url)) return null;
          seen.add(url);

          return {
            title:
              firstMetadataValue(metadata, ["title", "name", "image_title", "imageTitle"]) ||
              getFileTitle(candidate),
            alt:
              firstMetadataValue(metadata, ["alt_text", "altText", "alt"]) ||
              getFileTitle(candidate),
            url,
          };
        })
        .filter(Boolean);
    })
    .slice(0, 3);
};

const belgiumPolicyImageRules = [
  {
    pattern: /assistant\s+manager|assistent\s+manager|assistant-manager/i,
    title: "Assistant Manager",
    uri: "s3://global-chatbot-kb/Foreverliving-NL-BE/images/assistant-manager.png",
  },
  {
    pattern: /assistant\s+supervisor|assistent\s+supervisor|assistant-supervisor/i,
    title: "Assistant Supervisor",
    uri: "s3://global-chatbot-kb/Foreverliving-NL-BE/images/assistant-supervisor.png",
  },
  {
    pattern: /\bsupervisor\b/i,
    title: "Supervisor",
    uri: "s3://global-chatbot-kb/Foreverliving-NL-BE/images/supervisor.png",
  },
  {
    pattern: /\bmanager\b/i,
    title: "Manager",
    uri: "s3://global-chatbot-kb/Foreverliving-NL-BE/images/manager.png",
  },
  {
    pattern: /eerste\s+vijf\s+sleutelpersonen|vijf\s+sleutelpersonen|five\s+key/i,
    title: "Jouw eerste vijf sleutelpersonen",
    uri: "s3://global-chatbot-kb/Foreverliving-NL-BE/images/jouw-EERSTE-VIJF-SLEUTELPERSONEN.png",
  },
];

const getPolicyImageCardsForMarket = ({ message = "", selectedCountry = "" }) => {
  if (selectedCountry !== "Belgium") return [];

  const matchedRule = belgiumPolicyImageRules.find((rule) => rule.pattern.test(message));

  if (!matchedRule) return [];

  return [
    {
      title: matchedRule.title,
      alt: matchedRule.title,
      url: toChatImageUrl(matchedRule.uri),
    },
  ].filter((card) => card.url);
};

const getImageCardsForResponse = ({ citations = [], message = "", selectedCountry = "" }) => {
  const seen = new Set();

  return [
    ...getImageCardsFromCitations(citations),
    ...getPolicyImageCardsForMarket({ message, selectedCountry }),
  ]
    .filter((card) => {
      if (!card.url || seen.has(card.url)) return false;
      seen.add(card.url);
      return true;
    })
    .slice(0, 3);
};
const getPriceFromMetadata = (metadata = {}, selectedCountry = "") => {
  const explicitPrice = firstMetadataValue(metadata, [
    "price_label",
    "priceLabel",
    "display_price",
    "displayPrice",
    "price_gbp",
    "priceGbp",
    "price_eur",
    "priceEur",
    "price_usd",
    "priceUsd",
    "price_cad",
    "priceCad",
    "price",
  ]);

  if (!explicitPrice) return "";
  if (/^(£|€|\$|R\$|₹|¥|₩|kr|R)\s*/i.test(explicitPrice)) {
    return explicitPrice;
  }
  if (!/^\d+(?:[.,]\d+)?$/.test(explicitPrice)) return explicitPrice;

  const symbol = getCurrencySymbolForCountry(selectedCountry);
  const normalizedPrice = explicitPrice.replace(",", ".");

  return symbol ? `${symbol}${normalizedPrice}` : normalizedPrice;
};

const getProductCardsFromCitations = (citations = [], selectedCountry = "") => {
  const seen = new Set();

  return citations
    .flatMap((citation) => citation.retrievedReferences || [])
    .map((reference) => {
      const metadata = reference.metadata || {};
      const name = firstMetadataValue(metadata, [
        "product_name",
        "productName",
        "product",
        "name",
        "Product",
        "Name",
      ]);
      const contentType = firstMetadataValue(metadata, [
        "content_type",
        "contentType",
        "type",
        "record_type",
        "recordType",
      ]);
      const productUrl = normalizeMetadataUrl(
        firstMetadataValue(metadata, [
          "product_url",
          "productUrl",
          "buy_url",
          "buyUrl",
          "shop_url",
          "shopUrl",
          "url",
          "link",
          "href",
        ]),
      );
      const imageUrl = normalizeMetadataUrl(
        firstMetadataValue(metadata, [
          "image_url",
          "imageUrl",
          "image_urls",
          "imageUrls",
          "image",
          "thumbnail",
          "thumbnail_url",
          "thumbnailUrl",
        ]),
      );
      const description = firstMetadataValue(metadata, [
        "short_desc",
        "shortDescription",
        "short_description",
        "description",
        "desc",
        "approved_benefit",
        "approvedBenefit",
        "benefit",
        "benefits",
      ]);
      const category = firstMetadataValue(metadata, [
        "category",
        "categories",
        "content_type",
        "product_category",
          "productCategory",
        ]);

      const hasProductMetadata =
        Boolean(name) &&
        (Boolean(productUrl) ||
          Boolean(imageUrl) ||
          Boolean(getPriceFromMetadata(metadata, selectedCountry)) ||
          Boolean(firstMetadataValue(metadata, ["sku", "SKU", "article_number", "articleNumber", "product_id", "productId"])) ||
          /\bproduct|catalog|sku\b/i.test(String(contentType || category || "")));

      if (!hasProductMetadata) return null;

      const key = normalizeProductName(name);

      if (!key || seen.has(key)) return null;
      seen.add(key);

      return {
        name,
        priceGbp: getPriceFromMetadata(metadata, selectedCountry),
        description,
        approvedBenefit: firstMetadataValue(metadata, [
          "approved_benefit",
          "approvedBenefit",
        ]),
        url: productUrl,
        imageUrl,
        buyUrl: productUrl,
        rating: firstMetadataValue(metadata, ["rating", "stars"]),
        categories: category ? [category] : [],
        disclaimer: firstMetadataValue(metadata, ["disclaimer"]),
      };
    })
    .filter(Boolean)
    .slice(0, PRODUCT_CARD_LIMIT);
};

const extractProductCards = (answer = "") => {
  const jsonMatch = answer.match(/\{[\s\S]*"product_cards"[\s\S]*\}/);

  if (!jsonMatch) {
    return { answer, productCards: [] };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const productCards = Array.isArray(parsed.product_cards)
      ? parsed.product_cards.map((card) => ({
          name: card.name || "",
          priceGbp: card.price_gbp || "",
          description: card.description || "",
          approvedBenefit: card.approved_benefit || "",
          url: card.url || "",
          imageUrl: card.image_url || "",
          buyUrl: card.buy_url || card.url || "",
          rating: card.rating || "",
          categories: Array.isArray(card.categories) ? card.categories : [],
          disclaimer: card.disclaimer || "",
        }))
      : [];

    return {
      answer: stripProductCardJson(answer.replace(jsonMatch[0], "")),
      productCards,
    };
  } catch {
    return {
      answer: stripProductCardJson(answer),
      productCards: [],
    };
  }
};


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ukProductCatalogDir = path.join(__dirname, "product-catalog", "uk-en");

const chatInsightsLogDir = path.join(__dirname, "logs");
const chatInsightsLogPath = path.join(chatInsightsLogDir, "chat-events.jsonl");

const handoffLogPath = path.join(chatInsightsLogDir, "handoff-events.jsonl");
const retrievalDiagnosticsLogPath = path.join(chatInsightsLogDir, "retrieval-diagnostics.jsonl");

const readJsonlFile = (filePath) => {
  if (!fs.existsSync(filePath)) return [];

  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
};

const writeJsonlFile = (filePath, event) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(
    filePath,
    `${JSON.stringify({
      createdAt: new Date().toISOString(),
      ...event,
    })}\n`,
    "utf8",
  );
};

const createHandoffEvent = ({
  question = "",
  selectedCountry = defaultMarket,
  selectedLanguage = "",
  responseLanguage = "",
  reason = "manual",
  status = "open",
  transcript = [],
  answer = "",
  source = "",
  outcome = "",
}) => {
  const event = {
    id: `handoff-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    status,
    reason,
    question: redactQuestionForLog(question),
    normalizedQuestion: normalizeQuestionForInsights(question),
    selectedCountry,
    selectedLanguage,
    responseLanguage,
    answer: redactQuestionForLog(answer).slice(0, 1200),
    source,
    outcome,
    transcript: Array.isArray(transcript)
      ? transcript.slice(-10).map((message) => ({
          role: message.role === "user" ? "user" : "assistant",
          text: redactQuestionForLog(String(message.text || "")).slice(0, 1200),
        }))
      : [],
  };

  try {
    writeJsonlFile(handoffLogPath, event);
  } catch (error) {
    console.warn("Unable to write handoff event:", error.message);
  }

  return event;
};

const readHandoffEvents = () => readJsonlFile(handoffLogPath);

const getReferenceUri = (reference = {}) =>
  reference.location?.s3Location?.uri ||
  reference.location?.webLocation?.url ||
  reference.location?.confluenceLocation?.url ||
  reference.location?.sharePointLocation?.url ||
  reference.location?.salesforceLocation?.url ||
  "";

const getReferenceText = (reference = {}) =>
  String(
    reference.content?.text ||
      reference.content?.byteContent ||
      reference.content?.row?.toString?.() ||
      "",
  );

const getChunkIdFromMetadata = (metadata = {}) =>
  firstMetadataValue(metadata, [
    "x-amz-bedrock-kb-chunk-id",
    "x-amz-bedrock-kb-source-uri",
    "chunk_id",
    "chunkId",
    "id",
  ]);

const getRetrievedReferenceDiagnostics = (response = {}) =>
  (response.citations || [])
    .flatMap((citation) => citation.retrievedReferences || [])
    .map((reference) => {
      const metadata = reference.metadata || {};
      const uri = getReferenceUri(reference);
      const text = getReferenceText(reference);

      return {
        documentName:
          firstMetadataValue(metadata, ["document_name", "documentName", "title", "name"]) ||
          getSourceName(uri),
        uri,
        chunkId: getChunkIdFromMetadata(metadata),
        textPreview: text.replace(/\s+/g, " ").slice(0, 700),
        metadata,
      };
    });

const writeRetrievalDiagnosticsEvent = ({
  question = "",
  selectedCountry = "",
  selectedLanguage = "",
  responseLanguage = "",
  responseSource = "",
  retrievalFilter,
  exactTerms = [],
  response = {},
}) => {
  try {
    writeJsonlFile(retrievalDiagnosticsLogPath, {
      question: redactQuestionForLog(question),
      normalizedQuestion: normalizeQuestionForInsights(question),
      selectedCountry,
      selectedLanguage,
      responseLanguage,
      responseSource,
      exactTerms,
      retrievalFilter,
      retrievedReferences: getRetrievedReferenceDiagnostics(response),
    });
  } catch (error) {
    console.warn("Unable to write retrieval diagnostics:", error.message);
  }
};

const summarizeHandoffEvents = (events = []) => {
  const byReason = new Map();
  const byStatus = new Map();

  events.forEach((event) => {
    byReason.set(event.reason || "unknown", (byReason.get(event.reason || "unknown") || 0) + 1);
    byStatus.set(event.status || "open", (byStatus.get(event.status || "open") || 0) + 1);
  });

  const toList = (map) =>
    Array.from(map.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);

  return {
    totalHandoffs: events.length,
    openHandoffs: events.filter((event) => event.status === "open").length,
    recentHandoffs: events.slice(-30).reverse(),
    handoffsByReason: toList(byReason),
    handoffsByStatus: toList(byStatus),
  };
};


const redactQuestionForLog = (value = "") =>
  value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[phone]")
    .trim();

const normalizeQuestionForInsights = (value = "") =>
  redactQuestionForLog(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const isUnavailableAnswer = (answer = "") =>
  /couldn'?t find|could not find|not available|not configured|unable to assist|could not reach|try again|no configured knowledge base|do not have|don'?t have|no information|not found|not in (the )?(selected )?(market )?knowledge base|informazion[ei].*non .*disponibil[ei]|non .*disponibil[ei].*documenti|non riesco .*trovare|non sono presenti|non .*present[ei].*risultat|je ne .*trouve|pas disponible|nicht .*verfügbar|konnte .*nicht finden|no .*disponible|no encuentro/i.test(
    answer,
  );

const writeChatInsightEvent = (event) => {
  try {
    fs.mkdirSync(chatInsightsLogDir, { recursive: true });
    fs.appendFileSync(
      chatInsightsLogPath,
      `${JSON.stringify({
        createdAt: new Date().toISOString(),
        ...event,
      })}\n`,
      "utf8",
    );
  } catch (error) {
    console.warn("Unable to write chat insight event:", error.message);
  }
};

const readChatInsightEvents = () => readJsonlFile(chatInsightsLogPath);

const summarizeChatInsightEvents = (events) => {
  const byQuestion = new Map();
  const byCountry = new Map();
  const byLanguage = new Map();
  const bySource = new Map();
  const failures = [];

  events.forEach((event) => {
    const questionKey = event.normalizedQuestion || "";

    if (questionKey) {
      const current = byQuestion.get(questionKey) || {
        question: event.question,
        normalizedQuestion: questionKey,
        count: 0,
        lastAskedAt: event.createdAt,
        failures: 0,
      };

      current.count += 1;
      current.lastAskedAt = event.createdAt;
      if (event.outcome !== "ok") current.failures += 1;
      byQuestion.set(questionKey, current);
    }

    if (event.selectedCountry) {
      byCountry.set(
        event.selectedCountry,
        (byCountry.get(event.selectedCountry) || 0) + 1,
      );
    }

    if (event.responseLanguage) {
      byLanguage.set(
        event.responseLanguage,
        (byLanguage.get(event.responseLanguage) || 0) + 1,
      );
    }

    if (event.responseSource) {
      bySource.set(event.responseSource, (bySource.get(event.responseSource) || 0) + 1);
    }

    if (event.outcome !== "ok") {
      failures.push(event);
    }
  });

  const toSortedList = (map) =>
    Array.from(map.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);

  return {
    totalQuestions: events.length,
    failedOrUnavailableQuestions: failures.length,
    repeatedQuestions: Array.from(byQuestion.values())
      .filter((item) => item.count > 1)
      .sort((a, b) => b.count - a.count || b.failures - a.failures)
      .slice(0, 25),
    topQuestions: Array.from(byQuestion.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 25),
    recentFailures: failures.slice(-25).reverse(),
    byCountry: toSortedList(byCountry),
    byLanguage: toSortedList(byLanguage),
    bySource: toSortedList(bySource),
  };
};


const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const renderAdminTableRows = (items = [], columns = [], emptyText = "No data yet.") => {
  if (!items.length) {
    return `<tr><td colspan="${columns.length}" class="empty">${escapeHtml(emptyText)}</td></tr>`;
  }

  return items
    .map(
      (item) =>
        `<tr>${columns
          .map((column) => `<td>${escapeHtml(column.value(item))}</td>`)
          .join("")}</tr>`,
    )
    .join("");
};

const renderAdminBreakdown = (items = []) =>
  items.length
    ? items
        .map((item) => `<span class="pill">${escapeHtml(item.label)} <strong>${escapeHtml(item.count)}</strong></span>`)
        .join("")
    : `<span class="empty">No data yet.</span>`;

const renderSupportAdminDashboard = (insights, handoffs) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Vera Support Desk</title>
    <style>
      :root {
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f6f3ec;
        color: #1f2937;
      }
      body { margin: 0; padding: 32px; }
      main { max-width: 1180px; margin: 0 auto; }
      header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; margin-bottom: 24px; }
      h1 { margin: 0 0 8px; font-size: 32px; }
      h2 { margin: 0 0 14px; font-size: 18px; }
      .muted, .empty { color: #647067; font-size: 14px; }
      .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 18px; }
      .card, section { background: #fffdf8; border: 1px solid #e4dccf; border-radius: 14px; box-shadow: 0 10px 30px rgba(31, 41, 55, 0.06); }
      .card { padding: 18px; }
      .number { display: block; margin-top: 8px; font-size: 30px; font-weight: 750; color: #0f766e; }
      section { padding: 18px; margin-top: 18px; overflow: hidden; }
      table { width: 100%; border-collapse: collapse; font-size: 14px; }
      th, td { text-align: left; border-top: 1px solid #eee5d8; padding: 11px 10px; vertical-align: top; }
      th { color: #536158; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
      .pill { display: inline-flex; gap: 8px; align-items: center; margin: 0 8px 8px 0; padding: 8px 11px; border-radius: 999px; background: #eaf4ef; color: #1f6f61; font-size: 14px; }
      .badge { display: inline-flex; padding: 4px 8px; border-radius: 999px; font-size: 12px; font-weight: 700; background: #dbeafe; color: #1d4ed8; }
      .bad { background: #fee2e2; color: #991b1b; }
      .actions { display: flex; gap: 10px; flex-wrap: wrap; }
      a.button { display: inline-flex; align-items: center; min-height: 38px; padding: 0 14px; border-radius: 10px; background: #0f766e; color: white; text-decoration: none; font-weight: 700; font-size: 14px; }
      @media (max-width: 820px) {
        body { padding: 18px; }
        header { display: block; }
        .actions { margin-top: 14px; }
        .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <h1>Vera Support Desk</h1>
          <div class="muted">Handoff queue and chatbot monitoring generated ${escapeHtml(insights.generatedAt)}</div>
        </div>
        <div class="actions">
          <a class="button" href="/api/admin/chat-insights">Refresh</a>
          <a class="button" href="/api/admin/chat-insights?format=json">View JSON</a>
        </div>
      </header>

      <div class="grid">
        <div class="card"><span class="muted">Open handoffs</span><span class="number">${escapeHtml(handoffs.openHandoffs)}</span></div>
        <div class="card"><span class="muted">Total handoffs</span><span class="number">${escapeHtml(handoffs.totalHandoffs)}</span></div>
        <div class="card"><span class="muted">Questions</span><span class="number">${escapeHtml(insights.totalQuestions)}</span></div>
        <div class="card"><span class="muted">Failed/unavailable</span><span class="number">${escapeHtml(insights.failedOrUnavailableQuestions)}</span></div>
      </div>

      <section>
        <h2>Handoff Queue</h2>
        <div>${renderAdminBreakdown(handoffs.handoffsByReason)}</div>
        <table>
          <thead><tr><th>Created</th><th>Question</th><th>Country</th><th>Language</th><th>Reason</th><th>Status</th></tr></thead>
          <tbody>${renderAdminTableRows(handoffs.recentHandoffs, [
            { value: (item) => item.createdAt || "" },
            { value: (item) => item.question || "" },
            { value: (item) => item.selectedCountry || "" },
            { value: (item) => item.responseLanguage || item.selectedLanguage || "" },
            { value: (item) => item.reason || "" },
            { value: (item) => item.status || "" },
          ], "No handoffs yet.")}</tbody>
        </table>
      </section>

      <section>
        <h2>Repeated Questions</h2>
        <table>
          <thead><tr><th>Question</th><th>Count</th><th>Failures</th><th>Last asked</th></tr></thead>
          <tbody>${renderAdminTableRows(insights.repeatedQuestions, [
            { value: (item) => item.question || "" },
            { value: (item) => item.count ?? "" },
            { value: (item) => item.failures ?? "" },
            { value: (item) => item.lastAskedAt || "" },
          ], "No repeated questions yet.")}</tbody>
        </table>
      </section>

      <section>
        <h2>Recent Failed Or Unavailable Bot Responses</h2>
        <table>
          <thead><tr><th>Time</th><th>Question</th><th>Country</th><th>Language</th><th>Outcome</th></tr></thead>
          <tbody>${renderAdminTableRows(insights.recentFailures, [
            { value: (item) => item.createdAt || "" },
            { value: (item) => item.question || "" },
            { value: (item) => item.selectedCountry || "" },
            { value: (item) => item.responseLanguage || "" },
            { value: (item) => item.outcome || "" },
          ], "No failed or unavailable responses yet.")}</tbody>
        </table>
      </section>

      <section>
        <h2>Breakdown</h2>
        <div>${renderAdminBreakdown(insights.byCountry)}</div>
        <div>${renderAdminBreakdown(insights.byLanguage)}</div>
        <div>${renderAdminBreakdown(insights.bySource)}</div>
      </section>
    </main>
  </body>
</html>`;

const canReadChatInsights = (req) => {
  const token = process.env.CHAT_INSIGHTS_TOKEN;

  if (token) {
    return req.get("x-admin-token") === token;
  }

  const remoteAddress = req.socket.remoteAddress || "";

  return [
    "127.0.0.1",
    "::1",
    "::ffff:127.0.0.1",
  ].includes(remoteAddress);
};


const getProductField = (product = {}, keys = []) => firstMetadataValue(product, keys);

const normalizeProductCategories = (product = {}) => {
  const categories = product.categories || product.category || product.product_category;

  if (Array.isArray(categories)) return categories.filter(Boolean);
  if (typeof categories === "string" && categories.trim()) {
    return categories
      .split(/[,|]/)
      .map((category) => category.trim())
      .filter(Boolean);
  }

  return [];
};

const toProductCard = (product, selectedCountry = defaultMarket) => {
  const explicitPrice = getProductField(product, [
    "price_label",
    "priceLabel",
    "display_price",
    "displayPrice",
    "price_gbp",
    "priceGbp",
    "price_eur",
    "priceEur",
    "price",
  ]);
  const numericPrice = typeof product.price === "number" ? product.price : null;
  const symbol = getCurrencySymbolForCountry(selectedCountry);
  const priceGbp =
    explicitPrice ||
    (numericPrice !== null ? `${symbol || String.fromCharCode(163)}${numericPrice.toFixed(2)}` : "");
  const productUrl = getProductField(product, [
    "product_url",
    "productUrl",
    "buy_url",
    "buyUrl",
    "url",
    "link",
  ]);

  return {
    name: getProductField(product, ["name", "product_name", "productName", "title", "product"]) || "",
    priceGbp,
    description:
      getProductField(product, [
        "short_desc",
        "shortDescription",
        "short_description",
        "description",
        "approved_benefit",
        "approvedBenefit",
      ]) || "",
    approvedBenefit: getProductField(product, ["approved_benefit", "approvedBenefit"]),
    url: productUrl,
    imageUrl: normalizeProductAssetUrl(
      getProductField(product, [
        "image_url",
        "imageUrl",
        "image_urls",
        "imageUrls",
        "s3_image_uri",
        "s3ImageUri",
        "image",
        "thumbnail",
      ]),
    ),
    buyUrl: productUrl || getProductField(product, ["product_url", "productUrl", "shop_url", "shopUrl"]),
    rating: getProductField(product, ["rating", "stars"]),
    categories: normalizeProductCategories(product),
    disclaimer: getProductField(product, ["disclaimer"]) || "These statements have not been evaluated by the relevant regulatory authorities. Always consult a healthcare professional before use.",
  };
};

const loadUkProductCatalog = () => {
  if (!fs.existsSync(ukProductCatalogDir)) return [];

  return fs
    .readdirSync(ukProductCatalogDir)
    .filter((fileName) => fileName.endsWith(".json") && !fileName.startsWith("categories_index"))
    .flatMap((fileName) => {
      try {
                const raw = fs
          .readFileSync(path.join(ukProductCatalogDir, fileName), "utf8")
          .replace(/:\s*NaN\b/g, ": null");
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed)
          ? parsed.map((product) => toProductCard(product, defaultMarket))
          : [];
      } catch (error) {
        console.warn(`Unable to load product catalog file ${fileName}:`, error.message);
        return [];
      }
    })
    .filter((product) => product.name);
};

const ukProductCatalog = loadUkProductCatalog();

const belgiumProductCatalogS3Uri =
  process.env.BELGIUM_PRODUCT_CATALOG_S3_URI ||
  "s3://global-chatbot-kb/Foreverliving-NL-BE/Products-NL-BE/products-nl-be.json";
let belgiumProductCatalogPromise = null;

const readS3Text = async (s3Uri = "") => {
  const parsed = parseS3Uri(s3Uri);

  if (!parsed) return "";

  const object = await s3Client.send(
    new GetObjectCommand({
      Bucket: parsed.bucket,
      Key: parsed.key,
    }),
  );
  const chunks = [];

  for await (const chunk of object.Body) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
};

const normalizeCatalogJson = (parsed) => {
  if (Array.isArray(parsed)) return parsed;

  for (const key of ["products", "items", "data", "cards", "product_cards"]) {
    if (Array.isArray(parsed?.[key])) return parsed[key];
  }

  if (parsed && typeof parsed === "object") {
    const values = Object.values(parsed);

    if (values.every((value) => value && typeof value === "object" && !Array.isArray(value))) {
      return values;
    }
  }

  return [];
};

const loadBelgiumProductCatalog = async () => {
  if (!belgiumProductCatalogPromise) {
    belgiumProductCatalogPromise = readS3Text(belgiumProductCatalogS3Uri)
      .then((raw) => JSON.parse(raw.replace(/:\s*NaN\b/g, ": null")))
      .then((parsed) =>
        normalizeCatalogJson(parsed)
          .map((product) => toProductCard(product, "Belgium"))
          .filter((product) => product.name),
      )
      .catch((error) => {
        console.warn("Unable to load Belgium product catalog:", error.message);
        belgiumProductCatalogPromise = null;
        return [];
      });
  }

  return belgiumProductCatalogPromise;
};

const getProductCatalogForCountry = async (selectedCountry = "") => {
  if (selectedCountry === defaultMarket) return ukProductCatalog;
  if (selectedCountry === "Belgium") return loadBelgiumProductCatalog();

  return [];
};

const tokenizeSearchText = (value = "") =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);

const categoryKeywordMap = {
  "bee-products": ["bee", "honey", "propolis", "pollen", "royal jelly", "propolis", "bee pollen"],
  "skin-care": ["skin", "skincare", "cream", "lotion", "moistur", "body wash", "gelly", "huid", "aloe", "moisturizer", "serum"],
  "personal-care": ["hair", "haar", "haarverzorging", "shampoo", "conditioner", "deodorant", "tooth", "lips", "soap", "jojoba", "nourishing", "aloe"],
  drinks: ["drink", "drank", "berry", "nectar", "mango", "gel", "aloe vera gel", "aloe gel", "forever gel"],
  nutritional: ["supplement", "vitamin", "nutrition", "wellness", "immune", "arctic", "garlic", "arctic sea", "calcium", "multi", "active pro-b", "fiber"],
  "monthly-wellness-focus": ["wellness", "daily routine", "active pro-b", "aloe vera gel", "berry", "mango", "peaches", "fiber", "freedom"],
  "weight-management": ["weight", "shake", "fibre", "fiber", "protein", "lean", "slim", "clean 9"],
};

const requestedProductCategoryRules = [
  {
    id: "hair-care",
    requestPattern: /\b(hair|haar\w*|shampoo|conditioner)\b/i,
    productPattern: /\b(hair|haar\w*|shampoo|conditioner|jojoba|nourishing hair oil)\b/i,
  },
  {
    id: "skin-care",
    requestPattern: /\b(skin|skincare|huid|cream|lotion|moistur\w*|gelly|body wash)\b/i,
    productPattern: /\b(skin|skincare|huid|cream|lotion|moistur\w*|gelly|body wash)\b/i,
  },
  {
    id: "bee-products",
    requestPattern: /\b(bee|honey|propolis|pollen|royal jelly)\b/i,
    productPattern: /\b(bee|honey|propolis|pollen|royal jelly)\b/i,
  },
  {
    id: "drinks",
    requestPattern: /\b(drinks?|drank|berry|nectar|mango|aloe vera gel)\b/i,
    productPattern: /\b(drinks?|drank|berry|nectar|mango|aloe vera gel)\b/i,
  },
  {
    id: "nutritional",
    requestPattern: /\b(wellness|supplements?|vitamin|nutrition|immune|arctic|garlic|daily routine|pro-b|probiotic)\b/i,
    productPattern: /\b(nutritional|monthly-wellness-focus|drinks?|supplements?|vitamin|nutrition|wellness|immune|arctic|garlic|active pro-b|probiotic|fiber|fibre|aloe vera gel|berry nectar|mango|peaches|freedom)\b/i,
  },
  {
    id: "weight-management",
    requestPattern: /\b(weight|shake|fibre|fiber|protein)\b/i,
    productPattern: /\b(weight|shake|fibre|fiber|protein)\b/i,
  },
];

const getCatalogProductText = (product = "") =>
  `${product.name || ""} ${product.description || ""} ${product.categories?.join(" ") || ""}`
    .toLowerCase();

const getCatalogProductNameCategoryText = (product = "") =>
  `${product.name || ""} ${product.categories?.join(" ") || ""}`.toLowerCase();

const getRequestedProductCategoryRule = (message = "") =>
  requestedProductCategoryRules.find((rule) => rule.requestPattern.test(message));

const productMatchesRequestedCategory = (product, requestedCategoryRule) => {
  if (!requestedCategoryRule) return true;

  const categoryText = getCatalogProductNameCategoryText(product);
  const isAccessoryLike = /\b(accessories|literature|sample|samples|gift bag|bottle|spray|ribbon|paper|postcard|lanyard|shaker|headband)\b/i.test(
    categoryText,
  );

  if (requestedCategoryRule.id === "nutritional" && isAccessoryLike) {
    return false;
  }

  if (requestedCategoryRule.id === "hair-care") {
    return /\b(hair|haar\w*|shampoo|conditioner|jojoba|nourishing hair oil|hair care|hair-care)\b/i.test(
      categoryText,
    );
  }

  return requestedCategoryRule.productPattern.test(getCatalogProductText(product));
};

const scoreCatalogProduct = (product, searchText, answerText) => {
  const haystack = `${searchText} ${answerText}`.toLowerCase();
  const productText = getCatalogProductText(product);
  const productTokens = tokenizeSearchText(product.name);
  let score = 0;

  // Strong exact name match
  if (haystack.includes(product.name.toLowerCase())) score += 90;

  // Token matching
  productTokens.forEach((token) => {
    if (haystack.includes(token)) score += 12;
  });

  // Category + keyword boosting (improved relevance)
  product.categories?.forEach((category) => {
    const normalizedCategory = String(category).toLowerCase();
    const keywords = categoryKeywordMap[normalizedCategory] || [];

    keywords.forEach((keyword) => {
      if (haystack.includes(keyword)) score += 22;
    });

    if (haystack.includes(normalizedCategory.replace(/-/g, " "))) score += 25;
  });

  // Specific product affinity boosts
  if (/aloe/.test(haystack) && /aloe/.test(productText)) score += 18;
  if (/honey|bee|propolis/.test(haystack) && /bee|honey|propolis|pollen|royal jelly/.test(productText)) score += 30;
  if (/hair|haar|shampoo|conditioner|jojoba/.test(haystack) && /hair|haar|shampoo|conditioner|jojoba|nourishing/.test(productText)) score += 32;
  if (/skin|moistur|cream|lotion/.test(haystack) && /skin|moistur|lotion|cream|body/.test(productText)) score += 28;
  if (/drink|gel|berry|nectar/.test(haystack) && /drink|gel|berry|nectar/.test(productText)) score += 25;
  if (/\b(products?|producten?|recommend|best|good|option|show|help|choose)\b/.test(haystack)) score += 8;

  // Bonus for popular/well-known products
  if (/aloe.*vera|forever.*aloe|daily.*routine|clean 9|arctic sea/.test(productText)) score += 15;

  return score;
};

const getCatalogProductCards = async ({
  message = "",
  answer = "",
  selectedCountry = "",
  limit = PRODUCT_CARD_LIMIT,
}) => {
  const catalog = await getProductCatalogForCountry(selectedCountry);

  if (catalog.length === 0) return [];

  const requestedCategoryRule = getRequestedProductCategoryRule(message);

  return catalog
    .filter((product) => productMatchesRequestedCategory(product, requestedCategoryRule))
    .map((product) => ({
      product,
      score: scoreCatalogProduct(product, message, answer),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ product }) =>
      selectedCountry === defaultMarket ? enrichProductCard(product) : product,
    );
};
const productCardCache = new Map();
let lastBedrockDebug = null;

const normalizeProductName = (name = "") =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const productCatalogByName = new Map(
  ukProductCatalog.map((product) => [normalizeProductName(product.name), product]),
);

const rememberProductCards = (cards = []) => {
  cards.forEach((card) => {
    const key = normalizeProductName(card.name);

    if (!key) return;

    const existing = productCardCache.get(key) || {};
    productCardCache.set(key, {
      ...existing,
      ...card,
      imageUrl: card.imageUrl || existing.imageUrl || "",
      priceGbp: card.priceGbp || existing.priceGbp || "",
      url: card.url || existing.url || "",
      buyUrl: card.buyUrl || existing.buyUrl || card.url || existing.url || "",
      rating: card.rating || existing.rating || "",
      categories: card.categories?.length ? card.categories : existing.categories || [],
    });
  });
};

const enrichProductCard = (card) => {
  const key = normalizeProductName(card.name);
  const catalogProduct = productCatalogByName.get(key);
  const cached = productCardCache.get(key);

  return {
    ...card,
    ...(catalogProduct || {}),
    ...(cached || {}),
    name: card.name || catalogProduct?.name || cached?.name || "",
    imageUrl: card.imageUrl || catalogProduct?.imageUrl || cached?.imageUrl || "",
    priceGbp: card.priceGbp || catalogProduct?.priceGbp || cached?.priceGbp || "",
    url: card.url || catalogProduct?.url || cached?.url || "",
    buyUrl:
      card.buyUrl ||
      catalogProduct?.buyUrl ||
      catalogProduct?.url ||
      cached?.buyUrl ||
      cached?.url ||
      "",
    description:
      card.description ||
      catalogProduct?.description ||
      cached?.description ||
      "",
    categories:
      card.categories?.length
        ? card.categories
        : catalogProduct?.categories?.length
          ? catalogProduct.categories
          : cached?.categories || [],
  };
};

const ukHairCareFallbackCards = [
  {
    name: "Aloe-Jojoba Shampoo",
    priceGbp: "",
    description:
      "A gentle everyday shampoo from the UK product information that helps cleanse hair while leaving it soft and manageable.",
    approvedBenefit: "",
    url: "",
    imageUrl: "",
    buyUrl: "",
    rating: "",
    categories: ["hair care"],
    disclaimer: "",
  },
  {
    name: "Aloe-Jojoba Conditioner",
    priceGbp: "",
    description:
      "A conditioner from the UK product information that helps soften, smooth, and hydrate hair.",
    approvedBenefit: "",
    url: "",
    imageUrl: "",
    buyUrl: "",
    rating: "",
    categories: ["hair care"],
    disclaimer: "",
  },
  {
    name: "Nourishing Hair Oil",
    priceGbp: "",
    description:
      "A hair oil option from the UK product information for moisture, shine, and frizz control.",
    approvedBenefit: "",
    url: "",
    imageUrl: "",
    buyUrl: "",
    rating: "",
    categories: ["hair care"],
    disclaimer: "",
  },
];

const productRequestPattern =
  /\b(products?|aloe|alo|gel|drink|body|lotion|wash|soap|lips|sunscreen|moistur\w*|cleanser|serum|skin|hair|care|wellness|supplements?|price|image|link|buy|purchase|shop|produkt|produkte|producten?|aanbevelen|kopen|prijs|huid|verzorging|haar\w*|shampoo|champu|champú|cabello|cheveux|soin|soins)\b/i;

const nonProductCardRequestPattern =
  /\b(global\s+rally|rally|case\s+credits?|credits?|chairman'?s?\s+bonus|bonus|incentives?|recognition|qualification|qualify|requirements?|travel\s+programs?|business\s+opportunit(?:y|ies)|fbo|manager|compensation|orders?|returns?|refund|shipping|training|learning|support|customer\s+service|pregnan\w*|breastfeed\w*|nursing|medication|medicine|prescription|medical|doctor|pharmacist|condition|disease|diagnos\w*|treat\w*|cure|prevent|diabet\w*|allerg\w*|asthma|safe to use|is it safe|contraindicat\w*)\b|rally\s+globale|case\s+credits?|crediti|riconoscimento|incentiv[oi]|qualificarsi|qualifica|requisiti|programma\s+viaggi|opportunit[aà]\s+di\s+business|rimborso|reso|spedizione|formazione|assistenza|gravidanza|incinta|allattamento|farmac[oi]|medicin[ae]|medico|farmacista|diabete|allergia|sicuro|zwanger|borstvoeding|medicatie|arts|apotheker|veilig/i;

const japaneseProductRequestPattern =
  /[\u5546\u54c1\u88fd\u54c1]|\u30d8\u30a2|\u30d8\u30a2\u30b1\u30a2|\u9aea|\u9aea\u306e\u30b1\u30a2|\u30b7\u30e3\u30f3\u30d7\u30fc|\u30b3\u30f3\u30c7\u30a3\u30b7\u30e7\u30ca\u30fc|\u304a\u3059\u3059\u3081|\u63d0\u6848/;

const hairCareRequestPattern =
  /\b(hair|hair care|shampoo|conditioner|haar\w*|cabello|cheveux)\b|\u30d8\u30a2|\u30d8\u30a2\u30b1\u30a2|\u9aea|\u30b7\u30e3\u30f3\u30d7\u30fc|\u30b3\u30f3\u30c7\u30a3\u30b7\u30e7\u30ca\u30fc/i;

const isProductRequest = (message = "") =>
  !nonProductCardRequestPattern.test(message) &&
  (productRequestPattern.test(message) || japaneseProductRequestPattern.test(message));

const shouldSuppressProductCards = (message = "", answer = "") =>
  nonProductCardRequestPattern.test(`${message}\n${answer}`);

const isHairCareRequest = (message = "", answer = "") =>
  hairCareRequestPattern.test(`${message} ${answer}`);

const isInternationalDirectoryQuestion = (message = "") =>
  /\b(international|global|worldwide|office|offices|office address|address|directory|staff|contact|contacts|phone|email|thailand|thai|country office)\b|ufficio|indirizzo|directory|contatto|contatti|sede|thailandia|internazionale|mondiale|kantoor|adres|gids|contactpersoon|contacten|bureau|adresse|annuaire|coordonn[ée]es/i.test(
    message,
  );

const getRetrievalHints = (message = "") => {
  const hints = [];

  if (isProductRequest(message)) {
    hints.push("Product retrieval intent: find relevant Forever Living product information, product names, categories, prices, images, usage notes, and product detail links in the selected market sources.");
  } else if (isInternationalDirectoryQuestion(message)) {
    hints.push("International directory retrieval intent: answer from global-scoped office directory, staff contacts, country office, address, phone, email, and international contact records. Global-scoped directory results apply regardless of the selected market, so provide the requested office/contact details if they are retrieved.");
  } else {
    hints.push("Document retrieval intent: answer the user's question from selected-market documents first. Search exact user wording, translated equivalents, document titles, headings, policy section numbers, policy clause titles, FBO rules, company conduct rules, program names, qualification rules, benefits, requirements, and support details. Use global-scoped content only as a fallback unless the question is about international offices, staff, contacts, or directory entries.");
  }

  return hints.join("\n");
};

const getExactRetrievalTerms = (message = "") => {
  const text = String(message || "");
  const terms = new Set();

  for (const match of text.matchAll(/\b(?:Art\.?\s*#?|SKU|Product\s*(?:ID|Number)|Artikel(?:nummer)?\.?\s*#?)\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{2,})/gi)) {
    terms.add(match[1]);
  }

  for (const match of text.matchAll(/\b\d{3,8}\b/g)) {
    terms.add(match[0]);
  }

  for (const match of text.matchAll(/\b[A-Za-z0-9]+(?:-[A-Za-z0-9]+){2,}\b/g)) {
    terms.add(match[0]);
  }

  return Array.from(terms);
};

const hasExactRetrievalTerms = (message = "") => getExactRetrievalTerms(message).length > 0;


const decodeBasicHtmlEntities = (value = "") =>
  String(value)
    .replace(/&auml;/gi, "ä")
    .replace(/&ouml;/gi, "ö")
    .replace(/&uuml;/gi, "ü")
    .replace(/&Auml;/g, "Ä")
    .replace(/&Ouml;/g, "Ö")
    .replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/gi, "ß")
    .replace(/&aring;/gi, "å")
    .replace(/&Aring;/g, "Å")
    .replace(/&eacute;/gi, "é")
    .replace(/&egrave;/gi, "è")
    .replace(/&ecirc;/gi, "ê")
    .replace(/&euml;/gi, "ë")
    .replace(/&agrave;/gi, "à")
    .replace(/&acirc;/gi, "â")
    .replace(/&icirc;/gi, "î")
    .replace(/&ocirc;/gi, "ô")
    .replace(/&ugrave;/gi, "ù")
    .replace(/&ccedil;/gi, "ç")
    .replace(/&igrave;/gi, "ì")
    .replace(/&ograve;/gi, "ò")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const parseInlineMetadataBlocks = (text = "") =>
  Array.from(text.matchAll(/METADATA\s*([\s\S]*?)\s*END_METADATA/gi)).map((match) => {
    const metadata = {};

    match[1].split(/\r?\n/).forEach((line) => {
      const separatorIndex = line.indexOf(":");

      if (separatorIndex === -1) return;

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();

      if (key) {
        metadata[key] = value;
      }
    });

    return metadata;
  });

const getProductCardsFromInlineMetadata = (text = "", selectedCountry = "") => {
  const seen = new Set();

  return parseInlineMetadataBlocks(text)
    .map((metadata) => {
      const name = firstMetadataValue(metadata, [
        "product_name",
        "productName",
        "product",
        "name",
        "title",
      ]);
      const productUrl = normalizeMetadataUrl(
        firstMetadataValue(metadata, [
          "product_url",
          "productUrl",
          "buy_url",
          "buyUrl",
          "shop_url",
          "shopUrl",
          "canonical_url",
          "url",
          "link",
        ]),
      );
      const imageUrl = normalizeMetadataUrl(
        firstMetadataValue(metadata, [
          "image_url",
          "imageUrl",
          "image_urls",
          "imageUrls",
          "og_image_url",
          "image",
          "thumbnail",
        ]),
      );
      const description = decodeBasicHtmlEntities(
        firstMetadataValue(metadata, [
          "short_description",
          "short_desc",
          "shortDescription",
          "og_description",
          "meta_description",
          "description",
          "long_description",
        ]),
      );
      const category = firstMetadataValue(metadata, [
        "category",
        "categories",
        "product_category",
        "productCategory",
      ]);
      const contentType = firstMetadataValue(metadata, [
        "content_type",
        "contentType",
        "type",
        "record_type",
        "recordType",
      ]);
      const key = normalizeProductName(name);
      const hasProductMetadata =
        Boolean(name) &&
        (Boolean(productUrl) ||
          Boolean(imageUrl) ||
          Boolean(getPriceFromMetadata(metadata, selectedCountry)) ||
          Boolean(firstMetadataValue(metadata, ["sku", "SKU", "article_number", "articleNumber", "product_id", "productId"])) ||
          /\bproduct|catalog|sku\b/i.test(String(contentType || category || "")));

      if (!hasProductMetadata || !key || seen.has(key)) return null;
      seen.add(key);

      return {
        name,
        priceGbp: getPriceFromMetadata(metadata, selectedCountry),
        description,
        approvedBenefit: "",
        url: productUrl,
        imageUrl,
        buyUrl: productUrl,
        rating: "",
        categories: category ? [category] : [],
        disclaimer: "These statements have not been evaluated by the relevant regulatory authorities. Always consult a healthcare professional before use.",
      };
    })
    .filter(Boolean)
    .slice(0, PRODUCT_CARD_LIMIT);
};

const getInlineMetadataTextFromCitations = (citations = []) =>
  citations
    .flatMap((citation) => citation.retrievedReferences || [])
    .map((reference) => reference.content?.text || "")
    .join("\n\n");

const ensureProductCards = async ({
  answer = "",
  productCards = [],
  message = "",
  selectedCountry = "",
}) => {
  if (shouldSuppressProductCards(message, answer)) return [];
  if (getQuestionContentType(message) !== "product") return [];
  if (productCards.length > 0) {
    const requestedCategoryRule = getRequestedProductCategoryRule(message);
    const filteredCards = productCards.filter((product) =>
      productMatchesRequestedCategory(product, requestedCategoryRule),
    );
    const cardsToUse = requestedCategoryRule ? filteredCards : productCards;

    return selectedCountry === defaultMarket
      ? cardsToUse.map(enrichProductCard)
      : cardsToUse;
  }
  if (!isProductRequest(message)) return productCards;

  const catalogCards = await getCatalogProductCards({
    message,
    answer,
    selectedCountry,
  });

  if (catalogCards.length > 0) return catalogCards;
  if (selectedCountry !== defaultMarket) return productCards;

  if (!isHairCareRequest(message, answer)) return productCards;

  const matchedCards = ukHairCareFallbackCards.filter((card) =>
    answer.toLowerCase().includes(card.name.toLowerCase()),
  );

  return (matchedCards.length > 0 ? matchedCards : ukHairCareFallbackCards).map(enrichProductCard);
};


const localCatalogAnswerTemplates = {
  English:
    "Here are some relevant UK Forever Living product options based on your request. Click any card to learn more, see details, or purchase. Would you like to know more about a specific product?",
  French:
    "Voici quelques options de produits Forever Living pertinentes au Royaume-Uni. Cliquez sur une carte pour en savoir plus, voir les détails ou acheter. Voulez-vous en savoir plus sur un produit spécifique ?",
  Spanish:
    "Aquí tienes algunas opciones relevantes de productos Forever Living del Reino Unido. Haz clic en cualquier tarjeta para aprender más, ver detalles o comprar. ¿Quieres saber más sobre un producto específico?",
  German:
    "Hier sind einige passende Forever Living-Produktoptionen aus dem Vereinigten Königreich. Klicke auf eine Karte, um mehr zu erfahren, Details zu sehen oder zu kaufen. Möchtest du mehr über ein bestimmtes Produkt wissen?",
  Dutch:
    "Hier zijn enkele relevante Forever Living-productopties voor België. Klik op een kaart om meer te weten, details te bekijken of te kopen. Wil je meer weten over een specifiek product?",
  Japanese:
    "ã”è¦æœ›ã«åˆã†è‹±å›½å‘ã‘ã® Forever Living å•†å“ã‚ªãƒ—ã‚·ãƒ§ãƒ³ã‚’ã”ç´¹ä»‹ã—ã¾ã™ã€‚ä¸‹ã®ã‚«ãƒ¼ãƒ‰ã‹ã‚‰å•†å“è©³ç´°ã‚’é–‹ã„ãŸã‚Šã€ç›´æŽ¥è³¼å…¥ãƒšãƒ¼ã‚¸ã«é€²ã‚“ã ã‚Šã§ãã¾ã™ã€‚",
};

const belgiumLocalCatalogAnswerTemplates = {
  English:
    "Here are some relevant Belgium Forever Living product options based on your request. Click any card to learn more, see details, or purchase. Would you like to know more about a specific product?",
  French:
    "Voici quelques options de produits Forever Living pertinentes en Belgique. Cliquez sur une carte pour en savoir plus, voir les détails ou acheter. Voulez-vous en savoir plus sur un produit spécifique ?",
  Dutch:
    "Hier zijn enkele relevante Forever Living-productopties voor België. Klik op een kaart om meer te weten, details te bekijken of te kopen. Wil je meer weten over een specifiek product?",
};

const getLocalCatalogAnswerText = (selectedCountry = "", responseLanguage = "English") => {
  if (selectedCountry === "Belgium") {
    return (
      belgiumLocalCatalogAnswerTemplates[responseLanguage] ||
      belgiumLocalCatalogAnswerTemplates.English
    );
  }

  return (
    localCatalogAnswerTemplates[responseLanguage] ||
    localCatalogAnswerTemplates.English
  );
};

const shouldUseLocalCatalogOnly = (message = "", responseLanguage = "") => {
  if (!["English", "French", "Spanish", "German", "Japanese", "Dutch"].includes(responseLanguage)) {
    return false;
  }

  if (
    /return|refund|policy|compensation|income|earn|commission|bonus|pregnant|diabetic|medication|dosage|doctor|pharmacist|medical|disease|treat|cure|prevent|diagnos/i.test(
      message,
    )
  ) {
    return false;
  }

  return isProductRequest(message);
};

const getLocalCatalogAnswer = async ({
  message = "",
  selectedCountry = "",
  responseLanguage = "English",
}) => {
  if (![defaultMarket, "Belgium"].includes(selectedCountry)) return null;
  if (!shouldUseLocalCatalogOnly(message, responseLanguage)) return null;

  const productCards = await getCatalogProductCards({
    message,
    answer: "",
    selectedCountry,
    limit: PRODUCT_CARD_LIMIT,
  });

  if (productCards.length === 0) return null;

  return {
    answer: getLocalCatalogAnswerText(selectedCountry, responseLanguage),
    productCards,
    citations: [],
    source: "local-product-catalog",
  };
};


const countryMarketCodeMap = {
  "United Kingdom": "UK",
  Germany: "DE",
  Belgium: "BEL",
  Canada: "CA",
  "United States": "US",
  Ecuador: "EC",
  France: "FR",
  Spain: "ES",
  Italy: "IT",
  Netherlands: "NL",
  Denmark: "DK",
  Sweden: "SE",
  Norway: "NO",
  Finland: "FI",
  Ireland: "IE",
  Australia: "AU",
  "New Zealand": "NZ",
  India: "IN",
  Japan: "JP",
  "South Korea": "KR",
  Singapore: "SG",
  Brazil: "BR",
  Mexico: "MX",
  "South Africa": "ZA",
};

const getMarketMetadataValue = (selectedCountry = defaultMarket) =>
  process.env[`BEDROCK_MARKET_METADATA_${toMarketEnvKey(selectedCountry)}`] ||
  countryMarketCodeMap[selectedCountry] ||
  toMarketEnvKey(selectedCountry);

const countryMarketMetadataMap = {
  "United Kingdom": {
    marketValues: ["UK", "United Kingdom", "GB", "GBR", "UK-EN"],
    localeValues: ["UK-EN", "en-GB"],
    countryValues: ["UK", "United Kingdom", "GB", "GBR"],
    regionValues: ["UK", "GB", "GBR"],
  },
  Germany: {
    marketValues: ["DE", "DEU", "Germany", "Deutschland", "DE-DE", "Germany-DE"],
    localeValues: ["DE-DE", "de-DE"],
    countryValues: ["DE", "DEU", "Germany", "Deutschland"],
    regionValues: ["DE", "DEU"],
  },
  Belgium: {
    marketValues: ["BEL", "BE", "Belgium", "Belgique", "Belgie", "NL-BE"],
    localeValues: ["NL-BE", "nl-BE", "FR-BE", "fr-BE"],
    countryValues: ["BEL", "BE", "Belgium", "Belgique", "Belgie"],
    regionValues: ["BEL", "BE"],
  },
  Canada: {
    marketValues: ["CA", "CAN", "Canada", "Canadian", "CA-EN", "CA-FR", "Canada-EN", "Canada-FR"],
    localeValues: ["CA-EN", "CA-FR", "en-CA", "fr-CA"],
    countryValues: ["CA", "CAN", "Canada", "Canadian"],
    regionValues: ["CA", "CAN"],
  },
  Italy: {
    marketValues: ["IT", "ITA", "Italy", "ITALY", "Italia", "ITALIA", "IT-IT", "it-IT", "Italy-IT", "Italy_IT"],
    localeValues: ["IT-IT", "it-IT", "IT_IT", "it_IT"],
    countryValues: ["IT", "ITA", "Italy", "ITALY", "Italia", "ITALIA"],
    regionValues: ["IT", "ITA"],
  },
  Netherlands: {
    marketValues: ["NL", "NLD", "Netherlands", "Nederland", "NL-NL", "Netherlands-NL"],
    localeValues: ["NL-NL", "nl-NL"],
    countryValues: ["NL", "NLD", "Netherlands", "Nederland"],
    regionValues: ["NL", "NLD"],
  },
  Sweden: {
    marketValues: ["SE", "SWE", "Sweden", "Sverige", "SE-SE", "Sweden-SE"],
    localeValues: ["SE-SE", "sv-SE"],
    countryValues: ["SE", "SWE", "Sweden", "Sverige"],
    regionValues: ["SE", "SWE"],
  },
};

const buildMetadataEqualsFilters = (key, values = []) => {
  const uniqueValues = Array.from(new Set(values.filter(Boolean)));
  return uniqueValues.map((value) => ({
    equals: {
      key,
      value,
    },
  }));
};

const buildFlatOrFilter = (filters = []) => {
  const validFilters = filters.filter(Boolean);
  if (validFilters.length === 0) return null;
  return validFilters.length === 1 ? validFilters[0] : { orAll: validFilters };
};

const globalMetadataFilters = [
  ...buildMetadataEqualsFilters("market", ["global", "Global", "GLOBAL"]),
  ...buildMetadataEqualsFilters("country", ["global", "Global", "GLOBAL"]),
  ...buildMetadataEqualsFilters("region", ["global", "Global", "GLOBAL"]),
  ...buildMetadataEqualsFilters("locale", ["global", "Global", "GLOBAL"]),
  ...buildMetadataEqualsFilters("scope", ["global", "Global", "GLOBAL"]),
];

const buildMarketScopeFilter = (selectedCountry = defaultMarket) => {
  const metadata = countryMarketMetadataMap[selectedCountry];

  if (!metadata) {
    return buildFlatOrFilter(
      buildMetadataEqualsFilters("market", [getMarketMetadataValue(selectedCountry)]),
    );
  }

  const filters = [
    ...buildMetadataEqualsFilters("market", metadata.marketValues),
    ...buildMetadataEqualsFilters("locale", metadata.localeValues),
    ...buildMetadataEqualsFilters("language", metadata.localeValues),
    ...buildMetadataEqualsFilters("country", metadata.countryValues),
    ...buildMetadataEqualsFilters("region", metadata.regionValues),
    ...buildMetadataEqualsFilters("country", [selectedCountry]),
  ];

  return buildFlatOrFilter(filters);
};

const buildMarketOrGlobalScopeFilter = (selectedCountry = defaultMarket) => {
  const marketFilter = buildMarketScopeFilter(selectedCountry);
  const marketFilters = marketFilter?.orAll ?? (marketFilter ? [marketFilter] : []);
  const combinedFilters = [...marketFilters, ...globalMetadataFilters];

  return buildFlatOrFilter(combinedFilters);
};

const buildGlobalScopeFilter = () => buildFlatOrFilter(globalMetadataFilters);

const getQuestionContentType = (message = "") => {
  if (isProductRequest(message)) return "product";

  return "document";
};

const buildRetrievalFilter = ({
  selectedCountry = defaultMarket,
  message = "",
}) => {
  const marketFilter = isInternationalDirectoryQuestion(message)
    ? buildMarketOrGlobalScopeFilter(selectedCountry)
    : buildMarketScopeFilter(selectedCountry);

  if (!marketFilter) return undefined;

  return marketFilter;
};

const buildBedrockQuery = ({
  message = "",
  selectedCountry = defaultMarket,
  selectedLanguage = "",
  responseLanguage = "English",
}) => {
  const retrievalHints = getRetrievalHints(message);
  const exactTerms = getExactRetrievalTerms(message);
  const contextLines = [
    `Market: ${selectedCountry}`,
    `Required response language: ${responseLanguage}`,
    `You MUST write the final answer entirely in ${responseLanguage}. If the retrieved chunks are in English or another language, translate the explanation into ${responseLanguage} and preserve product names, article numbers, SKU numbers, and symbols exactly.`,
    "Global scope: Content tagged as global applies to every selected market and may be used alongside selected-market documents.",
  ];

  if (selectedLanguage) contextLines.push(`UI language: ${selectedLanguage}`);
  if (retrievalHints) contextLines.push(`Retrieval hint: ${retrievalHints}`);
  if (exactTerms.length > 0) {
    contextLines.push(
      `Exact-match retrieval priority: first find chunks that contain these exact terms before broader semantic matching: ${exactTerms.join(", ")}.`,
    );
  }

  return `${contextLines.join("\n")}\nQuestion: ${message}`;
};


const sendKnowledgeBaseRequest = async ({
  knowledgeBaseId,
  message,
  selectedCountry,
  selectedLanguage,
  responseLanguage,
  productRequest,
  retrievalFilter,
  sessionId = null,
  forceSemanticSearch = false,
}) =>
  client.send(
    new RetrieveAndGenerateCommand({
      input: {
        text: buildBedrockQuery({
          message,
          selectedCountry,
          selectedLanguage,
          responseLanguage,
        }),
      },
      ...(sessionId ? { sessionId } : {}),
      retrieveAndGenerateConfiguration: {
        type: "KNOWLEDGE_BASE",
        knowledgeBaseConfiguration: {
          knowledgeBaseId,
          modelArn: process.env.BEDROCK_MODEL_ARN,
          retrievalConfiguration: {
            vectorSearchConfiguration: {
              numberOfResults: hasExactRetrievalTerms(message) ? 24 : productRequest ? 10 : 16,
              ...(hasExactRetrievalTerms(message) && !forceSemanticSearch ? { overrideSearchType: "HYBRID" } : {}),
              ...(retrievalFilter ? { filter: retrievalFilter } : {}),
            },
          },
          generationConfiguration: {
            promptTemplate: {
              textPromptTemplate: veraPromptTemplate,
            },
          },
        },
      },
    })
  );


const normalizeBedrockSessionId = (sessionId = "") => {
  const value = String(sessionId || "").trim();

  if (!value || value.startsWith("conv_")) return null;

  return value;
};

const isInvalidBedrockSessionError = (error) =>
  error?.name === "ValidationException" &&
  /session with id .* is not valid/i.test(error?.message || "");

const isBedrockFilterValidationError = (error) =>
  error?.name === "ValidationException" &&
  /filter|filtering|logical operators|nest more than|metadata/i.test(error?.message || "");

const isBedrockHybridSearchValidationError = (error) =>
  error?.name === "ValidationException" &&
  /overrideSearchType|hybrid|search type/i.test(error?.message || "");

const sendKnowledgeBaseRequestWithSessionFallback = async (request) => {
  try {
    return await sendKnowledgeBaseRequest(request);
  } catch (error) {
    if (request.sessionId && isInvalidBedrockSessionError(error)) {
      console.warn(
        "Bedrock rejected the saved session. Retrying without conversation memory.",
        error.message,
      );

      return sendKnowledgeBaseRequestWithSessionFallback({
        ...request,
        sessionId: null,
      });
    }

    if (request.retrievalFilter && isBedrockFilterValidationError(error)) {
      console.warn(
        "Bedrock rejected the metadata filter. Retrying without a retrieval filter.",
        error.message,
      );

      return sendKnowledgeBaseRequestWithSessionFallback({
        ...request,
        retrievalFilter: undefined,
      });
    }

    if (!request.forceSemanticSearch && isBedrockHybridSearchValidationError(error)) {
      console.warn(
        "Bedrock rejected hybrid exact-match search. Retrying with semantic search.",
        error.message,
      );

      return sendKnowledgeBaseRequestWithSessionFallback({
        ...request,
        forceSemanticSearch: true,
      });
    }

    throw error;
  }
};

const getRelaxedRetryFilters = ({
  selectedCountry = defaultMarket,
  message = "",
  retrievalFilter,
}) => {
  if (!retrievalFilter) return [];

  if (getQuestionContentType(message) === "document") {
    if (isInternationalDirectoryQuestion(message)) {
      return [buildGlobalScopeFilter(), undefined];
    }

    return [undefined];
  }

  if (
    selectedCountry !== defaultMarket &&
    isProductRequest(message) &&
    getQuestionContentType(message) !== "product"
  ) {
    return [undefined];
  }

  return [];
};

const shouldRetryKnowledgeBaseWithRelaxedFilter = ({
  answer = "",
  message = "",
  selectedCountry = "",
  retrievalFilter,
}) =>
  Boolean(retrievalFilter) &&
  isUnavailableAnswer(answer) &&
  getRelaxedRetryFilters({ selectedCountry, message, retrievalFilter }).length > 0;
const getKnowledgeBaseResult = async ({
  knowledgeBaseId,
  message,
  selectedCountry,
  selectedLanguage,
  responseLanguage,
  productRequest,
  retrievalFilter,
  sessionId = null,
}) => {
  const firstResponse = await sendKnowledgeBaseRequestWithSessionFallback({
    knowledgeBaseId,
    message,
    selectedCountry,
    selectedLanguage,
    responseLanguage,
    productRequest,
    retrievalFilter,
    sessionId,
  });

  const firstParsedAnswer = extractProductCards(
    firstResponse.output?.text || "I couldn't find an answer in the selected market Knowledge Base."
  );
  writeRetrievalDiagnosticsEvent({
    question: message,
    selectedCountry,
    selectedLanguage,
    responseLanguage,
    responseSource: "bedrock-knowledge-base",
    retrievalFilter,
    exactTerms: getExactRetrievalTerms(message),
    response: firstResponse,
  });

  if (!shouldRetryKnowledgeBaseWithRelaxedFilter({
    answer: firstParsedAnswer.answer,
    message,
    selectedCountry,
    retrievalFilter,
  })) {
    return {
      response: firstResponse,
      parsedAnswer: firstParsedAnswer,
      responseSource: "bedrock-knowledge-base",
    };
  }

  const retryFilters = getRelaxedRetryFilters({ selectedCountry, message, retrievalFilter });
  let lastRetryResponse = null;
  let lastRetryParsedAnswer = null;

  for (const retryFilter of retryFilters) {
    const retryResponse = await sendKnowledgeBaseRequestWithSessionFallback({
      knowledgeBaseId,
      message,
      selectedCountry,
      selectedLanguage,
      responseLanguage,
      productRequest,
      retrievalFilter: retryFilter,
      sessionId,
    });
    const retryParsedAnswer = extractProductCards(retryResponse.output?.text || "...");
    const retryResponseSource = retryFilter
      ? "bedrock-knowledge-base-document-global-retry"
      : "bedrock-knowledge-base-document-unfiltered-retry";

    lastRetryResponse = retryResponse;
    lastRetryParsedAnswer = retryParsedAnswer;
    writeRetrievalDiagnosticsEvent({
      question: message,
      selectedCountry,
      selectedLanguage,
      responseLanguage,
      responseSource: retryResponseSource,
      retrievalFilter: retryFilter,
      exactTerms: getExactRetrievalTerms(message),
      response: retryResponse,
    });

    if (!isUnavailableAnswer(retryParsedAnswer.answer)) {
      return {
        response: retryResponse,
        parsedAnswer: retryParsedAnswer,
        responseSource: retryResponseSource,
      };
    }
  }

  return {
    response: lastRetryResponse || firstResponse,
    parsedAnswer: lastRetryParsedAnswer || firstParsedAnswer,
    responseSource: lastRetryResponse
      ? "bedrock-knowledge-base-document-unfiltered-retry"
      : "bedrock-knowledge-base-document-retry",
  };
};
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173" }));
app.use((_req, res, next) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  next();
});
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/assets/s3-image", async (req, res) => {
  try {
    const parsed = parseS3Uri(req.query.uri || "");
    if (!parsed) return res.status(400).json({ error: "Valid S3 image URI is required." });

    // Security: Only allow our known bucket
    if (parsed.bucket !== "global-chatbot-kb") {
      return res.status(403).json({ error: "Access denied." });
    }

    const object = await s3Client.send(new GetObjectCommand({
      Bucket: parsed.bucket,
      Key: parsed.key,
    }));

    const chunks = [];
    for await (const chunk of object.Body) chunks.push(chunk);

    res.setHeader("Content-Type", object.ContentType || getContentTypeForImage(parsed.key));
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(Buffer.concat(chunks));
  } catch (error) {
    console.error("Unable to load S3 chat image:", error);
    res.status(404).json({ error: "Image not available." });
  }
});

app.get("/api/admin/chat-insights", (req, res) => {
  if (!canReadChatInsights(req)) {
    return res.status(401).json({
      error:
        "Unauthorized. Set CHAT_INSIGHTS_TOKEN and send it as the x-admin-token header, or access this endpoint from localhost.",
    });
  }

  const limit = Math.min(Number(req.query.limit) || 1000, 5000);
  const events = readChatInsightEvents().slice(-limit);

  const insights = {
    generatedAt: new Date().toISOString(),
    logFile: chatInsightsLogPath,
    limit,
    ...summarizeChatInsightEvents(events),
  };
  const handoffs = summarizeHandoffEvents(readHandoffEvents().slice(-limit));

  if (req.query.format === "json") {
    return res.json({
      ...insights,
      handoffs,
    });
  }

  res.type("html").send(renderSupportAdminDashboard(insights, handoffs));
});



app.get("/api/admin/last-bedrock-debug", (req, res) => {
  if (!canReadChatInsights(req)) {
    return res.status(401).json({
      error:
        "Unauthorized. Set CHAT_INSIGHTS_TOKEN and send it as the x-admin-token header, or access this endpoint from localhost.",
    });
  }

  res.json(lastBedrockDebug || { message: "No Bedrock response captured yet." });
});
app.post("/api/escalations", (req, res) => {
  const {
    question = "",
    selectedCountry = defaultMarket,
    selectedLanguage = "",
    reason = "manual",
    transcript = [],
  } = req.body || {};

  const responseLanguage = detectResponseLanguage(question, selectedLanguage);
  const handoff = createHandoffEvent({
    question,
    selectedCountry,
    selectedLanguage,
    responseLanguage,
    reason,
    status: "open",
    transcript,
    source: "manual-handoff",
    outcome: "handoff",
  });

  writeChatInsightEvent({
    question: redactQuestionForLog(question),
    normalizedQuestion: normalizeQuestionForInsights(question),
    selectedCountry,
    selectedLanguage,
    responseLanguage,
    responseSource: "manual-handoff",
    outcome: "handoff",
    productCardCount: 0,
    citationCount: 0,
    durationMs: 0,
  });

  res.status(201).json({
    ok: true,
    handoffId: handoff.id,
    message:
      "This conversation has been shared with the customer care team.",
  });
});
app.post("/api/chat", rateLimiter, async (req, res) => {
  try {
    const {
      message,
      selectedCountry = defaultMarket,
      selectedLanguage = "",
      conversationId = null,        // ← NEW: for memory
    } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message is required." });
    }

    const startedAt = Date.now();
    const responseLanguage = detectResponseLanguage(message, selectedLanguage);
    const sessionId =
      responseLanguage === "English" ? normalizeBedrockSessionId(conversationId) : null;
    const healthSafetyQuestion = isHealthSafetyQuestion(message);
    const incomeOpportunityQuestion = isIncomeOpportunityQuestion(message);

    if (isMedicalEmergencyQuestion(message)) {
      const payload = {
        answer: getLocalizedSafetyMessage(medicalEmergencyMessages, responseLanguage),
        productCards: [],
        imageCards: [],
        citations: [],
        conversationId: sessionId,
      };

      writeChatInsightEvent({
        question: redactQuestionForLog(message),
        normalizedQuestion: normalizeQuestionForInsights(message),
        selectedCountry,
        selectedLanguage,
        responseLanguage,
        responseSource: "medical-emergency-safety-response",
        outcome: "safety",
        productCardCount: 0,
        citationCount: 0,
        durationMs: Date.now() - startedAt,
      });

      return res.json(payload);
    }

    if (incomeOpportunityQuestion) {
      const payload = {
        answer: getIncomeOpportunityMessage(responseLanguage),
        productCards: [],
        imageCards: [],
        citations: [],
        conversationId: sessionId,
      };

      writeChatInsightEvent({
        question: redactQuestionForLog(message),
        normalizedQuestion: normalizeQuestionForInsights(message),
        selectedCountry,
        selectedLanguage,
        responseLanguage,
        responseSource: "income-opportunity-compliance-response",
        outcome: "compliance",
        productCardCount: 0,
        citationCount: 0,
        durationMs: Date.now() - startedAt,
      });

      return res.json(payload);
    }

    // Local catalog check
    const localCatalogAnswer = await getLocalCatalogAnswer({
      message,
      selectedCountry,
      responseLanguage,
    });

    if (localCatalogAnswer) {
      rememberProductCards(localCatalogAnswer.productCards);
      writeChatInsightEvent({
        question: redactQuestionForLog(message),
        normalizedQuestion: normalizeQuestionForInsights(message),
        selectedCountry,
        selectedLanguage,
        responseLanguage,
        responseSource: localCatalogAnswer.source || "local-product-catalog",
        outcome: "ok",
        productCardCount: localCatalogAnswer.productCards.length,
        citationCount: 0,
        durationMs: Date.now() - startedAt,
      });
      return res.json({ ...localCatalogAnswer, conversationId: sessionId });
    }

    const knowledgeBaseId = getMarketKnowledgeBaseId(selectedCountry);

    if (!knowledgeBaseId) {
      const payload = {
        answer: healthSafetyQuestion
          ? appendHealthGuidance("", responseLanguage)
          : getMarketUnavailableMessage(selectedCountry, responseLanguage),
        productCards: [],
        imageCards: [],
        citations: [],
        conversationId: sessionId,
      };
      writeChatInsightEvent({ /* same as before */ });
      createHandoffEvent({ /* same as before */ });
      return res.json(payload);
    }

    const questionContentType = getQuestionContentType(message);
    const productRequest = questionContentType === "product";
    const retrievalFilter = buildRetrievalFilter({ selectedCountry, message });

    const knowledgeBaseResult = await getKnowledgeBaseResult({
      knowledgeBaseId,
      message,
      selectedCountry,
      selectedLanguage,
      responseLanguage,
      productRequest,
      retrievalFilter,
      sessionId,
    });

    // === YOUR EXISTING PRODUCT CARD LOGIC (leave this part exactly as you have it) ===
    const parsedAnswer = knowledgeBaseResult.parsedAnswer;
    const shouldBuildProductCards =
      productRequest && !shouldSuppressProductCards(message, parsedAnswer.answer);
    const citationText = shouldBuildProductCards ? getInlineMetadataTextFromCitations(knowledgeBaseResult.response.citations || []) : "";
    const inlineMetadataProductCards = shouldBuildProductCards ? getProductCardsFromInlineMetadata(`${parsedAnswer.answer || ""}\n\n${citationText}`, selectedCountry) : [];
    const metadataProductCards = shouldBuildProductCards ? getProductCardsFromCitations(knowledgeBaseResult.response.citations || [], selectedCountry) : [];
    const candidateProductCards = inlineMetadataProductCards.length ? inlineMetadataProductCards : metadataProductCards;

    rememberProductCards(candidateProductCards);
    const productCards = await ensureProductCards({ answer: stripProductCardJson(parsedAnswer.answer), productCards: candidateProductCards, message, selectedCountry });

    const rawAnswer = stripInlineMetadataBlocks(stripProductCardJson(parsedAnswer.answer));
    const answer = healthSafetyQuestion
      ? appendHealthGuidance(rawAnswer, responseLanguage)
      : incomeOpportunityQuestion
        ? appendIncomeOpportunityGuidance(rawAnswer, responseLanguage)
      : rawAnswer;
    const citations = formatCitations(knowledgeBaseResult.response.citations || []);
    const imageCards = getImageCardsForResponse({ citations: knowledgeBaseResult.response.citations || [], message, selectedCountry });

    const payload = {
      answer,
      productCards,
      imageCards,
      citations,
      conversationId: knowledgeBaseResult.response.sessionId || sessionId,
    };

    const outcome = isUnavailableAnswer(answer) ? "unavailable" : "ok";
    writeChatInsightEvent({ /* your existing logging code */ });

    if (outcome === "unavailable") {
      createHandoffEvent({ /* your existing handoff */ });
    }

    res.json(payload);
  } catch (error) {
    console.error("Bedrock chat error:", error);
    // your existing error handling
    res.status(500).json({ error: "Vera could not reach the knowledge base. Please try again." });
  }
});

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  app.listen(port, () => {
    console.log(`Chat API running on http://localhost:${port}`);
  });
}

export {
  app,
  buildMarketOrGlobalScopeFilter,
  buildBedrockQuery,
  buildRetrievalFilter,
  decodeBasicHtmlEntities,
  detectResponseLanguage,
  getExactRetrievalTerms,
  getProductCardsFromCitations,
  getProductCardsFromInlineMetadata,
  isHealthSafetyQuestion,
  isIncomeOpportunityQuestion,
  isMedicalEmergencyQuestion,
  isUnavailableAnswer,
};

































