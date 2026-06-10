CREATE INDEX IF NOT EXISTS "ChatMessage_conversationId_senderId_createdAt_idx"
ON "ChatMessage"("conversationId", "senderId", "createdAt");
