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

export { getMarketUnavailableMessage };
