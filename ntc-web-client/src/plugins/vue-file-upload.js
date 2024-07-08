import Vue from "vue";
import Upload from "@websanova/vue-upload/dist/v2/vue-upload.esm.js";
import driverHttpAxios from "@websanova/vue-upload/dist/drivers/http/axios.esm.js";

Vue.use(Upload, {
  plugins: {
    http: Vue.axios
  },
  drivers: {
    http: driverHttpAxios
  },
  options: {}
});
