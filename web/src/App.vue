<script setup>
import { onMounted, ref } from "vue";
import { api } from "./api.js";
import TableList from "./components/TableList.vue";
import DataView from "./components/DataView.vue";

// When running inside the native app, a real macOS menu bar provides "Open" /
// "Open Recent", so the in-page button is hidden. In a plain browser (dev) it
// stays, for convenience.
const hasNativeMenu = !!window.__NATIVE_MENU__;

const dbPath = ref(null);
const tables = ref([]);
const selected = ref(null);
const data = ref(null);
const loading = ref(false);
const error = ref("");
const pageSize = ref(50);

// Push the recent list into the native menu (no-op in a browser).
function syncMenu(recent) {
  if (window.syncRecentMenu) window.syncRecentMenu(recent ?? []);
}

function applyOpened(res) {
  dbPath.value = res.path;
  tables.value = res.tables;
  selected.value = null;
  data.value = null;
  syncMenu(res.recent);
}

async function refreshState() {
  try {
    const s = await api.state();
    dbPath.value = s.path;
    tables.value = s.tables;
    syncMenu(s.recent);
  } catch (e) {
    error.value = e.message;
  }
}

async function openDb() {
  error.value = "";
  try {
    const res = await api.open();
    if (!res.canceled) applyOpened(res);
  } catch (e) {
    error.value = e.message;
  }
}

async function openPath(path) {
  error.value = "";
  try {
    const res = await api.openPath(path);
    if (!res.canceled) applyOpened(res);
  } catch (e) {
    error.value = e.message;
  }
}

async function clearRecent() {
  try {
    const res = await api.clearRecent();
    syncMenu(res.recent);
  } catch (e) {
    error.value = e.message;
  }
}

async function selectTable(name) {
  selected.value = name;
  await loadRows(1);
}

async function loadRows(page) {
  if (!selected.value) return;
  loading.value = true;
  error.value = "";
  try {
    data.value = await api.rows(selected.value, page, pageSize.value);
  } catch (e) {
    error.value = e.message;
    data.value = null;
  } finally {
    loading.value = false;
  }
}

function changePageSize(n) {
  pageSize.value = n;
  loadRows(1);
}

onMounted(() => {
  // Expose actions for the native menu to call via webview.eval(...).
  window.__app_open = openDb;
  window.__app_openPath = openPath;
  window.__app_clearRecent = clearRecent;
  refreshState();
});
</script>

<template>
  <div class="app">
    <header class="toolbar">
      <span class="db-indicator" :class="{ muted: !dbPath }" :title="dbPath || ''">
        <span class="db-dot" :class="{ on: dbPath }"></span>
        {{ dbPath || "未打开数据库" }}
      </span>
      <button v-if="!hasNativeMenu" class="btn" @click="openDb">打开数据库…</button>
    </header>

    <div v-if="error" class="error-bar">{{ error }}</div>

    <main class="body">
      <aside class="sidebar">
        <TableList :tables="tables" :selected="selected" @select="selectTable" />
      </aside>
      <section class="content">
        <div v-if="!dbPath" class="no-db">
          <div class="no-db-icon">🗄️</div>
          <div class="no-db-title">还没有打开数据库</div>
          <div class="no-db-hint">
            从菜单栏「文件 → 打开…」<span class="kbd">⌘O</span> 选择一个 SQLite 文件
          </div>
          <button v-if="!hasNativeMenu" class="btn primary" @click="openDb">打开数据库…</button>
        </div>
        <DataView
          v-else
          :table="selected"
          :data="data"
          :loading="loading"
          :page-size="pageSize"
          @goto="loadRows"
          @page-size="changePageSize"
        />
      </section>
    </main>
  </div>
</template>
