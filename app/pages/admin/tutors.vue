<script setup lang="ts">
// /admin/tutors (LLD §14.1; AU-4, AU-5, AU-7), after mockup screen 10:
// invite banner, pending invitations, tutors with remove/restore, and the
// latest audit events. Client-rendered; Convex checks the admin role on
// every call (SE-2), the middleware only keeps others off the page.
definePageMeta({ middleware: "admin", layout: "staff", title: "Tutors" });
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-[18px]">
    <AdminInviteForm />
    <div class="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div class="flex min-w-0 flex-col gap-4">
        <AdminPendingInvitations />
        <AdminTutorList />
      </div>
      <AdminAuditFeed class="self-start" />
    </div>
  </div>
</template>
