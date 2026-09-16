import { findByProps, findByStoreName } from "@vendetta/metro";
import { FluxDispatcher } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";

// tag added to all print statements to help with debugging with logcat on adb
const TAG = "[custom-avatars]";

let patches = [];

export { default as settings } from "./settings";

// build a { userId: imageUrl } map from storage.
// supports the new multi-user list as well as the old single-user fields.
function buildOverrides(): Record<string, string> {
    const overrides: Record<string, string> = {};

    if (Array.isArray(storage.overrides)) {
        for (const entry of storage.overrides) {
            if (entry?.userId && entry?.url) {
                overrides[entry.userId] = entry.url;
            }
        }
    }

    // backward compatibility with the old single-user settings
    if (storage.targetUserId && storage.imageUrl) {
        overrides[storage.targetUserId] = storage.imageUrl;
    }

    return overrides;
}

export function onLoad(): void {
    console.log(`${TAG} loaded`);

    const OVERRIDES = buildOverrides();

    const UserStore = findByStoreName("UserStore");
    if (!UserStore) {
        console.log(`${TAG} userStore not found`);
        return;
    }

    const avatarModule = findByProps("getUserAvatarURL");
    if (!avatarModule) {
        console.log(`${TAG} avatar module not found`);
        return;
    }

    const urlFor = (user) => (user?.id ? OVERRIDES[user.id] : undefined);

    // patch getUserAvatarSource, overrides avatar in DMs and group chats
    if (avatarModule.getUserAvatarSource) {
        const originalGetUserAvatarSource = avatarModule.getUserAvatarSource;
        avatarModule.getUserAvatarSource = function (...args) {
            const url = urlFor(args[0]);

            // only intercept users that have an override
            if (url) {
                const original = originalGetUserAvatarSource.apply(this, args);
                if (original) {
                    return {
                        ...original,
                        uri: url
                    };
                }
            }
            // ignore everyone else
            return originalGetUserAvatarSource.apply(this, args);
        };
        patches.push(() => { avatarModule.getUserAvatarSource = originalGetUserAvatarSource; });
    }

    // patch getUserAvatarURL, overrides avatar in voice calls
    const originalGetUserAvatarURL = avatarModule.getUserAvatarURL;
    avatarModule.getUserAvatarURL = function (...args) {
        const url = urlFor(args[0]);
        // only intercept users that have an override
        if (url) {
            return url;
        }
        // ignore other users
        return originalGetUserAvatarURL.apply(this, args);
    };
    patches.push(() => { avatarModule.getUserAvatarURL = originalGetUserAvatarURL; });

    console.log(`${TAG} patches applied`);

    // refresh ui for every overridden user
    try {
        for (const id of Object.keys(OVERRIDES)) {
            FluxDispatcher.dispatch({
                type: "USER_UPDATE",
                user: UserStore.getUser(id)
            });
        }
        console.log(`${TAG} ui refreshed`);
    } catch (e) {
        console.log(`${TAG} could not trigger refresh:`, e.message);
    }
}

export function onUnload(): void {
    console.log(`${TAG} unloading...`);

    // restore patches
    patches.forEach(unpatch => unpatch());
    patches = [];

    console.log(`${TAG} unloaded`);
}