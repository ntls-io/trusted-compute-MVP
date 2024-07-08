<template>
  <div class="wrapper">
    <Navbar />
    <Sidebar />
    <div class="content-wrapper">
      <div class="content">
        <slot />
      </div>
    </div>
    <div id="sidebar-overlay" @click="collapse()"></div>
  </div>
</template>

<script>
import Navbar from "@/components/Layout/Navbar";
import Sidebar from "@/components/Layout/Sidebar";
import pushMenu from "@/mixins/PushMenu";

export default {
  props: ["menu"],
  mixins: [pushMenu],
  components: {
    Navbar,
    Sidebar
  }
};
</script>
