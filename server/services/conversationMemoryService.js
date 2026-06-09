import {
  buildCacheKey,
  getCacheValue,
  setCacheValue,
} from "./cacheService.js";

const MAX_CONVERSATION_MESSAGES = 5;
const CONVERSATION_MEMORY_TTL_SECONDS = 60 * 60 * 24;
const memoryStore = new Map();

const buildConversationMemoryKey = (conversationId = "") =>
  buildCacheKey("conversation-memory", [conversationId]);

const normalizeConversationMessage = (message = "") =>
  String(message || "")
    .trim()
    .replace(/\s+/g, " ");

const getMemoryConversation = (conversationId = "") =>
  memoryStore.get(conversationId) || {
    conversationId,
    messages: [],
  };

const setMemoryConversation = (conversationId = "", conversation) => {
  memoryStore.set(conversationId, conversation);
  return conversation;
};

const getConversation = async (conversationId = "") => {
  if (!conversationId) {
    return {
      conversationId,
      messages: [],
    };
  }

  try {
    const cachedConversation = await getCacheValue(buildConversationMemoryKey(conversationId));
    if (cachedConversation) return cachedConversation;
  } catch (error) {
    console.warn("Conversation memory Redis read skipped:", error.message);
  }

  return getMemoryConversation(conversationId);
};

const saveConversation = async (conversationId = "", conversation) => {
  if (!conversationId) return conversation;

  setMemoryConversation(conversationId, conversation);

  try {
    await setCacheValue(buildConversationMemoryKey(conversationId), conversation, {
      ttlSeconds: CONVERSATION_MEMORY_TTL_SECONDS,
    });
  } catch (error) {
    console.warn("Conversation memory Redis write skipped:", error.message);
  }

  return conversation;
};

const getConversationContext = async (conversationId = "") => {
  const conversation = await getConversation(conversationId);

  return Array.isArray(conversation.messages)
    ? conversation.messages.slice(-MAX_CONVERSATION_MESSAGES)
    : [];
};

const saveConversationMessage = async ({
  conversationId = "",
  message = "",
} = {}) => {
  const normalizedMessage = normalizeConversationMessage(message);

  if (!conversationId || !normalizedMessage) {
    return {
      conversationId,
      messages: [],
    };
  }

  const conversation = await getConversation(conversationId);
  const messages = [
    ...(Array.isArray(conversation.messages) ? conversation.messages : []),
    normalizedMessage,
  ].slice(-MAX_CONVERSATION_MESSAGES);

  return saveConversation(conversationId, {
    conversationId,
    messages,
  });
};

const shouldUseConversationContext = (message = "") => {
  const normalizedMessage = normalizeConversationMessage(message);

  return (
    normalizedMessage.length < 50 ||
    /\b(it|that|this|they|them|sponsor|office|address)\b/i.test(normalizedMessage)
  );
};

const buildContextualQuery = ({
  message = "",
  context = [],
} = {}) => {
  const normalizedMessage = normalizeConversationMessage(message);
  const recentContext = Array.isArray(context)
    ? context.map(normalizeConversationMessage).filter(Boolean)
    : [];

  if (!recentContext.length || !shouldUseConversationContext(normalizedMessage)) {
    return normalizedMessage;
  }

  return [...recentContext, normalizedMessage].join(" ");
};

export {
  MAX_CONVERSATION_MESSAGES,
  buildContextualQuery,
  getConversationContext,
  saveConversationMessage,
  shouldUseConversationContext,
};
