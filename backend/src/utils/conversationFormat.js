export const CONVERSATION_POPULATE = [
  { path: "participants.userId", select: "displayName avatarUrl" },
  { path: "seenBy", select: "displayName avatarUrl" },
  { path: "lastMessage.senderId", select: "displayName avatarUrl" },
];

/**
 * Chuẩn hoá conversation (đã populate) về dạng frontend dùng:
 * participants là danh sách user phẳng thay vì { userId: {...} }.
 */
export const formatConversation = (conversation) => {
  const participants = (conversation.participants || []).map((p) => ({
    _id: p.userId?._id,
    displayName: p.userId?.displayName,
    avatarUrl: p.userId?.avatarUrl ?? null,
    joinedAt: p.joinedAt,
  }));

  // flattenMaps: unreadCounts là Map; Map thường khi JSON.stringify sẽ thành {}
  const obj = conversation.toObject({ flattenMaps: true });
  delete obj.directKey;

  return {
    ...obj,
    unreadCounts: obj.unreadCounts || {},
    participants,
  };
};

export const populateAndFormat = async (conversation) => {
  await conversation.populate(CONVERSATION_POPULATE);
  return formatConversation(conversation);
};
