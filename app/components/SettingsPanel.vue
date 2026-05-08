<script setup>
import { onMounted, ref, watch, computed } from "vue";
import { navigateTo } from "#app";
import { useSettings } from "@/composables/useSettings";
import { useDark, useToggle } from "@vueuse/core";
import { SwitchRoot, SwitchThumb } from "reka-ui";
import { Icon } from "@iconify/vue";
import { loadNotebook } from "@/composables/notebook";

// Define props and emits
const props = defineProps(["isOpen", "initialTab"]);
const emit = defineEmits(["reloadSettings", "close"]);

// --- Reactive State Variables ---
const settingsManager = useSettings();
const currTab = ref("general");
const isDark = useDark();
const toggleDark = useToggle(isDark);
const globalMemoryEnabled = ref(false);
const gptOssLimitTables = ref(false);
const notebookMetadata = ref(null);
const isMac = ref(false);

// User profile fields
const userName = ref("");
const occupation = ref("");
const customInstructions = ref("");

// API key fields
const customApiKey = ref("");
const showApiKey = ref(false);

// --- Constants for Navigation ---
const navItems = [
  {
    key: "general",
    label: "General",
    icon: "material-symbols:settings"
  },
  {
    key: "customization",
    label: "Customization",
    icon: "material-symbols:palette"
  },
  {
    key: "usage",
    label: "Usage",
    icon: "material-symbols:data-usage"
  },
  {
    key: "notebook",
    label: "Notebook",
    icon: "material-symbols:book"
  },
  {
    key: "keybinds",
    label: "Keybinds",
    icon: "material-symbols:keyboard"
  },
  {
    key: "about",
    label: "About",
    icon: "material-symbols:info"
  }
];

// --- Usage Tab State ---
const BUDGET_USD = 0.50;
const CHART_CIRCUMFERENCE = 2 * Math.PI * 54; // r=54

const usageLoading = ref(false);
const usageResetAt = ref(null);
const usageUnauthenticated = ref(false);
const usageSpend = ref(0);
const usageTotalTokens = ref(0);

const usagePercentage = computed(() => Math.min(100, (usageSpend.value / BUDGET_USD) * 100));

const budgetArcColor = computed(() => {
  const pct = usagePercentage.value;
  if (pct > 80) return '#ef4444';
  if (pct > 60) return '#f59e0b';
  return 'url(#budgetGradient)';
});

const resetTimeLocal = computed(() => {
  if (!usageResetAt.value) return null;
  const d = new Date(usageResetAt.value);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
});

async function loadUsageData() {
  usageLoading.value = true;
  try {
    const resp = await fetch('/api/usage');
    if (resp.ok) {
      const data = await resp.json();
      usageUnauthenticated.value = data.unauthenticated || false;
      usageSpend.value = data.totalSpend || 0;
      usageTotalTokens.value = data.totalTokens || 0;
      usageResetAt.value = data.resetAt || null;
    }
  } catch (e) {
    console.error('Failed to load usage data:', e);
  } finally {
    usageLoading.value = false;
  }
}

watch(
  () => currTab.value,
  (tab) => {
    if (tab === 'usage') loadUsageData();
  }
);

// --- Lifecycle Hooks ---
onMounted(async () => {
  await settingsManager.loadSettings();
  console.log("Loaded settings:", settingsManager.settings);
  userName.value = settingsManager.settings.user_name || "";
  occupation.value = settingsManager.settings.occupation || "";
  customInstructions.value = settingsManager.settings.custom_instructions || "";
  globalMemoryEnabled.value = settingsManager.settings.notebook_memory_enabled === true;
  gptOssLimitTables.value = settingsManager.settings.gpt_oss_limit_tables === true;
  customApiKey.value = settingsManager.settings.custom_api_key || "";

  // Load notebook metadata
  await loadNotebookData();

  // Detect platform
  if (typeof window !== "undefined") {
    isMac.value = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  }
});

watch(
  () => props.isOpen,
  (newVal) => {
    if (newVal) {
      currTab.value = props.initialTab || "general";
    }
  }
);

watch(globalMemoryEnabled, (newVal) => {
  console.log("globalMemoryEnabled changed to:", newVal);
});

// --- Functions ---
async function loadNotebookData() {
  const notebook = await loadNotebook();
  notebookMetadata.value = notebook.metadata;
}

function closeSettings() {
  emit("close");
}

function toggleGlobalMemory(val) {
  console.log("Toggling global memory from", globalMemoryEnabled.value, "to", val);
  globalMemoryEnabled.value = val;
}

async function saveSettings() {
  // Save settings logic
  settingsManager.setSetting("user_name", userName.value);
  settingsManager.setSetting("occupation", occupation.value);
  settingsManager.setSetting("custom_instructions", customInstructions.value);
  settingsManager.setSetting("notebook_memory_enabled", globalMemoryEnabled.value);
  settingsManager.setSetting("gpt_oss_limit_tables", gptOssLimitTables.value);
  settingsManager.setSetting("custom_api_key", customApiKey.value.trim());

  console.log("Saving settings:", {
    user_name: userName.value,
    occupation: occupation.value,
    custom_instructions: customInstructions.value,
    notebook_memory_enabled: globalMemoryEnabled.value,
    gpt_oss_limit_tables: gptOssLimitTables.value,
    has_custom_api_key: !!customApiKey.value.trim()
  });

  // Save settings and wait for completion before reloading
  await settingsManager.saveSettings();

  // Reload notebook data after saving settings
  await loadNotebookData();

  // Close settings and refresh the page
  closeSettings();

  // Small delay to ensure all async operations complete before reload
  setTimeout(() => {
    location.reload();
  }, 100);
}

function openNotebook() {
  closeSettings();
  navigateTo('/notebook');
}
</script>

<template>
  <div class="settings-overlay" v-if="isOpen" @click.self="closeSettings">
    <div class="settings-panel">
      <!-- Header -->
      <div class="panel-header">
        <div class="header-content">
          <h1 class="panel-title">Settings</h1>
        </div>
        <button class="close-btn" @click="closeSettings" aria-label="Close settings">
          <Icon icon="material-symbols:close" width="20" height="20" />
        </button>
      </div>

      <div class="panel-content-wrapper">
        <!-- Vertical Navigation -->
        <div class="settings-nav">
          <div class="nav-items">
            <div v-for="item in navItems" :key="item.key" class="nav-item">
              <button class="nav-link" :class="{ active: currTab === item.key }" @click="currTab = item.key">
                <Icon :icon="item.icon" width="24" height="24" />
                <span class="nav-label">{{ item.label }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Content Area -->
        <div class="panel-content">
          <!-- General Tab -->
          <div v-show="currTab === 'general'" class="settings-section">
            <div class="settings-content">
              <div class="content-header">
                <h2>General Settings</h2>
                <p>Basic configuration options</p>
              </div>
              <div class="setting-item">
                <div class="setting-info">
                  <h3>Dark Mode</h3>
                  <p>Toggle between light and dark themes</p>
                </div>
                <div class="switch-container">
                  <SwitchRoot class="switch-root" :modelValue="isDark" @update:modelValue="toggleDark()">
                    <SwitchThumb class="switch-thumb" />
                  </SwitchRoot>
                </div>
              </div>
              <div class="setting-item">
                <div class="setting-info">
                  <h3>Limit Tables for GPT-OSS</h3>
                  <p>When using GPT-OSS models (20B or 120B), limit table usage as much as possible</p>
                </div>
                <div class="switch-container">
                  <SwitchRoot class="switch-root" :modelValue="gptOssLimitTables" @update:modelValue="gptOssLimitTables = $event">
                    <SwitchThumb class="switch-thumb" />
                  </SwitchRoot>
                </div>
              </div>
              <div class="setting-item textarea-item">
                <div class="setting-info">
                  <h3>API Key <span class="optional-badge">Optional</span></h3>
                  <p>Your own key gives unlimited usage. Leave blank to use the shared server key (subject to daily limits). Get a free API key from <strong>ai.hackclub.com</strong>.</p>
                </div>
                <div class="input-container api-key-container">
                  <input
                    v-model="customApiKey"
                    :type="showApiKey ? 'text' : 'password'"
                    placeholder="sk-... (optional)"
                    class="custom-input api-key-input"
                  />
                  <button
                    type="button"
                    class="toggle-visibility-btn"
                    @click="showApiKey = !showApiKey"
                    :aria-label="showApiKey ? 'Hide API key' : 'Show API key'"
                  >
                    <Icon :icon="showApiKey ? 'material-symbols:visibility-off' : 'material-symbols:visibility'" width="20" height="20" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Customization Tab -->
          <div v-show="currTab === 'customization'" class="settings-section">
            <div class="settings-content">
              <div class="content-header">
                <h2>Customization</h2>
                <p>Personalize your experience</p>
              </div>

              <div class="setting-item textarea-item">
                <div class="setting-info">
                  <h3>What should Nimbus call you?</h3>
                  <p>Enter your name</p>
                </div>
                <div class="input-container">
                  <input v-model="userName" type="text" placeholder="Enter your name" class="custom-input" />
                </div>
              </div>

              <div class="setting-item textarea-item">
                <div class="setting-info">
                  <h3>What occupation do you have?</h3>
                  <p>Teacher, software engineer, student, etc.</p>
                </div>
                <div class="input-container">
                  <input v-model="occupation" type="text" placeholder="Teacher, software engineer, student, etc."
                    class="custom-input" />
                </div>
              </div>

              <div class="setting-item textarea-item">
                <div class="setting-info">
                  <h3>What custom instructions do you want Nimbus to follow?</h3>
                  <p>Be precise, be witty, etc.</p>
                </div>
                <div class="input-container">
                  <textarea v-model="customInstructions" placeholder="Be precise, be witty, etc."
                    class="custom-textarea" rows="3"></textarea>
                </div>
              </div>
            </div>
          </div>

          <!-- Usage Tab -->
          <div v-show="currTab === 'usage'" class="settings-section">
            <div class="settings-content">
              <div class="content-header">
                <h2>Usage</h2>
                <p>Your global daily AI budget. Resets at midnight UTC.</p>
              </div>

              <div v-if="usageLoading" class="usage-loading">
                <Icon icon="material-symbols:refresh" width="20" height="20" class="spin-icon" />
                <span>Loading usage data…</span>
              </div>

              <!-- Not signed in -->
              <div v-else-if="usageUnauthenticated" class="usage-auth-required">
                <Icon icon="material-symbols:account-circle-outline" width="48" height="48" class="usage-auth-icon" />
                <p class="usage-auth-title">Sign in to track usage</p>
                <p class="usage-auth-sub">Google sign-in is required to use the shared server key and track your daily budget.</p>
                <a href="/auth/google" class="google-signin-btn">
                  <Icon icon="flat-color-icons:google" width="18" height="18" />
                  Sign in with Google
                </a>
              </div>

              <!-- Budget chart -->
              <div v-else class="usage-budget-section">
                <div class="budget-chart-wrapper">
                  <svg class="budget-chart" viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <linearGradient id="budgetGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stop-color="#2563eb"/>
                        <stop offset="100%" stop-color="#7c3aed"/>
                      </linearGradient>
                    </defs>
                    <!-- Track -->
                    <circle cx="70" cy="70" r="54" fill="none" stroke="var(--border)" stroke-width="12"/>
                    <!-- Progress arc -->
                    <circle
                      cx="70" cy="70" r="54"
                      fill="none"
                      :stroke="budgetArcColor"
                      stroke-width="12"
                      stroke-linecap="round"
                      :stroke-dasharray="CHART_CIRCUMFERENCE"
                      :stroke-dashoffset="CHART_CIRCUMFERENCE * (1 - usagePercentage / 100)"
                      transform="rotate(-90 70 70)"
                      style="transition: stroke-dashoffset 0.5s ease, stroke 0.4s ease;"
                    />
                  </svg>
                  <div class="budget-chart-center">
                    <span class="budget-spent">${{ usageSpend.toFixed(2) }}</span>
                    <span class="budget-of-limit">of ${{ BUDGET_USD.toFixed(2) }}</span>
                  </div>
                </div>

                <div
                  class="budget-pct-label"
                  :class="{ 'pct-warn': usagePercentage > 60, 'pct-crit': usagePercentage > 80 }"
                >
                  {{ Math.round(usagePercentage) }}% used
                </div>

                <div class="budget-detail-grid">
                  <div class="budget-detail-item">
                    <span class="budget-detail-label">Spent today</span>
                    <span class="budget-detail-value">${{ usageSpend.toFixed(4) }}</span>
                  </div>
                  <div class="budget-detail-item">
                    <span class="budget-detail-label">Remaining</span>
                    <span class="budget-detail-value">${{ Math.max(0, BUDGET_USD - usageSpend).toFixed(4) }}</span>
                  </div>
                  <div class="budget-detail-item">
                    <span class="budget-detail-label">Daily limit</span>
                    <span class="budget-detail-value">${{ BUDGET_USD.toFixed(2) }}</span>
                  </div>
                  <div class="budget-detail-item">
                    <span class="budget-detail-label">Est. tokens</span>
                    <span class="budget-detail-value">{{ usageTotalTokens.toLocaleString() }}</span>
                  </div>
                </div>
              </div>

              <div v-if="resetTimeLocal && !usageUnauthenticated && !usageLoading" class="usage-reset-row">
                <Icon icon="material-symbols:schedule" width="16" height="16" />
                <span>Resets today at {{ resetTimeLocal }} (your local time)</span>
              </div>

              <div v-if="!usageUnauthenticated && !usageLoading" class="usage-note">
                <Icon icon="material-symbols:info-outline" width="16" height="16" />
                <span>Add your own API key in <button class="inline-link" @click="currTab = 'general'">General settings</button> for unlimited usage — get a free key at <strong>ai.hackclub.com</strong>.</span>
              </div>

              <div v-if="!usageLoading" class="usage-refresh-row">
                <button class="refresh-btn" @click="loadUsageData" :disabled="usageLoading">
                  <Icon icon="material-symbols:refresh" width="16" height="16" />
                  Refresh
                </button>
              </div>
            </div>
          </div>

          <!-- Notebook Tab -->
          <div v-show="currTab === 'notebook'" class="settings-section">
            <div class="settings-content">
              <div class="content-header">
                <h2>Notebook (Preview)</h2>
                <p>Your Notebook is a document that Nimbus maintains about you. It contains observations
                  about your personality, communication style, ongoing projects, and recent activity, all stored on your device. It is used to give Nimbus context about you.</p>
              </div>

              <div class="setting-item">
                <div class="setting-info">
                  <h3>Enable Notebook</h3>
                  <p>Allow the AI to remember important facts about you across conversations</p>
                </div>
                <div class="switch-container">
                  <SwitchRoot class="switch-root" :modelValue="globalMemoryEnabled"
                    @update:modelValue="toggleGlobalMemory">
                    <SwitchThumb class="switch-thumb" />
                  </SwitchRoot>
                </div>
              </div>

              <div v-if="globalMemoryEnabled" class="notebook-actions-section">
                <div class="notebook-status" v-if="notebookMetadata">
                  <div class="status-item">
                    <span class="status-label">Last updated:</span>
                    <span class="status-value">{{ notebookMetadata.lastUpdated ? new Date(notebookMetadata.lastUpdated).toLocaleDateString() : 'Never' }}</span>
                  </div>
                  <div class="status-item">
                    <span class="status-label">Updates:</span>
                    <span class="status-value">{{ notebookMetadata.updateCount || 0 }}</span>
                  </div>
                </div>

                <div class="notebook-buttons">
                  <button @click="openNotebook" class="view-notebook-btn">
                    <Icon icon="material-symbols:book" width="18" height="18" />
                    View My Notebook
                  </button>
                </div>
                
                <div class="notebook-info">
                  <p>
                    The Notebook is automatically updated in the background based on your conversations. 
                    It typically updates once per day or when you have several new conversations.
                  </p>
                </div>
              </div>

              <div v-else class="notebook-disabled-message">
                <p>The Notebook is currently disabled. Enable it to let AI document your chats.</p>
              </div>
            </div>
          </div>

          <!-- Keybinds Tab -->
          <div v-show="currTab === 'keybinds'" class="settings-section">
            <div class="settings-content">
              <div class="content-header">
                <h2>Keyboard Shortcuts</h2>
                <p>Master Nimbus with these shortcuts</p>
              </div>

              <div class="keybind-group">
                <h3>Text Input</h3>
                <div class="keybind-list">
                  <div class="keybind-row">
                    <span class="keybind-desc">Focus text input</span>
                    <div class="keybind-keys">
                      <kbd>/</kbd>
                    </div>
                  </div>
                  <div class="keybind-row">
                    <span class="keybind-desc">New line</span>
                    <div class="keybind-keys">
                      <kbd>{{ isMac ? '⇧' : 'Shift' }}</kbd>
                      <span class="key-plus">+</span>
                      <kbd>Enter</kbd>
                    </div>
                  </div>
                </div>
              </div>

              <div class="keybind-group">
                <h3>General</h3>
                <div class="keybind-list">
                  <div class="keybind-row">
                    <span class="keybind-desc">Toggle main sidebar</span>
                    <div class="keybind-keys">
                      <kbd>{{ isMac ? '⌘' : 'Ctrl' }}</kbd>
                      <span class="key-plus">+</span>
                      <kbd>B</kbd>
                    </div>
                  </div>
                  <div class="keybind-row">
                    <span class="keybind-desc">Toggle secondary sidebar</span>
                    <div class="keybind-keys">
                      <kbd>{{ isMac ? '⌘' : 'Ctrl' }}</kbd>
                      <span class="key-plus">+</span>
                      <kbd>{{ isMac ? '⌥' : 'Alt' }}</kbd>
                      <span class="key-plus">+</span>
                      <kbd>B</kbd>
                    </div>
                  </div>
                  <div class="keybind-row">
                    <span class="keybind-desc">New chat</span>
                    <div class="keybind-keys">
                      <kbd>{{ isMac ? '⌘' : 'Ctrl' }}</kbd>
                      <span class="key-plus">+</span>
                      <kbd>{{ isMac ? '⌥' : 'Alt' }}</kbd>
                      <span class="key-plus">+</span>
                      <kbd>N</kbd>
                    </div>
                  </div>
                  <div class="keybind-row">
                    <span class="keybind-desc">Toggle incognito mode</span>
                    <div class="keybind-keys">
                      <kbd>{{ isMac ? '⌘' : 'Ctrl' }}</kbd>
                      <span class="key-plus">+</span>
                      <kbd>{{ isMac ? '⌥' : 'Alt' }}</kbd>
                      <span class="key-plus">+</span>
                      <kbd>I</kbd>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- About Tab -->
          <div v-show="currTab === 'about'" class="settings-section">
            <div class="settings-content">
              <div class="content-header">
                <h2>About</h2>
                <p>Information about Cloudsail Nimbus</p>
              </div>
              <div class="info-section">
                <p>
                  Nimbus by Cloudsail is a modern, Nuxt-powered AI interface designed for seamless interactions.
                  Built with a focus on clarity and elegance, it adapts to your workflow and preferences.
                </p>
                <p>
                  Features include:
                </p>
                <ul>
                  <li>Real-time AI conversation interface</li>
                  <li>Customizable user preferences</li>
                  <li>Persistent memory management</li>
                  <li>Dark/light mode support</li>
                  <li>Multi-provider model support via OpenRouter</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer Actions -->
      <div class="panel-footer">
        <div class="footer-actions">
          <button @click="closeSettings" class="cancel-btn">Cancel</button>
          <button @click="saveSettings" class="save-btn">Save Changes</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 1rem;
}

.settings-panel {
  background: var(--bg-primary);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-xl);
  width: 100%;
  max-width: 900px;
  height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border);
}


/* Header */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.5rem;
  border-bottom: 1px solid var(--border);
  background: var(--bg-primary);
  flex-shrink: 0;
}

.header-content h1 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  background: var(--btn-hover);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.close-btn:hover {
  background: var(--btn-hover);
  color: var(--text-primary);
}

/* Main Content Layout */
.panel-content-wrapper {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* Vertical Navigation */
.settings-nav {
  width: 200px;
  border-right: 1px solid var(--border);
  background: var(--bg-primary);
  flex-shrink: 0;
  overflow-y: auto;
}

.nav-items {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem;
}

.nav-item {
  width: 100%;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border: none;
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: var(--radius-md);
  transition: all 0.2s ease;
  font-size: 0.875rem;
  font-weight: 500;
  width: 100%;
  text-align: left;
}

.nav-link:hover {
  background: var(--btn-hover-2);
  color: var(--text-primary);
}

.nav-link.active {
  background: var(--btn-hover-2);
  color: var(--primary);
}

.nav-label {
  flex: 1;
}

/* Content Area */
.panel-content {
  flex: 1;
  overflow-y: auto;
  background: var(--bg-secondary);
}

.settings-section {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}

.content-header h2 {
  margin: 0 0 0.5rem;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
}

.content-header p {
  margin: 0 0 1.5rem;
  color: var(--text-secondary);
}

/* Settings row */
.setting-item {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 0;
  gap: 0.75rem;
}

.setting-item.textarea-item {
  flex-direction: column;
  align-items: stretch;
}

.setting-info h3 {
  margin: 0 0 0.25rem;
  font-size: 1rem;
  font-weight: 500;
  color: var(--text-primary);
}

.setting-info p {
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.setting-item.textarea-item .setting-info {
  margin-bottom: 0.5rem;
}

.input-container {
  width: 100%;
  max-width: 400px;
}

.setting-item.textarea-item .input-container {
  max-width: 400px;
}

.custom-input,
.custom-textarea {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.875rem;
  resize: vertical;
}

.custom-input:focus,
.custom-textarea:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--focus-ring);
}

/* API Key Input */
.api-key-container {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.api-key-input {
  flex: 1;
  font-family: monospace;
}

.toggle-visibility-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--border);
  background: var(--bg-primary);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.toggle-visibility-btn:hover {
  background: var(--btn-hover);
  color: var(--text-primary);
}

.switch-container {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.switch-root {
  width: 42px;
  height: 24px;
  background-color: var(--text-muted);
  border-radius: 9999px;
  position: relative;
  -webkit-tap-highlight-color: rgba(0, 0, 0, 0);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin: 0;
  transition: background-color 100ms;
}

.switch-root[data-state='checked'] {
  background-color: var(--primary-600);
}

.switch-thumb {
  width: 20px;
  height: 20px;
  background-color: var(--border);
  border-radius: 9999px;
  box-shadow: 0 2px 2px var(--black-a7);
  transition: transform 100ms;
  transform: translateX(-9px);
  will-change: transform;
  position: relative;
  z-index: 1;
}

.switch-thumb[data-state='checked'] {
  transform: translateX(9px);
}

.dark .switch-thumb {
  background-color: var(--bg-primary);
}

.switch-thumb[data-state='checked'] {
  transform: translateX(8px);
  background-color: var(--bg-primary);
}

.clear-memory-container {
  margin-top: 1.5rem;
  display: flex;
  justify-content: flex-end;
}

.clear-memory-btn {
  padding: 0 1rem;
  background: var(--destructive);
  color: var(--destructive-foreground);
  border: none;
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.clear-memory-btn:hover {
  background: var(--destructive-600);
}

/* Memory Facts List */
.memory-facts-section {
  margin-top: 1.5rem;
}

.memory-facts-section h3 {
  margin: 0 0 1rem;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
}

.memory-facts-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.memory-fact-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  transition: all 0.2s ease;
}

.memory-fact-item:hover {
  border-color: var(--primary-300);
}

.memory-fact-text {
  flex: 1;
  font-size: 0.875rem;
  color: var(--text-primary);
  word-break: break-word;
  padding-right: 1rem;
}

.delete-memory-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.delete-memory-btn:hover {
  background: var(--bg-tertiary);
  color: var(--destructive);
}

.no-memory-message,
.memory-disabled-message {
  margin-top: 1.5rem;
  padding: 1rem;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.no-memory-message p,
.memory-disabled-message p {
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-secondary);
}

/* Notebook Section Styles */
.notebook-intro {
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: var(--bg-primary);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
}

.notebook-intro p {
  margin: 0;
  font-size: 0.9375rem;
  color: var(--text-secondary);
  line-height: 1.6;
}

.notebook-actions-section {
  margin-top: 1.5rem;
}

.notebook-status {
  display: flex;
  gap: 2rem;
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: var(--bg-primary);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
}

.status-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.status-label {
  font-size: 0.75rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.status-value {
  font-size: 0.9375rem;
  font-weight: 500;
  color: var(--text-primary);
}

.notebook-buttons {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.view-notebook-btn,
.clear-notebook-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0 1rem;
  height: 40px;
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.view-notebook-btn {
  background: linear-gradient(to right, #2563eb, #7c3aed);
  color: #ffffff;
  border: none;
}

.view-notebook-btn:hover {
  background: linear-gradient(to right, #1d4ed8, #6d28d9);
}

.clear-notebook-btn {
  background: var(--bg-primary);
  color: var(--destructive);
  border: 1px solid var(--destructive);
}

.clear-notebook-btn:hover {
  background: var(--destructive);
  color: var(--destructive-foreground);
}

.notebook-info {
  padding: 1rem;
  background: var(--bg-primary);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
}

.notebook-info p {
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

.notebook-disabled-message {
  margin-top: 1.5rem;
  padding: 1rem;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.notebook-disabled-message p {
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-secondary);
}

/* Footer */
.panel-footer {
  padding: 1.25rem 1.5rem;
  border-top: 1px solid var(--border);
  background: var(--bg-primary);
  flex-shrink: 0;
}

.footer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.cancel-btn,
.save-btn {
  padding: 0 1.25rem;
  border-radius: var(--radius-md);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cancel-btn {
  background: none;
  color: var(--text-secondary);
  border: 1px solid var(--border);
}

.cancel-btn:hover {
  background: var(--btn-hover);
  color: var(--text-primary);
}

.save-btn {
  background: linear-gradient(to right, #2563eb, #7c3aed);
  color: #ffffff;
  border: none;
}

.save-btn:hover {
  background: linear-gradient(to right, #1d4ed8, #6d28d9);
}

/* Keybinds Styling */
.keybind-group {
  margin-bottom: 2rem;
}

.keybind-group h3 {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 1rem;
  opacity: 0.8;
}

.keybind-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.keybind-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.25rem;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  transition: all 0.2s ease;
}

.keybind-row:hover {
  border-color: var(--primary-a4);
  background: var(--bg-primary);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
}

.keybind-desc {
  font-size: 0.9375rem;
  color: var(--text-primary);
  font-weight: 450;
}

.keybind-keys {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  padding: 0 8px;
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1;
  color: var(--text-primary);
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 2px 0 var(--border), 0 2px 4px rgba(0, 0, 0, 0.05);
  transition: all 0.1s ease;
}

.key-plus {
  font-size: 0.875rem;
  color: var(--text-muted);
  font-weight: 500;
  margin: 0 2px;
}

/* Optional badge for API key */
.optional-badge {
  display: inline-block;
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--btn-hover-2);
  color: var(--text-secondary);
  margin-left: 8px;
  vertical-align: middle;
}

/* Usage Tab */
.usage-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 2rem 0;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.spin-icon {
  animation: spin 1s linear infinite;
}

/* Auth required state */
.usage-auth-required {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 2.5rem 1rem;
  text-align: center;
}

.usage-auth-icon {
  color: var(--text-muted);
  opacity: 0.5;
}

.usage-auth-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.usage-auth-sub {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--text-secondary);
  max-width: 300px;
  line-height: 1.5;
}

.google-signin-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  padding: 0 1.25rem;
  height: 40px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-primary);
  cursor: pointer;
  text-decoration: none;
  transition: background 0.15s, box-shadow 0.15s;
}

.google-signin-btn:hover {
  background: var(--btn-hover);
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}

/* Budget chart */
.usage-budget-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
}

.budget-chart-wrapper {
  position: relative;
  width: 180px;
  height: 180px;
  flex-shrink: 0;
}

.budget-chart {
  width: 100%;
  height: 100%;
}

.budget-chart-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.budget-spent {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.1;
}

.budget-of-limit {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  margin-top: 2px;
}

.budget-pct-label {
  font-size: 1.125rem;
  font-weight: 600;
  color: #6366f1;
  letter-spacing: -0.01em;
}

.budget-pct-label.pct-warn {
  color: #f59e0b;
}

.budget-pct-label.pct-crit {
  color: #ef4444;
}

.budget-detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  width: 100%;
  max-width: 360px;
}

.budget-detail-item {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 0.625rem 0.875rem;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.budget-detail-label {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.budget-detail-value {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary);
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
}

.usage-reset-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8125rem;
  color: var(--text-secondary);
  margin-top: 0.25rem;
  margin-bottom: 1rem;
}

.usage-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 0.875rem 1rem;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: 0.8125rem;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-bottom: 1rem;
}

.usage-note > svg {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--primary);
}

.inline-link {
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  font-size: inherit;
  font-family: inherit;
  color: var(--primary);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
  border-radius: 0;
}

.inline-link:hover {
  background: none;
  opacity: 0.8;
}

.usage-refresh-row {
  display: flex;
  justify-content: flex-end;
}

.refresh-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 1rem;
  height: 34px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.refresh-btn:hover:not(:disabled) {
  background: var(--btn-hover);
  color: var(--text-primary);
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Responsive */
@media (max-width: 768px) {
  .settings-nav {
    width: 60px;
  }

  .nav-label {
    display: none;
  }

  /* Make nav buttons smaller and center the icon */
  .nav-link {
    width: 36px;
    /* Reduced width */
    height: 36px;
    /* Reduced height, keep it square */
    padding: 0.6rem;
    /* Adjusted padding */
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0.25rem auto;
    /* Center the button within the 60px nav item */
  }

  .settings-panel {
    height: 100dvh;
  }

  .settings-overlay {
    padding: 0;
    align-items: stretch;
    justify-content: stretch;
  }

  .settings-panel {
    max-width: 100vw;
    height: 100dvh;
    border-radius: 0;
    box-shadow: none;
  }

  .settings-content {
    padding-left: 1rem;
    padding-right: 1rem;
  }

  .input-container {
    max-width: 100%;
  }
}

/* Horizontal Navigation (for tall narrow screens) */
@media (max-aspect-ratio: 2/3) {
  .panel-content-wrapper {
    flex-direction: column;
  }

  .settings-nav {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    overflow-y: hidden;
    overflow-x: auto;
  }

  .nav-items {
    flex-direction: row;
    padding: 0.25rem 0.5rem;
  }
}
</style>
