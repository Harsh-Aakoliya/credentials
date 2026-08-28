import {
  Text,
  View,
  TextInput,
  ScrollView,
  Pressable,
  Alert,
  Modal,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
  Keyboard,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CredentialStorage, Credential, AddCredential } from "@/utils/Storage";
import { useEffect, useMemo, useRef, useState } from "react";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ---- Vault design tokens -----------------------------------------------
const colors = {
  bg: "#0F1419",
  surface: "#161E27",
  surfaceRaised: "#1E2733",
  border: "#28323F",
  textPrimary: "#EDF2F7",
  textSecondary: "#8B98A9",
  textTertiary: "#5A6675",
  accent: "#4FD1C5",
  accentDim: "rgba(79, 209, 197, 0.14)",
  danger: "#E8677A",
  dangerDim: "rgba(232, 103, 122, 0.14)",
  gold: "#D9A94F",
};

const mono = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

// ---- Toast (cross-platform, replaces ToastAndroid) ----------------------
function useToast(bottomOffset: number = 0) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(false);

  const show = (msg: string) => {
    setMessage(msg);
    setVisible(true);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 160, useNativeDriver: true }),
    ]).start(() => {
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 12, duration: 220, useNativeDriver: true }),
        ]).start(() => setVisible(false));
      }, 1200);
    });
  };

  const ToastView = visible ? (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.toast,
        { bottom: 28 + bottomOffset, opacity, transform: [{ translateY }] },
      ]}
    >
      <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  ) : null;

  return { show, ToastView };
}

export default function Index() {
  const insets = useSafeAreaInsets();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [formKey, setFormKey] = useState<string>("");
  const [formValue, setFormValue] = useState<string>("");
  const [formCategory, setFormCategory] = useState<string>("");
  const [formValueVisible, setFormValueVisible] = useState<boolean>(false);

  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [revealedId, setRevealedId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const { show: showToast, ToastView } = useToast(insets.bottom);

  // Robust keyboard tracking: driven directly by Keyboard events rather than
  // KeyboardAvoidingView, which measures layout unreliably inside a Modal
  // (the modal renders in its own native hierarchy), causing a visible gap
  // between the keyboard and the sheet.
  const keyboardOffset = useRef(new Animated.Value(0)).current;
  const [keyboardHeight, setKeyboardHeight] = useState<number>(0);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (e) => {
      const height = e.endCoordinates?.height ?? 0;
      setKeyboardHeight(height);
      Animated.timing(keyboardOffset, {
        toValue: height,
        duration: Platform.OS === "ios" ? e.duration || 250 : 220,
        useNativeDriver: false,
      }).start();
    });

    const hideSub = Keyboard.addListener(hideEvent, (e) => {
      setKeyboardHeight(0);
      Animated.timing(keyboardOffset, {
        toValue: 0,
        duration: Platform.OS === "ios" ? e.duration || 250 : 220,
        useNativeDriver: false,
      }).start();
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardOffset]);

  useEffect(() => {
    const fetchCredentials = async () => {
      setLoading(true);
      const fetched: Credential[] = await CredentialStorage.getAll();
      setCredentials(fetched);
      setLoading(false);
    };
    fetchCredentials();
  }, []);

  const existingCategories = useMemo(
    () => Array.from(new Set(credentials.map((c) => c.category))).filter(Boolean),
    [credentials]
  );

  const filteredCredential: Record<string, Credential[]> = useMemo(() => {
    return credentials
      .filter((credential: Credential) =>
        (credential.key + credential.value + credential.category)
          .toLocaleLowerCase()
          .includes(searchQuery.toLocaleLowerCase())
      )
      .reduce((group: Record<string, Credential[]>, credential: Credential) => {
        const category = credential.category;
        if (group[category] == null) group[category] = [];
        group[category].push(credential);
        return group;
      }, {} as Record<string, Credential[]>);
  }, [credentials, searchQuery]);

  const totalMatches = Object.values(filteredCredential).reduce((n, arr) => n + arr.length, 0);

  const resetForm = () => {
    setFormKey("");
    setFormValue("");
    setFormCategory("");
    setFormValueVisible(false);
    setEditingId(null);
  };

  const openAddModal = () => {
    resetForm();
    setModalVisible(true);
  };

  const openEditModal = (credential: Credential) => {
    setFormKey(credential.key);
    setFormValue(credential.value);
    setFormCategory(credential.category);
    setFormValueVisible(false);
    setEditingId(credential.id);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    resetForm();
  };

  const handleSubmit = async () => {
    const key = formKey.trim();
    const value = formValue.trim();
    const category = formCategory.trim();

    if (!key || !value || !category) {
      Alert.alert("Missing info", "Fill in the label, value, and category before saving.");
      return;
    }

    if (editingId) {
      const updatedCredentials: Credential[] = await CredentialStorage.update({
        id: editingId,
        key,
        value,
        category,
      });
      setCredentials(updatedCredentials);
      showToast("Credential updated");
    } else {
      const toAdd: AddCredential = { key, value, category };
      const updatedCredentials: Credential[] = await CredentialStorage.add(toAdd);
      setCredentials(updatedCredentials);
      showToast("Credential saved");
    }
    closeModal();
  };

  const handleDeleteCredential = (id: string, label: string) => {
    Alert.alert("Delete credential", `"${label}" will be permanently removed.`, [
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const updatedCredentials: Credential[] = await CredentialStorage.deleteById(id);
          setCredentials(updatedCredentials);
          showToast("Credential deleted");
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const handleCopyToClipboard = async (text: string, label: string) => {
    await Clipboard.setStringAsync(text);
    showToast(`${label} copied`);
  };

  const toggleReveal = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setRevealedId((current) => (current === id ? "" : id));
  };

  const toggleCategory = (category: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsedCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="lock-closed" size={20} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Vault</Text>
          <Text style={styles.headerSubtitle}>
            {loading
              ? "Loading…"
              : `${credentials.length} credential${credentials.length === 1 ? "" : "s"} · ${existingCategories.length} ${existingCategories.length === 1 ? "category" : "categories"}`}
          </Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color={colors.textTertiary} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search credentials"
          placeholderTextColor={colors.textTertiary}
          style={styles.searchInput}
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
          </Pressable>
        )}
      </View>

      {/* List */}
      <ScrollView
        contentContainerStyle={[styles.listContent, { paddingBottom: 40 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        {!loading && credentials.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="shield-outline" size={32} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>Your vault is empty</Text>
            <Text style={styles.emptySubtitle}>
              Add your first credential to start keeping it somewhere safe.
            </Text>
            <Pressable style={styles.emptyCta} onPress={openAddModal}>
              <Text style={styles.emptyCtaText}>Add credential</Text>
            </Pressable>
          </View>
        )}

        {!loading && credentials.length > 0 && totalMatches === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="search" size={28} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>No matches</Text>
            <Text style={styles.emptySubtitle}>
              Nothing matches "{searchQuery}". Try a different term.
            </Text>
          </View>
        )}

        {Object.entries(filteredCredential).map(([category, items]: [string, Credential[]]) => {
          const isCollapsed = collapsedCategories.has(category);
          return (
            <View key={category} style={styles.categoryCard}>
              <Pressable style={styles.categoryHeader} onPress={() => toggleCategory(category)}>
                <Ionicons
                  name={isCollapsed ? "chevron-forward" : "chevron-down"}
                  size={16}
                  color={colors.textSecondary}
                />
                <Text style={styles.categoryTitle}>{category}</Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{items.length}</Text>
                </View>
              </Pressable>

              {!isCollapsed &&
                items.map((credential) => {
                  const revealed = revealedId === credential.id;
                  return (
                    <View key={credential.id} style={styles.row}>
                      <Pressable
                        style={styles.rowMain}
                        onPress={() => handleCopyToClipboard(credential.key, "Label")}
                      >
                        <Text style={styles.rowKey}>{credential.key}</Text>
                        <Pressable
                          style={styles.valueTouch}
                          onPress={() =>
                            handleCopyToClipboard(
                              revealed ? credential.value : credential.value,
                              "Value"
                            )
                          }
                        >
                          <Text style={styles.rowValue}>
                            {revealed ? credential.value : "•".repeat(Math.min(credential.value.length, 12) || 8)}
                          </Text>
                        </Pressable>
                      </Pressable>

                      <View style={styles.rowActions}>
                        <Pressable
                          style={styles.iconButton}
                          onPress={() => toggleReveal(credential.id)}
                          hitSlop={6}
                        >
                          <Ionicons
                            name={revealed ? "eye-off-outline" : "eye-outline"}
                            size={17}
                            color={colors.textSecondary}
                          />
                        </Pressable>
                        <Pressable
                          style={styles.iconButton}
                          onPress={() => handleCopyToClipboard(credential.value, "Value")}
                          hitSlop={6}
                        >
                          <Ionicons name="copy-outline" size={17} color={colors.textSecondary} />
                        </Pressable>
                        <Pressable
                          style={styles.iconButton}
                          onPress={() => openEditModal(credential)}
                          hitSlop={6}
                        >
                          <Ionicons name="create-outline" size={17} color={colors.accent} />
                        </Pressable>
                        <Pressable
                          style={styles.iconButton}
                          onPress={() => handleDeleteCredential(credential.id, credential.key)}
                          hitSlop={6}
                        >
                          <Ionicons name="trash-outline" size={17} color={colors.danger} />
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
            </View>
          );
        })}
      </ScrollView>

      {/* Floating add button */}
      <Pressable
        style={({ pressed }) => [
          styles.fab,
          { bottom: 24 + insets.bottom, transform: [{ scale: pressed ? 0.94 : 1 }] },
        ]}
        onPress={openAddModal}
        hitSlop={8}
      >
        <Ionicons name="add" size={26} color={colors.bg} />
      </Pressable>

      {/* Add / edit modal */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={closeModal}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeModal} />
          <Animated.View
            style={[
              styles.modalCard,
              {
                maxHeight: "86%",
                marginBottom: keyboardOffset,
                paddingBottom: keyboardHeight > 0 ? 16 : 20 + insets.bottom,
              },
            ]}
          >
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>
              {editingId ? "Edit credential" : "Add credential"}
            </Text>

            <ScrollView
              style={{ flexShrink: 1 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
            <Text style={styles.fieldLabel}>Label</Text>
            <TextInput
              value={formKey}
              onChangeText={setFormKey}
              placeholder="e.g. SBI net banking"
              placeholderTextColor={colors.textTertiary}
              style={styles.fieldInput}
            />

            <Text style={styles.fieldLabel}>Value</Text>
            <View style={styles.fieldValueRow}>
              <TextInput
                value={formValue}
                onChangeText={setFormValue}
                placeholder="Password, PIN, or key"
                placeholderTextColor={colors.textTertiary}
                secureTextEntry={!formValueVisible}
                style={[styles.fieldInput, { flex: 1, fontFamily: mono, marginBottom: 0 }]}
              />
              <Pressable
                style={styles.fieldValueToggle}
                onPress={() => setFormValueVisible((v) => !v)}
                hitSlop={8}
              >
                <Ionicons
                  name={formValueVisible ? "eye-off-outline" : "eye-outline"}
                  size={18}
                  color={colors.textSecondary}
                />
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>Category</Text>
            <TextInput
              value={formCategory}
              onChangeText={setFormCategory}
              placeholder="e.g. Banking"
              placeholderTextColor={colors.textTertiary}
              style={styles.fieldInput}
            />

            {existingCategories.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                {existingCategories.map((cat) => (
                  <Pressable
                    key={cat}
                    style={[styles.chip, formCategory === cat && styles.chipActive]}
                    onPress={() => setFormCategory(cat)}
                  >
                    <Text
                      style={[styles.chipText, formCategory === cat && styles.chipTextActive]}
                    >
                      {cat}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable style={styles.secondaryButton} onPress={closeModal}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.primaryButton} onPress={handleSubmit}>
                <Text style={styles.primaryButtonText}>
                  {editingId ? "Save changes" : "Save credential"}
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </Modal>

      {ToastView}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 12,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.accentDim,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  headerSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  fab: {
    position: "absolute",
    right: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 14,
    paddingHorizontal: 14,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
  },

  listContent: { paddingHorizontal: 20, paddingBottom: 40 },

  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 8,
  },
  emptyTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "600", marginTop: 4 },
  emptySubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: "center",
    maxWidth: 260,
  },
  emptyCta: {
    marginTop: 10,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: colors.accent,
  },
  emptyCtaText: { color: colors.bg, fontWeight: "700", fontSize: 13 },

  categoryCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
    overflow: "hidden",
  },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  categoryTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  countBadge: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countBadgeText: { color: colors.textSecondary, fontSize: 11, fontWeight: "600" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowMain: { flex: 1, gap: 3 },
  rowKey: { color: colors.textPrimary, fontSize: 14, fontWeight: "600" },
  valueTouch: { alignSelf: "flex-start" },
  rowValue: {
    color: colors.textSecondary,
    fontSize: 13,
    fontFamily: mono,
    letterSpacing: 1,
  },
  rowActions: { flexDirection: "row", gap: 4 },
  iconButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(6, 9, 12, 0.6)",
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: 14,
  },
  modalTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 16,
  },
  fieldLabel: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 6,
    marginTop: 12,
  },
  fieldInput: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 14,
  },
  fieldValueRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  fieldValueToggle: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },

  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
  },
  chipActive: { backgroundColor: colors.accentDim, borderColor: colors.accent },
  chipText: { color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: colors.accent },

  modalActions: { flexDirection: "row", gap: 10, marginTop: 22 },
  secondaryButton: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: { color: colors.textSecondary, fontWeight: "600", fontSize: 14 },
  primaryButton: {
    flex: 1.4,
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: { color: colors.bg, fontWeight: "700", fontSize: 14 },

  toast: {
    position: "absolute",
    bottom: 28,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  toastText: { color: colors.textPrimary, fontSize: 13, fontWeight: "500" },
});