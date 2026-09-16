import { ReactNative } from "@vendetta/metro/common";
import { Forms } from "@vendetta/ui/components";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";

const { FormDivider, FormInput, FormRow } = Forms;
const { ScrollView, View, Text, TouchableOpacity } = ReactNative;

export default () => {
    useProxy(storage);

    if (!Array.isArray(storage.overrides)) {
        storage.overrides = [];
    }

    const addOverride = () => {
        storage.overrides = [...storage.overrides, { userId: "", url: "" }];
    };

    const removeOverride = (index: number) => {
        storage.overrides = storage.overrides.filter((_, i) => i !== index);
    };

    const updateOverride = (index: number, key: "userId" | "url", value: string) => {
        storage.overrides = storage.overrides.map((entry, i) =>
            i === index ? { ...entry, [key]: value } : entry
        );
    };

    return (
        <ScrollView>
            <FormRow label="Avatar Overrides" />
            <FormRow
                label="Add one row per user you want to override."
                subLabel="Leave a row blank to ignore it."
            />
            <FormDivider />

            {storage.overrides.map((entry, index) => (
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
