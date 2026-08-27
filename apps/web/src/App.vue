<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import FriendLinkForm from "./components/FriendLinkForm.vue";
import FriendLinkList from "./components/FriendLinkList.vue";
import { fetchFriendLinks, type FriendLink } from "./lib/api";

const friends = ref<FriendLink[]>([]);
const loading = ref(true);
const error = ref("");

const workflowSteps = [
  { id: "01", label: "表单提交", meta: "Intake" },
  { id: "02", label: "创建 PR", meta: "Branch" },
  { id: "03", label: "等待 12 小时", meta: "Review" },
  { id: "04", label: "自动审核合并", meta: "Merge" }
];

const totalLinks = computed(() => friends.value.length);
const submittedLinks = computed(() => friends.value.filter((friend) => friend.source === "submitted").length);
const manualLinks = computed(() => friends.value.filter((friend) => friend.source === "manual").length);
const lastSync = computed(() => {
  const timestamps = friends.value
    .map((friend) => new Date(friend.createdAt).getTime())
    .filter((timestamp) => Number.isFinite(timestamp));

  if (!timestamps.length) {
    return "等待部署";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(Math.max(...timestamps)));
});

async function loadFriends() {
  loading.value = true;
  error.value = "";

  try {
    friends.value = await fetchFriendLinks();
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : "友链列表读取失败";
  } finally {
    loading.value = false;
  }
}

onMounted(loadFriends);
</script>

<template>
  <main class="ark-shell" data-ark-theme="endfield" data-ark-depth="complex">
    <aside class="edge-rail" aria-label="页面分区">
      <a class="rail-mark" href="#top" aria-label="返回顶部">FL</a>
      <nav class="rail-nav" aria-label="友链审核导航">
        <a href="#submit-section"><span>01</span><strong>提交</strong></a>
        <a href="#directory-section"><span>02</span><strong>目录</strong></a>
      </nav>
      <p class="rail-status">AUTO REVIEW / 12H</p>
    </aside>

    <header id="top" class="utility-dock">
      <div>
        <span class="dock-label">Friend Link Auto Reviewer</span>
        <strong>自动审核演示站</strong>
      </div>
      <div class="dock-state" aria-label="当前系统状态">
        <span></span>
        Workflow online
      </div>
    </header>

    <section class="field-stage" aria-labelledby="page-title">
      <div class="stage-grid" aria-hidden="true"></div>
      <div class="stage-sector" aria-hidden="true"></div>
      <div class="stage-calibrator" aria-hidden="true"></div>

      <div class="hero-copy">
        <p class="eyebrow">FIELD REVIEW SYSTEM / 01</p>
        <h1 id="page-title">
          <span>友链自动审核</span>
          <span>演示站</span>
        </h1>
        <p>
          访客提交信息后触发 GitHub Actions 创建 PR。人工审核保留 12 小时窗口，超时后由定时巡检自动复核并合并。
        </p>
      </div>

      <dl class="mission-board" aria-label="友链审核状态概览">
        <div>
          <dt>收录</dt>
          <dd>{{ totalLinks }}</dd>
        </div>
        <div>
          <dt>提交来源</dt>
          <dd>{{ submittedLinks }}</dd>
        </div>
        <div>
          <dt>手动导入</dt>
          <dd>{{ manualLinks }}</dd>
        </div>
        <div>
          <dt>最后同步</dt>
          <dd>{{ lastSync }}</dd>
        </div>
      </dl>

      <ol class="status-strip" aria-label="Workflow steps">
        <li v-for="step in workflowSteps" :key="step.id">
          <span>{{ step.id }}</span>
          <strong>{{ step.label }}</strong>
          <em>{{ step.meta }}</em>
        </li>
      </ol>
    </section>

    <section class="workspace" aria-label="友链提交与收录工作区">
      <FriendLinkForm id="submit-section" @submitted="loadFriends" />
      <FriendLinkList id="directory-section" :friends="friends" :loading="loading" :error="error" />
    </section>
  </main>
</template>
