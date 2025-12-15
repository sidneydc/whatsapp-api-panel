import { CREDENTIALS } from "../Defaults/index.js";

export const setCredentialsDir = (dirname: string = "wa_credentials") => {
  CREDENTIALS.DIR_NAME = dirname;
};
