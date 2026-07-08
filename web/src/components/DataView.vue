<script setup>
const props = defineProps({
  table: { type: String, default: null },
  data: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  pageSize: { type: Number, default: 50 },
});
const emit = defineEmits(["goto", "page-size"]);

function prev() {
  if (props.data && props.data.page > 1) emit("goto", props.data.page - 1);
}
function next() {
  if (props.data && props.data.page < props.data.pageCount) emit("goto", props.data.page + 1);
}
function cell(val) {
  return val === null ? "NULL" : String(val);
}
</script>

<template>
  <div class="dataview">
    <div v-if="!table" class="dv-placeholder">
      <div class="dv-placeholder-icon">🗄️</div>
      <div>选择左侧的表以查看数据</div>
    </div>

    <template v-else>
      <div class="dv-header">
        <div class="dv-title">{{ table }}</div>
        <div v-if="data" class="dv-pager">
          <label class="dv-pagesize">
            每页
            <select :value="pageSize" @change="$emit('page-size', Number($event.target.value))">
              <option :value="25">25</option>
              <option :value="50">50</option>
              <option :value="100">100</option>
              <option :value="200">200</option>
            </select>
          </label>
          <button class="btn" :disabled="data.page <= 1" @click="prev">‹ 上一页</button>
          <span class="dv-pageinfo">
            第 {{ data.page }} / {{ data.pageCount }} 页 · 共 {{ data.total.toLocaleString() }} 行
          </span>
          <button class="btn" :disabled="data.page >= data.pageCount" @click="next">下一页 ›</button>
        </div>
      </div>

      <div class="dv-grid-wrap">
        <div v-if="loading" class="dv-loading">加载中…</div>

        <table v-else-if="data" class="dv-grid">
          <thead>
            <tr>
              <th class="dv-rownum">#</th>
              <th v-for="c in data.columns" :key="c.name">
                <span class="dv-col-name">{{ c.name }}</span>
                <span v-if="c.type" class="dv-col-type">{{ c.type }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in data.rows" :key="i">
              <td class="dv-rownum">{{ (data.page - 1) * data.pageSize + i + 1 }}</td>
              <td
                v-for="(val, j) in row"
                :key="j"
                :class="{ 'is-null': val === null }"
                :title="cell(val)"
              >
                {{ cell(val) }}
              </td>
            </tr>
          </tbody>
        </table>

        <div v-if="data && data.rows.length === 0 && !loading" class="dv-empty">
          该表没有数据
        </div>
      </div>
    </template>
  </div>
</template>
