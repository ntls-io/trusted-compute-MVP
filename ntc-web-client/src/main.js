import Vue from "vue";
import App from "./App.vue";
import router from "./router";
import store from "./store";
import plugins from "./plugins";
import configs from "./configs";

import "@/assets/styles/custom.scss";

Vue.config.productionTip = false;

new Vue({
  router,
  store,
  plugins,
  configs,
  render: h => h(App)
}).$mount("#app");
