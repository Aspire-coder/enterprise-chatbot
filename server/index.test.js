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
  getProductCardsFromCitations,
  getProductCardsFromInlineMetadata,
  isHealthSafetyQuestion,
  isIncomeOpportunityQuestion,
  isMedicalEmergencyQuestion,
  isUnavailableAnswer,
} from "./index.js";

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
});

test("income opportunity questions never stay as generic refusals", async () => {
  assert.equal(isIncomeOpportunityQuestion("if I join foreverliving can i become rich?"), true);

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

test("preserves product names with numeric prefixes from validated metadata", () => {
  const cards = getProductCardsFromCitations(
    [
      {
        retrievedReferences: [
          {
            metadata: {
              product_name: "13-Day-Fit-Program 4759",
              sku: "4759",
              content_type: "product",
              price: "125.00",
            },
            content: {
              text: "13-Day-Fit-Program 4759 contains DX4™ and C9™ products.",
            },
          },
        ],
      },
    ],
    "Germany",
  );

  assert.equal(cards.length, 1);
  assert.equal(cards[0].name, "13-Day-Fit-Program 4759");
});

test("does not create product cards from plain text chunks without product metadata", () => {
  const cards = getProductCardsFromCitations([
    {
      retrievedReferences: [
        {
          metadata: {
            title: "Come qualificarsi:",
            content_type: "document",
          },
          content: {
            text: "500 Case Credits: accesso all'esperienza.",
          },
        },
      ],
    },
  ]);

  assert.deepEqual(cards, []);
});

test("inline metadata keeps numeric product titles intact", () => {
  const cards = getProductCardsFromInlineMetadata(`
METADATA
product_name: 13-Day-Fit-Program 4759
content_type: product
sku: 4759
price: 125.00
END_METADATA
`);

  assert.equal(cards.length, 1);
  assert.equal(cards[0].name, "13-Day-Fit-Program 4759");
});

test("Germany filters include DE and DEU aliases", () => {
  const filter = buildMarketOrGlobalScopeFilter("Germany");
  const serialized = JSON.stringify(filter);

  assert.match(serialized, /"DE"/);
  assert.match(serialized, /"DEU"/);
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

test("Italian unavailable wording triggers unfiltered retry", () => {
  const unavailable =
    "Mi dispiace, ma le informazioni che hai cercato non sono disponibili nei documenti approvati a cui ho accesso.";

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
