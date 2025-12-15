import { WhatsappError } from "../Error/index.js";
import { getSession } from "../Socket/index.js";
import { SendMessageTypes } from "../Types/index.js";
import { phoneToJid } from "./phone-to-jid.js";

export const isExist = async ({
  sessionId,
  to,
  isGroup = false,
}: SendMessageTypes): Promise<boolean> => {
  try {
    const session = getSession(sessionId);
    if (!session) throw new WhatsappError("Session ID Not Found!");
    const receiver = phoneToJid({
      to: to,
      isGroup: isGroup,
    });
    if (!isGroup) {
      const one = Boolean((await session?.onWhatsApp(receiver))?.[0]?.exists);
      return one;
    } else {
      return Boolean((await session.groupMetadata(receiver)).id);
    }
  } catch (error) {
    throw error;
  }
};
