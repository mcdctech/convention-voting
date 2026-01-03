<script setup lang="ts">
import { ref, onMounted } from "vue";
import HelloWorld from "./components/HelloWorld.vue";

const apiMessage = ref<string>("");
const loading = ref(true);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    const response = await fetch("/api/example");
    if (!response.ok) {
      throw new Error("Failed to fetch from API");
    }
    const data = await response.json();
    apiMessage.value = data.message;
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Unknown error";
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="app">
    <header>
      <h1>MCDC Convention Voting System</h1>
    </header>

    <main>
      <HelloWorld />

      <section class="api-test">
        <h2>API Connection Test</h2>
        <div v-if="loading">Loading...</div>
        <div v-else-if="error" class="error">Error: {{ error }}</div>
        <div v-else class="success">
          {{ apiMessage }}
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.app {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
  font-family:
    system-ui,
    -apple-system,
    sans-serif;
}

header {
  text-align: center;
  margin-bottom: 2rem;
}

h1 {
  color: #2c3e50;
}

.api-test {
  margin-top: 2rem;
  padding: 1rem;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
}

.error {
  color: #d32f2f;
}

.success {
  color: #388e3c;
}
</style>
