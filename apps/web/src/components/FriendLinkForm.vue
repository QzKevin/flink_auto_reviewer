<script setup lang="ts">
import { reactive, ref } from "vue";
import { submitFriendLink, type SubmitPayload, type SubmitResponse } from "../lib/api";

const emit = defineEmits<{
  submitted: [];
}>();

const form = reactive<SubmitPayload>({
  name: "",
  url: "",
  avatar: "",
  description: "",
  rss: "",
  contact: ""
});

const isSubmitting = ref(false);
const result = ref<SubmitResponse | null>(null);

function cleanPayload(): SubmitPayload {
  return {
    name: form.name.trim(),
    url: form.url.trim(),
    avatar: form.avatar?.trim() || undefined,
    description: form.description.trim(),
    rss: form.rss?.trim() || undefined,
    contact: form.contact?.trim() || undefined
  };
}

async function handleSubmit() {
  isSubmitting.value = true;
  result.value = null;

  try {
    const response = await submitFriendLink(cleanPayload());
    result.value = response;

    if (response.ok) {
      form.name = "";
      form.url = "";
      form.avatar = "";
      form.description = "";
      form.rss = "";
      form.contact = "";
      emit("submitted");
    }
  } catch (error) {
    result.value = {
      ok: false,
      message: error instanceof Error ? error.message : "提交失败，请稍后再试。"
    };
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <form class="form-panel" @submit.prevent="handleSubmit">
    <div class="section-heading">
      <p class="eyebrow">SUBMIT / INTAKE</p>
      <h2>提交你的友链</h2>
      <p>通过表单提交后，系统会创建一个待审核 PR；人工 12 小时内未处理时，巡检 Action 会自动复核并合并。</p>
    </div>

    <label>
      <span><em>01</em> 站点名称</span>
      <input v-model="form.name" type="text" required maxlength="60" placeholder="例如：Kayin Blog" />
    </label>

    <label>
      <span><em>02</em> 站点地址</span>
      <input v-model="form.url" type="url" required placeholder="https://example.com" />
    </label>

    <label>
      <span><em>03</em> 头像地址</span>
      <input v-model="form.avatar" type="url" placeholder="https://example.com/avatar.png" />
    </label>

    <label>
      <span><em>04</em> 一句话介绍</span>
      <textarea v-model="form.description" required maxlength="120" placeholder="简单介绍你的站点内容"></textarea>
    </label>

    <div class="field-grid">
      <label>
        <span><em>05</em> RSS 地址</span>
        <input v-model="form.rss" type="url" placeholder="https://example.com/feed.xml" />
      </label>

      <label>
        <span><em>06</em> 联系方式</span>
        <input v-model="form.contact" type="text" maxlength="120" placeholder="邮箱 / GitHub ID" />
      </label>
    </div>

    <button class="primary-button" :disabled="isSubmitting" type="submit">
      <span>{{ isSubmitting ? "提交中..." : "提交友链" }}</span>
      <small>{{ isSubmitting ? "PENDING" : "CREATE PR" }}</small>
    </button>

    <div v-if="result" class="result-box" :class="{ success: result.ok, error: !result.ok }" role="status">
      <strong>{{ result.ok ? "提交已受理" : "提交未通过" }}</strong>
      <p>{{ result.message }}</p>
      <p v-if="result.submissionId">提交编号：{{ result.submissionId }}</p>
      <ul v-if="result.errors?.length">
        <li v-for="error in result.errors" :key="error">{{ error }}</li>
      </ul>
    </div>
  </form>
</template>
