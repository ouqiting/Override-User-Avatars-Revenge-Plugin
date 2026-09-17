import { findByStoreName } from "@vendetta/metro";
import { ReactNative, FluxDispatcher } from "@vendetta/metro/common";
import { Forms } from "@vendetta/ui/components";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";

const { FormDivider, FormInput, FormRow } = Forms;
const { ScrollView, View, Text, TouchableOpacity } = ReactNative;

let notifyTimer: any;

// nudge Discord to re-render the avatars of every overridden user
function notifyChanged() {
    clearTimeout(notifyTimer);
    notifyTimer = setTimeout(() => {
        try {
            const UserStore = findByStoreName("UserStore");
            const list = Array.isArray(storage.overrides) ? storage.overrides : [];

            for (const entry of list) {
                const id = entry?.userId?.trim?.();
                if (!id) continue;

                const user = UserStore?.getUser(id);
                if (user) FluxDispatcher.dispatch({ type: "USER_UPDATE", user });
            }
        } catch (e) {
            console.log("[custom-avatars] refresh failed:", e?.message);
        }
    }, 300);
}

export default () => {
    useProxy(storage);

    if (!Array.isArray(storage.overrides)) {
        storage.overrides = [];
    }

    const entries = storage.overrides;

    // always read the latest array at call time so rapid edits don't use a stale snapshot
    const current = () => (Array.isArray(storage.overrides) ? storage.overrides : []);

    const addOverride = () => {
        storage.overrides = [...current(), { userId: "", url: "" }];
    };

    const removeOverride = (index: number) => {
        storage.overrides = current().filter((_, i) => i !== index);
        notifyChanged();
    };

    const updateOverride = (index: number, key: "userId" | "url", value: string) => {
        storage.overrides = current().map((entry, i) =>
            i === index
                ? { userId: entry.userId || "", url: entry.url || "", [key]: value }
                : { userId: entry.userId || "", url: entry.url || "" }
        );
        notifyChanged();
    };

    return (
        <ScrollView>
            <FormRow label="Avatar Overrides" />
            <FormRow
                label="Add one row per user you want to override."
                subLabel="Leave a row blank to ignore it."
            />
            <FormDivider />

            {entries.map((entry, index) => (
                <View key={index}>
                    <FormRow label={`User ${index + 1}`} />
                    <FormInput
                        placeholder="Enter Target User ID"
                        value={entry.userId || ""}
                        onChange={(v) => updateOverride(index, "userId", v)}
                    />
                    <FormInput
                        placeholder="Enter image URL"
                        value={entry.url || ""}
                        onChange={(v) => updateOverride(index, "url", v)}
                    />
                    <TouchableOpacity onPress={() => removeOverride(index)}>
                        <Text
                            style={{
                                color: "#f04747",
                                textAlign: "center",
                                paddingVertical: 12,
                                fontWeight: "600",
                            }}
                        >
                            Remove
                        </Text>
                    </TouchableOpacity>
                    <FormDivider />
                </View>
            ))}

            <TouchableOpacity onPress={addOverride}>
                <Text
                    style={{
                        color: "#5865f2",
                        textAlign: "center",
                        paddingVertical: 16,
                        fontWeight: "600",
                    }}
                >
                    + Add User
                </Text>
            </TouchableOpacity>
        </ScrollView>
    );
};
