import { isUnavailableAnswer } from "../utils/helpers.js";

const medicalEmergencyPattern =
  /\b(emergency|medical emergency|urgent medical|call ambulance|call 911|call emergency|heart pain|heart hurts|pain in my heart|heart problem|cardiac pain|chest pain|chest tightness|tight chest|severe chest|heart attack|difficulty breathing|trouble breathing|can't breathe|cannot breathe|shortness of breath|stroke|face droop|slurred speech|sudden weakness|sudden numbness|severe allergic|anaphylaxis|swollen throat|throat closing|loss of consciousness|unconscious|fainting|seizure|severe bleeding|heavy bleeding|pregnancy emergency|pregnant and bleeding|bleeding while pregnant|severe pregnancy pain|suicidal|suicide|self harm|overdose)\b|dolore al petto|dolore al cuore|infarto|difficolt[aà] respirator|non riesco a respirare|ictus|reazione allergica grave|perdita di coscienza|emergenza medica|emergenza in gravidanza|bewusteloos|beroerte|hartaanval|hartpijn|pijn op de borst|ademhalingsproblemen|ernstige allergische|urgence m[ée]dicale|douleur thoracique|douleur au c[œo]ur|crise cardiaque|difficult[ée] [àa] respirer|attaque c[ée]r[ée]brale|urgence grossesse|emergencia m[ée]dica|dolor en el pecho|dolor de coraz[oó]n|ataque al coraz[oó]n|dificultad para respirar|derrame cerebral|emergencia embarazo/i;

const healthSafetyPattern =
  /\b(pregnan\w*|breastfeed\w*|nursing|medication|medicine|prescription|drug interaction|doctor|pharmacist|medical|condition|disease|diagnos\w*|treat\w*|cure|prevent|diabet\w*|blood pressure|heart condition|allerg\w*|asthma|cancer|kidney|liver|autoimmune|safe to use|is it safe|contraindicat\w*|side effects?|symptoms?|pain|fever|infection|rash|dizzy|dizziness|nausea|vomit\w*|diarrhea|headache|migraine|surgery|chemotherapy|insulin|antibiotic|antidepressant|blood thinner|supplement interaction|can i take|should i take|safe for me|safe with)\b|gravidanza|incinta|allattamento|farmac[oi]|medicin[ae]|prescrizione|dottore|medico|farmacista|condizione medica|malattia|diagnosi|trattare|curare|diabete|pressione|allergia|sicuro|controindic|dolore|febbre|infezione|sintomi|zwanger|zwangerschap|borstvoeding|medicatie|geneesmiddel|recept|arts|apotheker|medische aandoening|ziekte|diagnose|behandelen|genezen|diabetes|bloeddruk|allergie|veilig|contra-indicatie|douleur|fi[eè]vre|sympt[oô]mes|m[ée]dicament|embarazo|lactancia|medicamento|dolor|fiebre|s[ií]ntomas|seguro/i;

const childSafetyPattern =
  /\b(child|children|kid|kids|baby|babies|toddler|infant|minor|teen|teenager|under\s*18|son|daughter|my\s+boy|my\s+girl|for\s+my\s+child|give\s+to\s+my\s+child|give\s+my\s+child|give\s+to\s+kids?)\b|bambin[oi]|figli[ao]|minorenne|b\u00e9b\u00e9|enfant|enfants|mineur|ni\u00f1o|ni\u00f1a|ni\u00f1os|menor|kind|kinderen|baby|peuter|minderjarige|kindern?|jugendlich|minderj\u00e4hrig/i;

const isMedicalEmergencyQuestion = (message = "") =>
  medicalEmergencyPattern.test(message);

const isHealthSafetyQuestion = (message = "") =>
  isMedicalEmergencyQuestion(message) ||
  healthSafetyPattern.test(message) ||
  childSafetyPattern.test(message);

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
  /\b(rich|wealthy|millionaire|make money|earn money|financial freedom|guaranteed income|guarantee.*income|how much.*earn|can i make|join forever|join forever living|business opportunity|become an fbo)\b|diventare ricc[oa]|diventare milionari[oa]?|reddito garantito|opportunit[a?]\s+di\s+business|devenir riche|revenu garanti|gagner de l'argent|oportunidad de negocio|hacerme rico|ganar dinero|ingresos garantizados|bogat|garantovan.*prihod/i;

const compensationPlanQuestionPattern =
  /\b(leadership bonus|chairman'?s?\s+bonus|bonuses|bonus|commission|commissions|compensation plan|case credits?|ccs?|preferred customer profit|retail profit|personal bonus|manager bonus|eagle manager bonus)\b/i;

const isIncomeOpportunityQuestion = (message = "") =>
  incomeOpportunityPattern.test(message) &&
  !compensationPlanQuestionPattern.test(message);

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

export {
  appendHealthGuidance,
  appendIncomeOpportunityGuidance,
  childSafetyPattern,
  getIncomeOpportunityMessage,
  getLocalizedSafetyMessage,
  healthGuidanceMessages,
  incomeOpportunityPattern,
  isHealthSafetyQuestion,
  isIncomeOpportunityQuestion,
  isMedicalEmergencyQuestion,
  medicalEmergencyMessages,
  medicalEmergencyPattern,
  healthSafetyPattern,
};
