<script setup lang="ts">
// Confirmation for destructive admin actions (remove tutor, cancel
// invitation, delete attempts). Focus starts on the safe button.
const open = defineModel<boolean>("open", { required: true });

defineProps<{
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
}>();

const emit = defineEmits<{ confirm: [] }>();
</script>

<template>
  <UModal v-model:open="open" :title="title" :description="description" :dismissible="!busy">
    <template #footer>
      <div class="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <UButton
          color="neutral"
          variant="soft"
          :label="cancelLabel ?? 'Keep it'"
          :disabled="busy"
          autofocus
          @click="open = false"
        />
        <UButton color="error" :label="confirmLabel" :loading="busy" @click="emit('confirm')" />
      </div>
    </template>
  </UModal>
</template>
