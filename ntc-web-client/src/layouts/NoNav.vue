<template>
  <div id="default" class="d-flex flex-column">
    <div class="my-auto pt-5">
      <slot />
    </div>
    <div class="mb-3">
      <Footer />
    </div>
  </div>
</template>

<script>
import Footer from "@/components/Layout/Footer";

export default {
  components: {
    Footer
  }
};
</script>

<style lang="scss" scoped>
#default {
  min-height: 100vh;
}
</style>
