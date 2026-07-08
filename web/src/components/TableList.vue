<script setup>
defineProps({
  tables: { type: Array, default: () => [] },
  selected: { type: String, default: null },
});
defineEmits(["select"]);
</script>

<template>
  <div class="tablelist">
    <div class="section-title">表 / 视图 · {{ tables.length }}</div>
    <ul class="tl-items">
      <li
        v-for="t in tables"
        :key="t.name"
        :class="{ active: t.name === selected }"
        :title="t.name"
        @click="$emit('select', t.name)"
      >
        <span class="tl-name">{{ t.name }}</span>
        <span v-if="t.type === 'view'" class="tl-badge">视图</span>
        <span v-if="t.rows !== null" class="tl-count">{{ t.rows.toLocaleString() }}</span>
      </li>
    </ul>
    <div v-if="tables.length === 0" class="tl-empty">（无表）</div>
  </div>
</template>
