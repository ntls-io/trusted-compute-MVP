import Vue from "vue";

import VueSweetalert2 from "vue-sweetalert2";

import "sweetalert2/dist/sweetalert2.min.css";

const options = {
  customClass: {
    confirmButton: "bg-dark"
  }
};
Vue.use(VueSweetalert2, options);
