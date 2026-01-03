<script setup lang="ts">
import { ref } from "vue";
import type { User } from "@mcdc-convention-voting/shared";

const count = ref(0);

// Example of using shared types
const exampleUser: User = {
  id: "1",
  username: "exampleuser",
  voterId: "VOTER123",
  firstName: "Example",
  lastName: "User",
  isAdmin: false,
  isDisabled: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};
</script>

<template>
  <div class="hello">
    <h2>Welcome to Vue 3 + TypeScript</h2>
    <p>This client is using shared types from the monorepo.</p>
    <p>Example user: {{ exampleUser.username }} (ID: {{ exampleUser.id }})</p>

    <div class="counter">
      <button @click="count++">Count is: {{ count }}</button>
    </div>
  </div>
</template>

<style scoped>
.hello {
  padding: 1.5rem;
  background-color: #f5f5f5;
  border-radius: 8px;
  margin-bottom: 1rem;
}

h2 {
  color: #42b983;
}

.counter {
  margin-top: 1rem;
}

button {
  background-color: #42b983;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
}

button:hover {
  background-color: #35a372;
}
</style>
