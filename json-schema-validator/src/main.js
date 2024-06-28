import Vue from 'vue'
import Validate from "@/json-schema-validator.vue";

Vue.config.productionTip = false

new Vue({
  el: '#app',
  components: {
    Validate
  },
  template: '<Validate />'
})
