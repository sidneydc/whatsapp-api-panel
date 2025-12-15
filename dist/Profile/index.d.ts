import { GetProfileInfoProps } from "../Types/profile.js";
/**
 * Get profile information of a target (people or group)
 */
export declare const getProfileInfo: (props: GetProfileInfoProps) => Promise<{
    profilePictureUrl: string | null;
    status: import("@whiskeysockets/baileys").USyncQueryResultList[] | null;
}>;
//# sourceMappingURL=index.d.ts.map