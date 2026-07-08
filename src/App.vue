<script setup>
import { onMounted, onUnmounted, ref } from "vue";
import { api } from "./api.js";
import TableList from "./components/TableList.vue";
import DataView from "./components/DataView.vue";

// 当前打开的文件、表列表、选中的表、右侧数据、分页大小等状态
const dbPath = ref(null);
const tables = ref([]);
const selected = ref(null);
const data = ref(null);
const loading = ref(false);
const error = ref("");
const pageSize = ref(50);

// 保存事件取消订阅函数，组件卸载时清理
let unlisten = [];

// 收到 Rust 端「数据库已打开」事件后，刷新界面
function applyOpened(payload) {
  dbPath.value = payload.path;
  tables.value = payload.tables;
  selected.value = null;
  data.value = null;
  error.value = "";
}

async function selectTable(name) {
  selected.value = name;
  await loadRows(1);
}

// 调用 Rust 的 get_rows 取某一页数据
async function loadRows(page) {
  if (!selected.value) return;
  loading.value = true;
  error.value = "";
  try {
    data.value = await api.rows(selected.value, page, pageSize.value);
  } catch (e) {
    error.value = String(e);
    data.value = null;
  } finally {
    loading.value = false;
  }
}

function changePageSize(n) {
  pageSize.value = n;
  loadRows(1);
}

onMounted(async () => {
  // 打开数据库这件事完全由顶部原生菜单驱动，这里只需监听结果事件
  unlisten.push(await api.onDbOpened(applyOpened));
  unlisten.push(await api.onDbError((msg) => (error.value = msg)));
});

onUnmounted(() => unlisten.forEach((off) => off && off()));
</script>

<template>
  <div class="app">
    <!-- 顶部只保留「当前打开哪个文件」的指示，打开操作走菜单栏 -->
    <header class="toolbar">
      <span class="db-indicator" :class="{ muted: !dbPath }" :title="dbPath || ''">
        <span class="db-dot" :class="{ on: dbPath }"></span>
        {{ dbPath || "未打开数据库" }}
      </span>
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
