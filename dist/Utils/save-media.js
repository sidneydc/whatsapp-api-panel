import { downloadMediaMessage } from "@whiskeysockets/baileys";
import ValidationError from "./error.js";
import fs from "fs/promises";
const saveMedia = async (path, data) => {
    await fs.writeFile(path, data.toString("base64"), "base64");
};
export const saveImageHandler = async (msg, path) => {
    if (!msg.message?.imageMessage)
        throw new ValidationError("Message is not contain Image");
    const buf = await downloadMediaMessage(msg, "buffer", {});
    return saveMedia(path, buf);
};
export const saveVideoHandler = async (msg, path) => {
    if (!msg.message?.videoMessage)
        throw new ValidationError("Message is not contain Video");
    const buf = await downloadMediaMessage(msg, "buffer", {});
    return saveMedia(path, buf);
};
export const saveDocumentHandler = async (msg, path) => {
    if (!msg.message?.documentMessage)
        throw new ValidationError("Message is not contain Document");
    const buf = await downloadMediaMessage(msg, "buffer", {});
    const ext = msg.message.documentMessage.fileName?.split(".").pop();
    path += "." + ext;
    return saveMedia(path, buf);
};
export const saveAudioHandler = async (msg, path) => {
    if (!msg.message?.audioMessage)
        throw new ValidationError("Message is not contain Audio");
    const buf = await downloadMediaMessage(msg, "buffer", {});
    return saveMedia(path, buf);
};
//# sourceMappingURL=save-media.js.map