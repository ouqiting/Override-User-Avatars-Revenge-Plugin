import { findByProps, findByStoreName } from "@vendetta/metro";
import { FluxDispatcher } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";

// tag added to all print statements to help with debugging with logcat on adb
const TAG = "[custom-avatars]";

let patches = [];

// remember the real avatar hash of any user we touch so we can restore it on unload
const originalAvatars = new Map<string, any>();

export { default as settings } from "./settings";

function buildOverrides(): Record<string, string> {
    const overrides: Record<string, string> = {};

    if (Array.isArray(storage.overrides)) {
        for (const entry of storage.overrides) {
            const id = entry?.userId != null ? String(entry.userId).trim() : "";
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

// rebuild only when storage actually changed (settings replaces the array on every edit)
let cachedOverrides: Record<string, string> = {};
let cacheKey: any[] = [];
function currentOverrides(): Record<string, string> {
    if (
        cacheKey[0] !== storage.overrides ||
        cacheKey[1] !== storage.targetUserId ||
        cacheKey[2] !== storage.imageUrl
    ) {
        cacheKey = [storage.overrides, storage.targetUserId, storage.imageUrl];
        cachedOverrides = buildOverrides();
    }
    return cachedOverrides;
}

function idOf(user: any): string | undefined {
    if (typeof user === "string") return user;
    if (!user) return undefined;
    const id = user.userId ?? user.id ?? user.user?.id;
    return id != null ? String(id) : undefined;
}

function urlFor(user: any): string | undefined {
    const id = idOf(user);
    if (!id) return undefined;
    return currentOverrides()[id];
}

function patchFn(obj: any, name: string, make: (original: Function) => Function) {
    const original = obj?.[name];
    if (typeof original !== "function") return;

    obj[name] = make(original);
    patches.push(() => { obj[name] = original; });
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

    // ---- user level avatars (DMs, group chats, profile, voice, embeds) ----

    patchFn(avatarModule, "getUserAvatarSource", (original) => function (...args) {
        const url = urlFor(args[0]);
        if (url) return { uri: url };
        return original.apply(this, args);
    });

    patchFn(avatarModule, "getUserAvatarURL", (original) => function (...args) {
        const url = urlFor(args[0]);
        if (url) return url;
        return original.apply(this, args);
    });

    // ---- guild member avatars (messages inside servers) ----

    patchFn(avatarModule, "getGuildMemberAvatarSource", (original) => function (...args) {
        const url = urlFor(args[0]);
        if (url) return { uri: url };
        return original.apply(this, args);
    });

    patchFn(avatarModule, "getGuildMemberAvatarURL", (original) => function (...args) {
        const url = urlFor(args[0]);
        if (url) return url;
        return original.apply(this, args);
    });

    patchFn(avatarModule, "getGuildMemberAvatarURLSimple", (original) => function (...args) {
        const url = urlFor(args[0]);
        if (url) return url;
        return original.apply(this, args);
    });

    // ---- force caches/memos keyed on user.avatar to refresh ----
    // Discord components often memoise the avatar source, so changing the
    // underlying avatar hash makes them recompute and pick up our override.
    patchFn(UserStore, "getUser", (original) => function (...args) {
        const user = original.apply(this, args);

        try {
            if (user?.id != null) {
                const id = String(user.id);
                const url = currentOverrides()[id];

                if (url) {
                    if (!originalAvatars.has(id)) originalAvatars.set(id, user.avatar);
                    if (user.avatar !== url) user.avatar = url;
                } else if (originalAvatars.has(id)) {
                    user.avatar = originalAvatars.get(id);
                    originalAvatars.delete(id);
                }
            }
        } catch (e) {
            // never let a lookup blow up the client
        }

        return user;
    });

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

    // restore any avatar hashes we changed
    try {
        const UserStore = findByStoreName("UserStore");
        for (const [id, avatar] of originalAvatars) {
            const user = UserStore?.getUser(id);
            if (user) user.avatar = avatar;
        }
    } catch (e) {
        console.log(`${TAG} could not restore avatars:`, e.message);
    }
    originalAvatars.clear();

    console.log(`${TAG} unloaded`);
}
