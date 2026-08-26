<script setup lang="ts">
import { onMounted, ref } from "vue";
import FriendLinkForm from "./components/FriendLinkForm.vue";
import FriendLinkList from "./components/FriendLinkList.vue";
import { fetchFriendLinks, type FriendLink } from "./lib/api";

const friends = ref<FriendLink[]>([]);
const loading = ref(true);
const error = ref("");

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
  <main>
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">Friend Link Auto Reviewer</p>
        <h1>友链自动审核演示站</h1>
        <p>
          访客提交信息后触发 GitHub Actions 创建 PR。人工审核保留 12 小时窗口，超时后由定时巡检自动复核并合并。
        </p>
      </div>

      <div class="status-strip" aria-label="Workflow steps">
        <span>表单提交</span>
        <span>创建 PR</span>
        <span>等待 12 小时</span>
        <span>自动审核合并</span>
      </div>
    </section>

    <section class="workspace">
      <FriendLinkForm @submitted="loadFriends" />
      <FriendLinkList :friends="friends" :loading="loading" :error="error" />
    </section>
  </main>
</template>
