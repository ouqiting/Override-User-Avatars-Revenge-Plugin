import { findByProps, findByStoreName } from "@vendetta/metro";
import { FluxDispatcher } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";

// tag added to all print statements to help with debugging with logcat on adb
const TAG = "[custom-avatars]";

let patches = [];

export { default as settings } from "./settings";

// read the current overrides straight from storage so newly added
// users apply without needing to reload the plugin.
function currentOverrides(): Record<string, string> {
    const overrides: Record<string, string> = {};

    if (Array.isArray(storage.overrides)) {
        for (const entry of storage.overrides) {
            const id = typeof entry?.userId === "string"
                ? entry.userId.trim()
                : entry?.userId != null ? String(entry.userId).trim() : "";
            const url = typeof entry?.url === "string" ? entry.url.trim() : "";

            if (id && url) {
                overrides[id] = url;
            }
        }
    } else if (storage.overrides && typeof storage.overrides === "object") {
        // tolerate a { userId: url } map too
        for (const [id, value] of Object.entries(storage.overrides)) {
            if (id && typeof value === "string" && value) {
                overrides[id.trim()] = value.trim();
            }
        }
    }

    // backward compatibility with the old single-user settings
    if (storage.targetUserId && storage.imageUrl) {
        overrides[String(storage.targetUserId).trim()] = String(storage.imageUrl).trim();
    }

    return overrides;
}

function idOf(user: unknown): string | undefined {
    if (typeof user === "string") return user;
    const id = (user as any)?.id;
    return id != null ? String(id) : undefined;
}

function urlFor(user: unknown): string | undefined {
    const id = idOf(user);
    if (!id) return undefined;
    return currentOverrides()[id];
}

export function onLoad(): void {
    console.log(`${TAG} loaded`);

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

    console.log(`${TAG} overrides:`, JSON.stringify(currentOverrides()));

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
        for (const id of Object.keys(currentOverrides())) {
            const user = UserStore.getUser(id);
            if (user) {
                FluxDispatcher.dispatch({ type: "USER_UPDATE", user });
            }
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
