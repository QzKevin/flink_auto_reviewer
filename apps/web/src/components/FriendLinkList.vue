<script setup lang="ts">
import type { FriendLink } from "../lib/api";

defineProps<{
  friends: FriendLink[];
  loading: boolean;
  error: string;
}>();
</script>

<template>
  <section class="list-panel">
    <div class="section-heading">
      <p class="eyebrow">Directory</p>
      <h2>已收录友链</h2>
      <p>这里直接读取仓库中的 <code>data/friends.json</code>，合并后的友链会在下一次部署后展示。</p>
    </div>

    <div v-if="loading" class="empty-state">正在读取友链列表...</div>
    <div v-else-if="error" class="empty-state error">{{ error }}</div>
    <div v-else-if="!friends.length" class="empty-state">当前还没有友链。</div>

    <div v-else class="friend-grid">
      <a v-for="friend in friends" :key="friend.url" class="friend-card" :href="friend.url" target="_blank" rel="noreferrer">
        <img v-if="friend.avatar" :src="friend.avatar" :alt="`${friend.name} avatar`" loading="lazy" />
        <div v-else class="avatar-fallback">{{ friend.name.slice(0, 1).toUpperCase() }}</div>
        <div>
          <h3>{{ friend.name }}</h3>
          <p>{{ friend.description }}</p>
          <span>{{ friend.url }}</span>
        </div>
      </a>
    </div>
  </section>
</template>
