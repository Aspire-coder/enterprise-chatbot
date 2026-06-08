import assert from "node:assert/strict";
import test from "node:test";
import {
  app,
  buildBedrockQuery,
  buildMarketOrGlobalScopeFilter,
  buildRetrievalFilter,
  decodeBasicHtmlEntities,
  detectResponseLanguage,
  getExactRetrievalTerms,
  getMarketKnowledgeBaseId,
  getRelaxedRetryFilters,
  isHealthSafetyQuestion,
  isIncomeOpportunityQuestion,
  isMedicalEmergencyQuestion,
  isUnavailableAnswer,
} from "./index.js";

const requestedMarketCountries = [
  "Italy",
  "Sweden",
  "United Kingdom",
  "Germany",
  "Canada",
];

test("JSON API responses include UTF-8 content type", async () => {
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);

    assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
    assert.deepEqual(await response.json(), { ok: true });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("medical emergency wording returns local emergency guidance before Bedrock", async () => {
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "I am having Heart pain",
        selectedCountry: "United Kingdom",
        selectedLanguage: "English",
      }),
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.match(payload.answer, /seek immediate professional medical assistance/i);
    assert.match(payload.answer, /contact your local emergency services immediately/i);
    assert.deepEqual(payload.productCards, []);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("medical safety detector covers emergency and broader health questions", () => {
  assert.equal(isMedicalEmergencyQuestion("I am having Heart pain"), true);
  assert.equal(isMedicalEmergencyQuestion("I cannot breathe and my chest is tight"), true);
  assert.equal(isMedicalEmergencyQuestion("I am pregnant and bleeding"), true);
  assert.equal(isHealthSafetyQuestion("Can I take aloe while pregnant?"), true);
  assert.equal(isHealthSafetyQuestion("Is this safe with blood pressure medication?"), true);
  assert.equal(isHealthSafetyQuestion("I have kidney disease, can I use this product?"), true);
  assert.equal(isHealthSafetyQuestion("I have fever and a rash after taking this"), true);
  assert.equal(isHealthSafetyQuestion("What products can I give to my child?"), true);
  assert.equal(isHealthSafetyQuestion("Welche Produkte kann ich meinem Kind geben?"), true);
});

test("child product questions return safety guidance without product cards for every market", async () => {
  const server = app.listen(0);
  const markets = [
    ["United Kingdom", "English", "What products can I give to my child?"],
    ["Canada", "English", "What products can I give to my child?"],
    ["Germany", "German", "Welche Produkte kann ich meinem Kind geben?"],
    ["Italy", "Italian", "Quali prodotti posso dare a mio figlio?"],
    ["Netherlands", "Dutch", "Welke producten kan ik aan mijn kind geven?"],
  ];

  try {
    const { port } = server.address();

    for (const [selectedCountry, selectedLanguage, message] of markets) {
      const response = await fetch(`http://127.0.0.1:${port}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, selectedCountry, selectedLanguage }),
      });
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.deepEqual(payload.productCards, []);
      assert.doesNotMatch(payload.answer, /Forever Kids/i);
      assert.match(payload.answer, /healthcare|professional|professionista|zorgverlener|medizinisches Fachpersonal/i);
    }
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("income opportunity questions never stay as generic refusals", async () => {
  assert.equal(isIncomeOpportunityQuestion("if I join foreverliving can i become rich?"), true);
  assert.equal(isIncomeOpportunityQuestion("How can I earn Leadership Bonus?"), false);
  assert.equal(isIncomeOpportunityQuestion("How do I qualify for Chairman's Bonus?"), false);
  assert.equal(isIncomeOpportunityQuestion("What are the compensation plan requirements?"), false);
  assert.equal(isIncomeOpportunityQuestion("What bonuses can i received when i become an FBO?"), false);
  assert.equal(isIncomeOpportunityQuestion("When are commissions paid?"), false);
  assert.equal(isIncomeOpportunityQuestion("Can I earn money if I join Forever?"), true);
  assert.equal(isIncomeOpportunityQuestion("Can I become rich as an FBO?"), true);

  const server = app.listen(0);

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "if I join foreverliving can i become rich?",
        selectedCountry: "United Kingdom",
        selectedLanguage: "English",
      }),
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.doesNotMatch(payload.answer, /^Sorry, I am unable to assist you with this request\.?$/i);
    assert.match(payload.answer, /not .*promise|not .*guarantee/i);
    assert.match(payload.answer, /Income varies by individual effort/i);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("decodes and preserves multilingual UTF-8 characters", () => {
  const text =
    "Vera sucht das gerade f&uuml;r dich heraus... ä ö ü Ä Ö Ü ß é è à ç ì ò å";

  assert.equal(
    decodeBasicHtmlEntities(text),
    "Vera sucht das gerade für dich heraus... ä ö ü Ä Ö Ü ß é è à ç ì ò å",
  );
});

test("detects and preserves supported response languages", () => {
  assert.equal(
    detectResponseLanguage(
      "Welche Produkte sind im 13-Day-Fit-Program (Art. #4759) enthalten?",
      "German",
    ),
    "German",
  );
  assert.equal(detectResponseLanguage("Quali prodotti contiene il programma?", "Italian"), "Italian");
  assert.equal(detectResponseLanguage("Quels produits contient ce programme ?", "French"), "French");
  assert.equal(detectResponseLanguage("¿Qué productos contiene este programa?", "Spanish"), "Spanish");
  assert.equal(detectResponseLanguage("Koji proizvodi su uključeni u program?", "Serbian"), "Serbian");
  assert.equal(detectResponseLanguage("13-Day-Fit-Program 4759", "Italian"), "Italian");
});

test("Bedrock query strongly instructs selected non-English language", () => {
  const query = buildBedrockQuery({
    message: "Welche Produkte sind im 13-Day-Fit-Program (Art. #4759) enthalten?",
    selectedCountry: "Germany",
    selectedLanguage: "German",
    responseLanguage: "German",
  });

  assert.match(query, /Required response language: German/);
  assert.match(query, /entirely in German/);
  assert.match(query, /translate the explanation into German/);
  assert.doesNotMatch(query, /Answer language: German/);
});

test("extracts exact article numbers and numeric product/program names", () => {
  assert.deepEqual(
    getExactRetrievalTerms(
      "Welche Produkte sind im 13-Day-Fit-Program (Art. #4759) enthalten?",
    ),
    ["4759", "13-Day-Fit-Program"],
  );
});

test("Germany filters include DE and DEU aliases", () => {
  const filter = buildMarketOrGlobalScopeFilter("Germany");
  const serialized = JSON.stringify(filter);

  assert.match(serialized, /"DE"/);
  assert.match(serialized, /"DEU"/);
});

test("requested markets have explicit retrieval metadata filters", () => {
  for (const country of requestedMarketCountries) {
    const serialized = JSON.stringify(buildRetrievalFilter({ selectedCountry: country }));

    assert.match(serialized, new RegExp(`"${country}"`));
  }
});

test("requested markets can resolve configured knowledge base ids", () => {
  const previousEnv = { ...process.env };

  try {
    process.env.BEDROCK_KNOWLEDGE_BASE_ID = "default-uk-kb";
    process.env.BEDROCK_GLOBAL_KNOWLEDGE_BASE_ID = "global-kb";
    process.env.BEDROCK_KNOWLEDGE_BASE_ID_UK = "uk-kb";
    process.env.BEDROCK_KNOWLEDGE_BASE_ID_GERMANY = "germany-kb";
    process.env.BEDROCK_KNOWLEDGE_BASE_ID_ITALY = "italy-kb";
    process.env.BEDROCK_KNOWLEDGE_BASE_ID_SWEDEN = "sweden-kb";
    process.env.BEDROCK_KNOWLEDGE_BASE_ID_CANADA = "canada-kb";

    assert.equal(getMarketKnowledgeBaseId("United Kingdom"), "uk-kb");
    assert.equal(getMarketKnowledgeBaseId("Germany"), "germany-kb");
    assert.equal(getMarketKnowledgeBaseId("Italy"), "italy-kb");
    assert.equal(getMarketKnowledgeBaseId("Sweden"), "sweden-kb");
    assert.equal(getMarketKnowledgeBaseId("Canada"), "canada-kb");
  } finally {
    process.env = previousEnv;
  }
});

test("normal Italy document questions search Italy before global fallback", () => {
  const filter = buildRetrievalFilter({
    selectedCountry: "Italy",
    message:
      "5 Lealtà Gli FBO sono leali nei confronti dell'Azienda e degli Incaricati Forever.",
  });
  const serialized = JSON.stringify(filter);

  assert.match(serialized, /"ITA"/);
  assert.doesNotMatch(serialized, /"global"/);
});

test("market document retries do not search unrelated country documents", () => {
  const retrievalFilter = buildRetrievalFilter({
    selectedCountry: "Canada",
    message: "Are FBOs allowed to create AI-generated marketing content without company approval?",
  });
  const retryFilters = getRelaxedRetryFilters({
    selectedCountry: "Canada",
    message: "Are FBOs allowed to create AI-generated marketing content without company approval?",
    retrievalFilter,
  });
  const serialized = JSON.stringify(retryFilters);

  assert.equal(retryFilters.length, 1);
  assert.notEqual(retryFilters[0], undefined);
  assert.match(serialized, /"global"/);
  assert.doesNotMatch(serialized, /"SE"/);
  assert.doesNotMatch(serialized, /"NL"/);
});

test("Italian unavailable wording triggers relaxed retry", () => {
  const unavailable =
    "Mi dispiace, ma le informazioni che hai cercato non sono disponibili nei documenti approvati a cui ho accesso.";

  assert.equal(isUnavailableAnswer(unavailable), true);
});

test("German unavailable wording triggers relaxed retry", () => {
  const unavailable =
    "Mir tut es leid, aber die Informationen zu Datenschutz und Zweck der Speicherung sind in den mir verfügbaren genehmigten Dokumenten nicht enthalten.";

  assert.equal(isUnavailableAnswer(unavailable), true);
});

test("international office questions can include global directory scope", () => {
  const filter = buildRetrievalFilter({
    selectedCountry: "Italy",
    message: "Mi dia l'indirizzo dell'ufficio in Thailandia",
  });
  const serialized = JSON.stringify(filter);

  assert.match(serialized, /"ITA"/);
  assert.match(serialized, /"global"/);
});
